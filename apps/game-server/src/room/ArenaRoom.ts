import { randomInt } from 'node:crypto';
import { CloseCode, Room, ServerError, matchMaker, type Client } from 'colyseus';
import {
  JoinOptionsSchema,
  MSG,
  PROTOCOL_VERSION,
  type JoinOptions,
} from '@xiangqi-arena/game-protocol';
import { generateRoomCode } from '@xiangqi-arena/shared';
import { RoomController, type FinishedMatchInfo, type RoomTimings } from './RoomController';
import { logger } from '../logger';

export interface ArenaRoomDeps {
  onMatchFinished?: (info: FinishedMatchInfo) => void;
  timings?: Partial<RoomTimings>;
  reconnectSeconds?: number;
  /** 所有玩家離線多久後關閉房間 */
  idleDisposeMs?: number;
}

/** 由 index.ts 注入的共用相依（持久化等） */
export const arenaRoomDeps: ArenaRoomDeps = {};

const secureRandom = (max: number): number => randomInt(max);

export class ArenaRoom extends Room {
  override maxClients = 4;
  override autoDispose = false;
  private controller!: RoomController;
  private idleSince: number | null = null;

  override async onCreate(options: unknown): Promise<void> {
    this.roomId = await this.uniqueCode();
    const parsed = JoinOptionsSchema.partial().safeParse(options);
    this.controller = new RoomController({
      roomCode: this.roomId,
      now: () => Date.now(),
      random: secureRandom,
      send: (clientId, channel, payload) => {
        this.clients.getById(clientId)?.send(channel, payload);
      },
      onMatchFinished: arenaRoomDeps.onMatchFinished,
      timings: arenaRoomDeps.timings,
    });
    if (parsed.success) this.controller.configureInitial(parsed.data.mode, parsed.data.timeControl);

    this.onMessage(MSG.intent, (client, message) => {
      this.controller.handleMessage(client.sessionId, message);
    });
    // 吞掉未知頻道，避免例外
    this.onMessage('*', () => undefined);

    this.clock.setInterval(() => this.tick(), 250);
    logger.info({ room: this.roomId }, 'room created');
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateRoomCode(secureRandom);
      const existing = await matchMaker.query({ roomId: code });
      if (existing.length === 0) return code;
    }
    throw new ServerError(500, 'ROOM_CODE_EXHAUSTED');
  }

  override onAuth(_client: Client, options: unknown): JoinOptions {
    const parsed = JoinOptionsSchema.safeParse(options);
    if (!parsed.success) {
      const proto = (options as { protocol?: unknown } | null)?.protocol;
      if (proto !== PROTOCOL_VERSION) throw new ServerError(4400, 'PROTOCOL_MISMATCH');
      throw new ServerError(4400, 'INVALID_JOIN_OPTIONS');
    }
    if (!this.controller.canJoin(parsed.data.playerToken)) {
      throw new ServerError(4403, 'ROOM_FULL');
    }
    return parsed.data;
  }

  override onJoin(client: Client, _options: unknown, auth: JoinOptions): void {
    const result = this.controller.join(client.sessionId, auth);
    if (!result.ok) {
      client.leave(4403, 'ROOM_FULL');
      return;
    }
    if (result.replacedClientId) {
      this.clients.getById(result.replacedClientId)?.leave(4409, 'REPLACED');
    }
    this.idleSince = null;
  }

  override async onDrop(client: Client): Promise<void> {
    this.controller.drop(client.sessionId);
    try {
      await this.allowReconnection(client, arenaRoomDeps.reconnectSeconds ?? 60);
    } catch {
      // 重連逾時：onLeave 會接手
    }
  }

  override onReconnect(client: Client): void {
    this.controller.reconnect(client.sessionId);
    const seat = this.controller.seatOfClient(client.sessionId);
    this.controller.sendSnapshot(client.sessionId, seat);
  }

  override onLeave(client: Client, code?: number): void {
    this.controller.leave(client.sessionId, code === CloseCode.CONSENTED);
  }

  private tick(): void {
    this.controller.tick();
    const now = Date.now();
    if (this.controller.hasConnectedPlayers) {
      this.idleSince = null;
      return;
    }
    this.idleSince ??= now;
    if (now - this.idleSince > (arenaRoomDeps.idleDisposeMs ?? 10 * 60_000)) {
      logger.info({ room: this.roomId }, 'disposing idle room');
      void this.disconnect();
    }
  }

  override onDispose(): void {
    logger.info({ room: this.roomId }, 'room disposed');
  }
}
