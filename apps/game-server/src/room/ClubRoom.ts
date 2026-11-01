import { randomUUID } from 'node:crypto';
import { Room, ServerError, matchMaker, type Client } from 'colyseus';
import {
  CLUB_CHAT_HISTORY,
  CLUB_COLORS,
  CLUB_MSG,
  CLUB_PROTOCOL_VERSION,
  ClubChatSchema,
  ClubJoinOptionsSchema,
  ClubMoveSchema,
  ClubRenameSchema,
  ClubSeatSchema,
  cleanClubName,
  cleanClubText,
  clubTableCapacity,
  clubTableGame,
  type ClubChatMessage,
  type ClubDenied,
  type ClubPlayer,
  type ClubState,
  type ClubTableRoom,
  type ClubWelcome,
} from '@xiangqi-arena/game-protocol';
import { TokenBucket } from './rateLimit';
import { logger } from '../logger';

/** 1F 大門口外（與前端 layout.SPAWN 一致） */
const SPAWN = { floor: 1, x: 0, z: 2.2, yaw: Math.PI, moving: false } as const;

/** 對局房間的名稱（與 server.ts 的 ROOM_NAME 一致；寫在這裡避免循環匯入） */
const ARENA_ROOM_NAME = 'arena';

export interface ClubRoomDeps {
  /** 斷線後保留角色的秒數 */
  reconnectSeconds?: number;
  maxClients?: number;
}
export const clubRoomDeps: ClubRoomDeps = {};

interface Member {
  player: ClubPlayer;
  moveBucket: TokenBucket;
  chatBucket: TokenBucket;
  dirty: boolean;
}

/**
 * 俱樂部大廳：沒有登入，一個瀏覽器視窗就是一個角色。
 * 伺服器只轉送位置、座位與聊天；位置每 100ms 打包一次送給所有人。
 */
export class ClubRoom extends Room {
  private members = new Map<string, Member>();
  private history: ClubChatMessage[] = [];
  private guestNo = 0;
  /** 有人坐著的桌子 → 對局房間代碼（開桌中還沒建好的不在這裡） */
  private tableRooms = new Map<string, string>();
  /** 正在替哪些桌子開房間（避免同時坐下的兩個人各開一間） */
  private opening = new Set<string>();

  override onCreate(): void {
    this.maxClients = clubRoomDeps.maxClients ?? 60;

    this.onMessage(CLUB_MSG.move, (client, raw) => this.onMove(client, raw));
    this.onMessage(CLUB_MSG.seat, (client, raw) => this.onSeat(client, raw));
    this.onMessage(CLUB_MSG.chat, (client, raw) => this.onChat(client, raw));
    this.onMessage(CLUB_MSG.rename, (client, raw) => this.onRename(client, raw));
    this.onMessage('*', () => undefined);

    this.clock.setInterval(() => this.flush(), 100);
    logger.info({ room: this.roomId }, 'club room created');
  }

  override onAuth(_client: Client, options: unknown) {
    const parsed = ClubJoinOptionsSchema.safeParse(options);
    if (!parsed.success) {
      const proto = (options as { protocol?: unknown } | null)?.protocol;
      if (proto !== CLUB_PROTOCOL_VERSION) throw new ServerError(4400, 'PROTOCOL_MISMATCH');
      throw new ServerError(4400, 'INVALID_JOIN_OPTIONS');
    }
    return parsed.data;
  }

  override onJoin(
    client: Client,
    _options: unknown,
    auth: { name?: string; color?: string },
  ): void {
    const name = cleanClubName(auth.name ?? '') || `訪客${++this.guestNo}`;
    const player: ClubPlayer = {
      id: client.sessionId,
      name,
      color: auth.color?.toLowerCase() ?? this.pickColor(),
      ...SPAWN,
      tableId: null,
      seat: null,
    };
    this.members.set(client.sessionId, {
      player,
      moveBucket: new TokenBucket(40, 25),
      chatBucket: new TokenBucket(5, 1),
      dirty: false,
    });
    client.send(CLUB_MSG.welcome, this.welcome(client.sessionId));
    this.broadcast(CLUB_MSG.joined, player, { except: client });
  }

  override async onDrop(client: Client): Promise<void> {
    try {
      await this.allowReconnection(client, clubRoomDeps.reconnectSeconds ?? 10);
    } catch {
      // 逾時：onLeave 接手
    }
  }

  override onReconnect(client: Client): void {
    client.send(CLUB_MSG.welcome, this.welcome(client.sessionId));
  }

  override onLeave(client: Client): void {
    const m = this.members.get(client.sessionId);
    if (!m) return;
    this.members.delete(client.sessionId);
    this.broadcast(CLUB_MSG.left, { id: client.sessionId });
    if (m.player.tableId) this.syncTable(m.player.tableId);
  }

  private welcome(you: string): ClubWelcome {
    return {
      you,
      players: [...this.members.values()].map((m) => m.player),
      history: this.history,
      tables: Object.fromEntries(this.tableRooms),
    };
  }

  private seatedCount(tableId: string): number {
    let n = 0;
    for (const m of this.members.values()) if (m.player.tableId === tableId) n++;
    return n;
  }

  /**
   * 桌子有人坐、還沒有對局房間：開一間（第一個坐下的人等於開桌）；
   * 桌子沒人了：收掉代碼，下一個坐下的人重新開桌。舊房間沒人連線，會自己閒置關閉。
   */
  private syncTable(tableId: string): void {
    const n = this.seatedCount(tableId);
    if (n === 0) {
      if (this.tableRooms.delete(tableId)) {
        this.broadcast(CLUB_MSG.table, { tableId, code: null } satisfies ClubTableRoom);
      }
      return;
    }
    if (this.tableRooms.has(tableId) || this.opening.has(tableId)) return;
    this.opening.add(tableId);
    const { gameId, mode } = clubTableGame(tableId);
    void matchMaker
      .createRoom(ARENA_ROOM_NAME, { gameId, mode })
      .then((room) => {
        this.opening.delete(tableId);
        // 開房間的這段時間裡大家都站起來了：不登記，房間沒人會自己關掉
        if (this.seatedCount(tableId) === 0) return;
        this.tableRooms.set(tableId, room.roomId);
        this.broadcast(CLUB_MSG.table, { tableId, code: room.roomId } satisfies ClubTableRoom);
      })
      .catch((e: unknown) => {
        this.opening.delete(tableId);
        logger.warn({ err: e, tableId }, 'failed to open table room');
      });
  }

  private pickColor(): string {
    const used = new Map<string, number>();
    for (const m of this.members.values())
      used.set(m.player.color, (used.get(m.player.color) ?? 0) + 1);
    let best: string = CLUB_COLORS[0];
    let bestN = Infinity;
    for (const c of CLUB_COLORS) {
      const n = used.get(c) ?? 0;
      if (n < bestN) {
        best = c;
        bestN = n;
      }
    }
    return best;
  }

  private deny(client: Client, reason: ClubDenied['reason']): void {
    client.send(CLUB_MSG.denied, { reason } satisfies ClubDenied);
  }

  private onMove(client: Client, raw: unknown): void {
    const m = this.members.get(client.sessionId);
    const parsed = ClubMoveSchema.safeParse(raw);
    if (!m || !parsed.success || !m.moveBucket.take(Date.now())) return;
    Object.assign(m.player, parsed.data);
    m.dirty = true;
  }

  private onSeat(client: Client, raw: unknown): void {
    const m = this.members.get(client.sessionId);
    const parsed = ClubSeatSchema.safeParse(raw);
    if (!m || !parsed.success) return;
    const { tableId } = parsed.data;
    if (tableId === m.player.tableId) return;
    let seat: number | null = null;
    if (tableId) {
      const taken = new Set<number>();
      for (const o of this.members.values()) {
        if (o !== m && o.player.tableId === tableId && o.player.seat !== null)
          taken.add(o.player.seat);
      }
      const cap = clubTableCapacity(tableId);
      for (let i = 0; i < cap; i++) {
        if (!taken.has(i)) {
          seat = i;
          break;
        }
      }
      if (seat === null) {
        this.deny(client, 'table-full');
        return;
      }
    }
    const prev = m.player.tableId;
    m.player.tableId = tableId;
    m.player.seat = seat;
    this.broadcast(CLUB_MSG.updated, m.player);
    if (prev) this.syncTable(prev);
    if (tableId) this.syncTable(tableId);
  }

  private onRename(client: Client, raw: unknown): void {
    const m = this.members.get(client.sessionId);
    const parsed = ClubRenameSchema.safeParse(raw);
    if (!m || !parsed.success || !m.chatBucket.take(Date.now())) return;
    const name = cleanClubName(parsed.data.name);
    if (!name || name === m.player.name) return;
    m.player.name = name;
    this.broadcast(CLUB_MSG.updated, m.player);
  }

  private onChat(client: Client, raw: unknown): void {
    const m = this.members.get(client.sessionId);
    const parsed = ClubChatSchema.safeParse(raw);
    if (!m || !parsed.success) return;
    const text = cleanClubText(parsed.data.text);
    if (!text) return;
    if (!m.chatBucket.take(Date.now())) {
      this.deny(client, 'rate-limited');
      return;
    }
    const msg: ClubChatMessage = {
      id: randomUUID(),
      at: Date.now(),
      from: m.player.id,
      fromName: m.player.name,
      fromColor: m.player.color,
      text,
    };
    const to = parsed.data.to;
    if (to) {
      const target = this.members.get(to);
      const targetClient = this.clients.getById(to);
      if (!target || !targetClient || to === m.player.id) {
        this.deny(client, 'no-such-player');
        return;
      }
      msg.to = to;
      msg.toName = target.player.name;
      targetClient.send(CLUB_MSG.chatMessage, msg);
      client.send(CLUB_MSG.chatMessage, msg);
      return;
    }
    this.history.push(msg);
    if (this.history.length > CLUB_CHAT_HISTORY) this.history.shift();
    this.broadcast(CLUB_MSG.chatMessage, msg);
  }

  /** 把這 100ms 內有動的人打包送出 */
  private flush(): void {
    const states: ClubState[] = [];
    for (const m of this.members.values()) {
      if (!m.dirty) continue;
      m.dirty = false;
      const { id, floor, x, z, yaw, moving, running } = m.player;
      states.push({ id, floor, x, z, yaw, moving, running });
    }
    if (states.length) this.broadcast(CLUB_MSG.states, states);
  }

  override onDispose(): void {
    logger.info({ room: this.roomId }, 'club room disposed');
  }
}
