'use client';

import { create } from 'zustand';
import { Client, type Room } from '@colyseus/sdk';
import {
  AckSchema,
  MSG,
  NoticeSchema,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  type ClientIntent,
  type Notice,
  type RoomSnapshot,
  type TimeControlId,
} from '@xiangqi-arena/game-protocol';
import type { ConnectionStatus, IntentInput } from '../controller';
import { toBigTwoSnapshot } from '../bigTwo';
import { errorMessage } from '../games';
import { toXiangqiSnapshot } from '../xiangqi';
import { getPlayerName, getPlayerToken } from '../identity';
import { toast } from '../toast';
import { randomId } from '../utils';
import { gameServerUrl } from './serverUrl';

const ROOM_NAME = 'arena';
const CLOSE_CONSENTED = 4000;
const CLOSE_REPLACED = 4409;

interface OnlineState {
  status: ConnectionStatus;
  error: string | null;
  roomCode: string | null;
  /** 平台欄位已驗證，遊戲欄位也已用該遊戲的 schema 驗證過 */
  snapshot: RoomSnapshot | null;
  snapshotAt: number;
  createRoom: (gameId: string, mode: string, timeControl?: TimeControlId) => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  send: (intent: IntentInput) => void;
  leave: () => Promise<void>;
  retry: () => Promise<void>;
}

let client: Client | null = null;
let room: Room | null = null;
let inflight: Promise<unknown> | null = null;
let rejoinTimer: ReturnType<typeof setTimeout> | null = null;
/** 每次 leave() 加一；連線途中玩家已離開時，晚到的房間要直接退掉 */
let session = 0;

const getClient = () => (client ??= new Client(gameServerUrl()));

const NOTICE_TEXT: Partial<Record<Notice['kind'], (who: string) => string>> = {
  drawOffered: (who) => `${who}提議和棋`,
  drawDeclined: (who) => `${who}拒絕了和棋`,
  rematchRequested: (who) => `${who}想再來一局`,
  playerJoined: (who) => `${who}已加入房間`,
  playerLeft: (who) => `${who}離開了房間`,
  playerDisconnected: (who) => `${who}連線中斷，等待重新連線…`,
  playerReconnected: (who) => `${who}已重新連線`,
};

/** 兩人遊戲稱「對手」，多人遊戲用座位上的名字 */
function noticeSubject(snapshot: RoomSnapshot | null, seat: number | null): string {
  if (!snapshot || snapshot.seats.length <= 2 || seat === null) return '對手';
  return `${snapshot.seats[seat]?.name ?? '玩家'} `;
}

/** 依房間的遊戲驗證遊戲欄位；未知遊戲或格式不符回傳 false */
function validForGame(snapshot: RoomSnapshot): boolean {
  switch (snapshot.config.gameId) {
    case 'xiangqi':
      return toXiangqiSnapshot(snapshot) !== null;
    case 'big-two':
      return toBigTwoSnapshot(snapshot) !== null;
    default:
      return false;
  }
}

function describeJoinError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/ROOM_FULL/.test(msg)) return '房間已滿，或對局已經開始';
  if (/PROTOCOL_MISMATCH/.test(msg)) return '版本不相容，請重新整理頁面';
  if (/UNKNOWN_GAME/.test(msg)) return '找不到這個遊戲';
  if (/not found|invalid room|ROOM_NOT_FOUND/i.test(msg)) return '找不到這個房間，請確認房間代碼';
  if (/ECONNREFUSED|Failed to fetch|NetworkError|fetch failed|offline/i.test(msg)) {
    return '無法連線到遊戲伺服器';
  }
  return `連線失敗：${msg}`;
}

export const useOnline = create<OnlineState>((set, get) => {
  const bind = (r: Room) => {
    room = r;
    try {
      r.reconnection.minUptime = 1000;
      r.reconnection.maxRetries = 8;
    } catch {
      /* 舊版 SDK 無此設定 */
    }
    r.onMessage(MSG.snapshot, (raw: unknown) => {
      const parsed = RoomSnapshotSchema.safeParse(raw);
      const snapshot = parsed.success && validForGame(parsed.data) ? parsed.data : null;
      if (!snapshot) {
        console.warn('invalid snapshot', parsed.error);
        return;
      }
      set({
        snapshot,
        snapshotAt: performance.now(),
        status: 'connected',
        error: null,
      });
    });
    r.onMessage(MSG.ack, (raw: unknown) => {
      const ack = AckSchema.safeParse(raw);
      if (!ack.success || ack.data.ok || !ack.data.error) return;
      if (ack.data.error === 'DUPLICATE') return;
      toast(errorMessage(ack.data.error), 'error');
      if (ack.data.error === 'STALE_VERSION') get().send({ type: 'sync' });
    });
    r.onMessage(MSG.notice, (raw: unknown) => {
      const n = NoticeSchema.safeParse(raw);
      if (!n.success) return;
      const text = NOTICE_TEXT[n.data.kind];
      if (text) toast(text(noticeSubject(get().snapshot, n.data.seat)));
    });
    r.onDrop(() => set({ status: 'reconnecting' }));
    r.onReconnect(() => {
      set({ status: 'connected' });
      get().send({ type: 'sync' });
    });
    r.onLeave((code) => {
      if (room !== r) return;
      room = null;
      if (code === CLOSE_CONSENTED) {
        set({ status: 'idle' });
      } else if (code === CLOSE_REPLACED) {
        set({ status: 'replaced', error: '這個對局已在其他分頁或裝置開啟' });
      } else {
        scheduleRejoin(0);
      }
    });
  };

  /** SDK 自動重連失敗後，改用 token 重新加入（伺服器會還原座位） */
  const scheduleRejoin = (attempt: number) => {
    const code = get().roomCode;
    if (!code) return;
    if (attempt >= 6) {
      set({ status: 'offline', error: '與伺服器的連線中斷' });
      return;
    }
    set({ status: 'reconnecting' });
    if (rejoinTimer) clearTimeout(rejoinTimer);
    const current = session;
    rejoinTimer = setTimeout(
      async () => {
        try {
          const r = await getClient().joinById(code, joinOptions());
          if (!adopt(r, current)) return;
          bind(r);
        } catch (e) {
          if (current !== session) return;
          const msg = describeJoinError(e);
          if (/找不到|已滿/.test(msg)) set({ status: 'error', error: msg });
          else scheduleRejoin(attempt + 1);
        }
      },
      Math.min(8000, 500 * 2 ** attempt),
    );
  };

  /** 連線完成時玩家若已離開，就把這個房間退掉，避免背景殘留連線 */
  const adopt = (r: Room, current: number): boolean => {
    if (current === session) return true;
    void r.leave(true).catch(() => undefined);
    return false;
  };

  const joinOptions = () => ({
    protocol: PROTOCOL_VERSION,
    playerToken: getPlayerToken(),
    name: getPlayerName(),
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (get().status === 'offline') void get().retry();
    });
  }

  return {
    status: 'idle',
    error: null,
    roomCode: null,
    snapshot: null,
    snapshotAt: 0,

    async createRoom(gameId, mode, timeControl) {
      if (inflight) await inflight.catch(() => undefined);
      set({ status: 'connecting', error: null, snapshot: null });
      const current = session;
      const p = getClient().create(ROOM_NAME, {
        ...joinOptions(),
        gameId,
        mode,
        timeControl,
      });
      inflight = p;
      try {
        const r = await p;
        if (!adopt(r, current)) return null;
        set({ roomCode: r.roomId });
        bind(r);
        return r.roomId;
      } catch (e) {
        if (current === session) set({ status: 'error', error: describeJoinError(e) });
        return null;
      } finally {
        inflight = null;
      }
    },

    async joinRoom(code) {
      if (room && get().roomCode === code) return true;
      if (inflight) {
        await inflight.catch(() => undefined);
        if (room && get().roomCode === code) return true;
      }
      if (room) await get().leave();
      set({ status: 'connecting', error: null, roomCode: code, snapshot: null });
      const current = session;
      const p = getClient().joinById(code, joinOptions());
      inflight = p;
      try {
        const r = await p;
        if (!adopt(r, current)) return false;
        bind(r);
        return true;
      } catch (e) {
        if (current === session) set({ status: 'error', error: describeJoinError(e) });
        return false;
      } finally {
        inflight = null;
      }
    },

    send(intent) {
      if (!room) {
        toast('尚未連線', 'error');
        return;
      }
      const version = get().snapshot?.game?.version ?? 0;
      let message: ClientIntent;
      switch (intent.type) {
        case 'action':
          message = {
            type: 'action',
            actionId: randomId(16),
            expectedVersion: version,
            action: intent.action,
          };
          break;
        case 'resign':
        case 'offerDraw':
        case 'rematch':
          message = { type: intent.type, actionId: randomId(16) };
          break;
        case 'respondDraw':
          message = { type: 'respondDraw', actionId: randomId(16), accept: intent.accept };
          break;
        default:
          message = intent;
      }
      room.send(MSG.intent, message);
    },

    async leave() {
      session++;
      if (rejoinTimer) clearTimeout(rejoinTimer);
      const r = room;
      room = null;
      set({ status: 'idle', snapshot: null, roomCode: null, error: null });
      if (r) await r.leave(true).catch(() => undefined);
    },

    async retry() {
      const code = get().roomCode;
      if (!code) return;
      room = null;
      await get().joinRoom(code);
    },
  };
});
