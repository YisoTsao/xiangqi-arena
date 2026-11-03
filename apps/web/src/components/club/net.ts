'use client';

import { create } from 'zustand';
import { Client, type Room } from '@colyseus/sdk';
import {
  CLUB_MSG,
  CLUB_PROTOCOL_VERSION,
  CLUB_ROOM_NAME,
  cleanClubName,
  clubTableCapacity,
  type ClubChatMessage,
  type ClubDenied,
  type ClubPlayer,
  type ClubState,
  type ClubTableRoom,
  type ClubWelcome,
} from '@xiangqi-arena/game-protocol';
import { gameServerUrl } from '@/lib/net/serverUrl';
import { ALL_INTERACTABLES } from './layout';
import { player, useClub } from './store';

/**
 * 俱樂部大廳連線：沒有登入，一個瀏覽器視窗（分頁）就是一個角色。
 * - 名字存在 sessionStorage：重新整理還是同一個名字，另開視窗就是另一個人
 * - 位置每 100ms 有變才送；別人的位置放在 remotes（每格讀，不進 React state）
 * - 名單、座位、聊天放在 zustand，UI 依它重畫
 */

const NAME_KEY = 'xa:clubName';
const SEND_MS = 100;
const CHAT_KEEP = 200;
/** 頭上對白泡泡顯示多久 */
export const BUBBLE_MS = 6000;

export type ClubNetStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

/** 別人的角色：目標位置來自伺服器，畫面位置每格往目標內插 */
export interface RemoteEntry {
  floor: number;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  running?: boolean;
  /** Avatar 每格讀的動作狀態 */
  sitting?: boolean;
  /** 畫面上的位置（RemotePlayers 每格更新） */
  rx: number;
  rz: number;
  rfloor: number;
}
export const remotes = new Map<string, RemoteEntry>();

interface ClubNetState {
  status: ClubNetStatus;
  you: string | null;
  /** 所有人（含自己），位置欄位只是加入時的快照，即時位置看 remotes */
  players: Record<string, ClubPlayer>;
  /** 有人坐著的桌子 → 對局房間代碼 */
  tableRooms: Record<string, string>;
  messages: ClubChatMessage[];
  /** 頭上的對白泡泡：id → 最近一句公開聊天 */
  bubbles: Record<string, { text: string; at: number }>;
  chatOpen: boolean;
  unread: number;
  /** 私聊對象；null = 公開 */
  chatTarget: string | null;
  /** 還沒連上伺服器時打的訊息：連上後自動送出（最多 OUTBOX_MAX 則） */
  outbox: PendingChat[];
  setChatOpen: (open: boolean) => void;
  setChatTarget: (id: string | null) => void;
  sendChat: (text: string) => boolean;
  rename: (name: string) => void;
}

/** 離線時先排著的訊息 */
export interface PendingChat {
  id: string;
  text: string;
  to?: string;
  toName?: string;
}
/** 伺服器聊天限流一次最多 5 則，排隊的不超過這個數，連上後一次送完才不會被擋 */
export const OUTBOX_MAX = 5;

export const useClubNet = create<ClubNetState>((set, get) => ({
  status: 'idle',
  you: null,
  players: {},
  tableRooms: {},
  messages: [],
  bubbles: {},
  chatOpen: false,
  unread: 0,
  chatTarget: null,
  outbox: [],
  setChatOpen: (chatOpen) => {
    set(chatOpen ? { chatOpen, unread: 0 } : { chatOpen });
    // 打開聊天時若還連不上，馬上再試一次，不用等退避計時器
    if (chatOpen) retryNow();
  },
  setChatTarget: (chatTarget) => set({ chatTarget }),
  sendChat: (raw) => {
    const text = raw.trim();
    if (!text) return false;
    const { chatTarget: to, players } = get();
    const target = to ? players[to] : undefined;
    if (room && get().status === 'online') {
      room.send(CLUB_MSG.chat, target ? { text, to: target.id } : { text });
      return true;
    }
    // 還沒連上（伺服器剛睡醒、網路斷線）：先排著，連上後自動送出；輸入框永遠可以打字
    if (get().outbox.length >= OUTBOX_MAX) {
      systemLine('還沒連上伺服器，訊息先排著，連上後再說吧。');
      return false;
    }
    set((s) => ({
      outbox: [
        ...s.outbox,
        {
          id: `out-${Date.now()}-${Math.random()}`,
          text,
          ...(target ? { to: target.id, toName: target.name } : {}),
        },
      ],
    }));
    retryNow();
    return true;
  },
  rename: (raw) => {
    const name = cleanClubName(raw);
    if (!name) return;
    writeSession(NAME_KEY, name);
    room?.send(CLUB_MSG.rename, { name });
  },
}));

/** 每張桌子目前坐了哪些人 */
export function seatedAt(players: Record<string, ClubPlayer>, tableId: string): ClubPlayer[] {
  return Object.values(players)
    .filter((p) => p.tableId === tableId)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
}

export function isTableFull(tableId: string): boolean {
  const { players, you } = useClubNet.getState();
  const others = seatedAt(players, tableId).filter((p) => p.id !== you);
  return others.length >= clubTableCapacity(tableId);
}

const TOKEN_KEY = 'xa:clubToken';

/**
 * 在俱樂部桌上對局用的身分：一個分頁一個（和角色一樣），重新整理後不變，
 * 所以同一台電腦開兩個視窗坐同一桌也是兩個不同的玩家，斷線重整也拿得回座位。
 */
export function clubIdentity(): { token: string; name: string } {
  let token = readSession(TOKEN_KEY);
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.charAt(b % 64),
    ).join('');
    writeSession(TOKEN_KEY, token);
  }
  const { players, you } = useClubNet.getState();
  const name = (you && players[you]?.name) || readSession(NAME_KEY) || '訪客';
  return { token, name: name.replace(/[<>\u0000-\u001f]/g, '').slice(0, 16) || '訪客' };
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* 無痕或停用儲存空間：只是重新整理後換名字 */
  }
}

let room: Room | null = null;
let client: Client | null = null;
let users = 0;
let sendTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
let unsubSeat: (() => void) | null = null;
let lastSent = '';
/** 每次完全離開加一；連線途中已離開的話，晚到的房間要直接退掉 */
let generation = 0;
let connecting = false;

function upsertRemote(p: ClubState): void {
  const r = remotes.get(p.id);
  if (r) {
    Object.assign(r, {
      floor: p.floor,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      moving: p.moving,
      running: p.running ?? false,
    });
  } else {
    remotes.set(p.id, {
      floor: p.floor,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      moving: p.moving,
      running: p.running ?? false,
      rx: p.x,
      rz: p.z,
      rfloor: p.floor,
    });
  }
}

function bind(r: Room): void {
  room = r;
  try {
    r.reconnection.minUptime = 1000;
    r.reconnection.maxRetries = 6;
  } catch {
    /* 舊版 SDK 無此設定 */
  }
  r.onMessage(CLUB_MSG.welcome, (w: ClubWelcome) => {
    retries = 0;
    remotes.clear();
    const players: Record<string, ClubPlayer> = {};
    for (const p of w.players) {
      players[p.id] = p;
      if (p.id !== w.you) upsertRemote(p);
    }
    const me = players[w.you];
    if (me) writeSession(NAME_KEY, me.name);
    // 重新連上時，把目前的座位告訴伺服器
    lastSent = '';
    const table = useClub.getState().seatedAt;
    if (table) r.send(CLUB_MSG.seat, { tableId: table });
    useClubNet.setState((s) => ({
      status: 'online',
      you: w.you,
      players,
      tableRooms: { ...(w.tables ?? {}) },
      // 重連時保留已收到的私聊，公開紀錄以伺服器為準
      messages: mergeMessages(w.history, s.messages),
    }));
    flushOutbox(r);
  });
  r.onMessage(CLUB_MSG.joined, (p: ClubPlayer) => {
    upsertRemote(p);
    useClubNet.setState((s) => ({ players: { ...s.players, [p.id]: p } }));
  });
  r.onMessage(CLUB_MSG.updated, (p: ClubPlayer) => {
    useClubNet.setState((s) => ({ players: { ...s.players, [p.id]: p } }));
  });
  r.onMessage(CLUB_MSG.table, ({ tableId, code }: ClubTableRoom) => {
    useClubNet.setState((s) => {
      const { [tableId]: _old, ...rest } = s.tableRooms;
      return { tableRooms: code ? { ...rest, [tableId]: code } : rest };
    });
  });
  r.onMessage(CLUB_MSG.left, ({ id }: { id: string }) => {
    remotes.delete(id);
    useClubNet.setState((s) => {
      const { [id]: _gone, ...players } = s.players;
      const { [id]: _b, ...bubbles } = s.bubbles;
      return {
        players,
        bubbles,
        chatTarget: s.chatTarget === id ? null : s.chatTarget,
      };
    });
  });
  r.onMessage(CLUB_MSG.states, (states: ClubState[]) => {
    const you = useClubNet.getState().you;
    for (const p of states) if (p.id !== you) upsertRemote(p);
  });
  r.onMessage(CLUB_MSG.chatMessage, (m: ClubChatMessage) => {
    if (useClubNet.getState().messages.some((x) => x.id === m.id)) return;
    useClubNet.setState((s) => ({
      messages: [...s.messages, m].slice(-CHAT_KEEP),
      unread: s.chatOpen || m.from === s.you ? s.unread : s.unread + 1,
      bubbles: m.to ? s.bubbles : { ...s.bubbles, [m.from]: { text: m.text, at: Date.now() } },
    }));
  });
  r.onMessage(CLUB_MSG.denied, ({ reason }: ClubDenied) => {
    const club = useClub.getState();
    const table = ALL_INTERACTABLES.find((x) => x.id === club.seatedAt);
    if (reason === 'table-full' && club.mode === 'seated' && table) {
      // 別人比你早一步坐下：站起來說明
      club.stand(table.approach);
      club.say('系統', '這桌剛好坐滿了，換一張吧！');
    } else if (reason === 'rate-limited') {
      systemLine('訊息送太快了，休息一下再說。');
    } else if (reason === 'no-such-player') {
      systemLine('對方已經離開了。');
    }
  });
  r.onDrop(() => useClubNet.setState({ status: 'reconnecting' }));
  r.onReconnect(() => {
    useClubNet.setState({ status: 'online' });
    flushOutbox(r);
  });
  r.onLeave(() => {
    if (room !== r) return;
    room = null;
    remotes.clear();
    useClubNet.setState({
      status: users > 0 ? 'reconnecting' : 'idle',
      players: {},
      tableRooms: {},
      you: null,
    });
    if (users > 0) scheduleRetry();
  });
}

/** 連上之後把離線時打的訊息送出去（私聊對象已經離開的話改成公開） */
function flushOutbox(r: Room): void {
  const { outbox, players } = useClubNet.getState();
  if (outbox.length === 0) return;
  useClubNet.setState({ outbox: [] });
  for (const m of outbox) {
    r.send(CLUB_MSG.chat, m.to && players[m.to] ? { text: m.text, to: m.to } : { text: m.text });
  }
}

/** 使用者正在等（打開聊天、送出訊息）：不等退避計時器，馬上重連 */
function retryNow(): void {
  if (room || connecting || users === 0) return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retries = 0;
  void connect();
}

function mergeMessages(history: ClubChatMessage[], current: ClubChatMessage[]): ClubChatMessage[] {
  const seen = new Set(history.map((m) => m.id));
  const kept = current.filter((m) => !seen.has(m.id) && (m.to || m.from === 'system'));
  return [...history, ...kept].sort((a, b) => a.at - b.at).slice(-CHAT_KEEP);
}

function systemLine(text: string): void {
  const m: ClubChatMessage = {
    id: `sys-${Date.now()}-${Math.random()}`,
    at: Date.now(),
    from: 'system',
    fromName: '系統',
    fromColor: '#F2B552',
    text,
  };
  useClubNet.setState((s) => ({ messages: [...s.messages, m].slice(-CHAT_KEEP) }));
}

function scheduleRetry(): void {
  if (retryTimer || users === 0) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(retries, 5));
  retries++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, delay);
}

async function connect(): Promise<void> {
  if (room || connecting || users === 0) return;
  connecting = true;
  const gen = generation;
  useClubNet.setState((s) => ({ status: s.status === 'idle' ? 'connecting' : s.status }));
  try {
    client ??= new Client(gameServerUrl());
    const name = readSession(NAME_KEY) ?? undefined;
    // 角色若已有自己的顏色（每個分頁隨機一色），就用它，別人看到的跟自己看到的一樣
    const color = /^#[0-9a-fA-F]{6}$/.test(player.color) ? player.color : undefined;
    const r = await client.joinOrCreate(CLUB_ROOM_NAME, {
      protocol: CLUB_PROTOCOL_VERSION,
      name,
      color,
    });
    if (gen !== generation || users === 0) {
      void r.leave(true).catch(() => undefined);
      return;
    }
    bind(r);
  } catch {
    if (gen !== generation) return;
    useClubNet.setState({ status: 'offline' });
    scheduleRetry();
  } finally {
    connecting = false;
  }
}

/** 位置有變才送；坐著、在標題畫面時也照送（別人看得到你站在哪） */
function sendState(): void {
  if (!room) return;
  const { floor } = useClub.getState();
  const msg = {
    floor,
    x: Math.round(player.pos[0] * 100) / 100,
    z: Math.round(player.pos[1] * 100) / 100,
    yaw: Math.round(player.yaw * 100) / 100,
    moving: player.moving,
    running: player.moving && player.running,
  };
  const key = JSON.stringify(msg);
  if (key === lastSent) return;
  lastSent = key;
  room.send(CLUB_MSG.move, msg);
}

/** 關掉分頁：馬上告訴伺服器離開，別人不用等斷線重連逾時才看到你消失 */
function onPageHide(): void {
  if (room) void room.leave(true).catch(() => undefined);
}
/** 從上一頁快取回來：重新連上 */
function onPageShow(e: PageTransitionEvent): void {
  if (e.persisted && !room) void connect();
}

/** ClubScreen 掛載時呼叫；回傳的函式在卸載時呼叫 */
export function joinClubLobby(): () => void {
  users++;
  if (users === 1) {
    void connect();
    sendTimer = setInterval(sendState, SEND_MS);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    let prev = useClub.getState().seatedAt;
    unsubSeat = useClub.subscribe((s) => {
      if (s.seatedAt === prev) return;
      prev = s.seatedAt;
      room?.send(CLUB_MSG.seat, { tableId: s.seatedAt });
    });
  }
  return () => {
    users--;
    if (users > 0) return;
    generation++;
    connecting = false;
    if (sendTimer) clearInterval(sendTimer);
    if (retryTimer) clearTimeout(retryTimer);
    sendTimer = retryTimer = null;
    unsubSeat?.();
    unsubSeat = null;
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    const r = room;
    room = null;
    remotes.clear();
    useClubNet.setState({
      status: 'idle',
      players: {},
      tableRooms: {},
      you: null,
      bubbles: {},
      outbox: [],
    });
    if (r) void r.leave(true).catch(() => undefined);
  };
}
