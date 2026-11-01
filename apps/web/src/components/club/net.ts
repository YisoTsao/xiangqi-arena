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
  type ClubWelcome,
} from '@xiangqi-arena/game-protocol';
import { gameServerUrl } from '@/lib/net/serverUrl';
import type { Outfit } from './Character';
import { PLAYER_OUTFIT } from './Character';
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
  messages: ClubChatMessage[];
  /** 頭上的對白泡泡：id → 最近一句公開聊天 */
  bubbles: Record<string, { text: string; at: number }>;
  chatOpen: boolean;
  unread: number;
  /** 私聊對象；null = 公開 */
  chatTarget: string | null;
  setChatOpen: (open: boolean) => void;
  setChatTarget: (id: string | null) => void;
  sendChat: (text: string) => boolean;
  rename: (name: string) => void;
}

export const useClubNet = create<ClubNetState>((set, get) => ({
  status: 'idle',
  you: null,
  players: {},
  messages: [],
  bubbles: {},
  chatOpen: false,
  unread: 0,
  chatTarget: null,
  setChatOpen: (chatOpen) => set(chatOpen ? { chatOpen, unread: 0 } : { chatOpen }),
  setChatTarget: (chatTarget) => set({ chatTarget }),
  sendChat: (raw) => {
    const text = raw.trim();
    if (!text || !room) return false;
    const to = get().chatTarget;
    room.send(CLUB_MSG.chat, to && get().players[to] ? { text, to } : { text });
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

/** 依玩家主色換掉預設角色的帽子與上衣顏色 */
export function outfitForColor(color: string): Outfit {
  return { ...PLAYER_OUTFIT, hat: color, stripe: color, shirt: mix(color, '#ffffff', 0.55) };
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) =>
    Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
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
    Object.assign(r, { floor: p.floor, x: p.x, z: p.z, yaw: p.yaw, moving: p.moving });
  } else {
    remotes.set(p.id, { ...p, rx: p.x, rz: p.z, rfloor: p.floor });
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
      // 重連時保留已收到的私聊，公開紀錄以伺服器為準
      messages: mergeMessages(w.history, s.messages),
    }));
  });
  r.onMessage(CLUB_MSG.joined, (p: ClubPlayer) => {
    upsertRemote(p);
    useClubNet.setState((s) => ({ players: { ...s.players, [p.id]: p } }));
  });
  r.onMessage(CLUB_MSG.updated, (p: ClubPlayer) => {
    useClubNet.setState((s) => ({ players: { ...s.players, [p.id]: p } }));
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
  r.onReconnect(() => useClubNet.setState({ status: 'online' }));
  r.onLeave(() => {
    if (room !== r) return;
    room = null;
    remotes.clear();
    useClubNet.setState({ status: users > 0 ? 'reconnecting' : 'idle', players: {}, you: null });
    if (users > 0) scheduleRetry();
  });
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
    const own = (player as { color?: unknown }).color;
    const color = typeof own === 'string' && /^#[0-9a-fA-F]{6}$/.test(own) ? own : undefined;
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
    useClubNet.setState({ status: 'idle', players: {}, you: null, bubbles: {} });
    if (r) void r.leave(true).catch(() => undefined);
  };
}
