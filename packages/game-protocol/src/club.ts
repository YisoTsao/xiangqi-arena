import { z } from 'zod';

/**
 * 暮光遊樂館的大廳連線協定：同一間俱樂部裡的人互相看得到、看得到誰坐在哪張桌子，還能聊天。
 * 和對局房間（arena）分開：大廳只轉送位置與聊天，不決定任何遊戲結果。
 */
export const CLUB_ROOM_NAME = 'club';
export const CLUB_PROTOCOL_VERSION = 1;

export const CLUB_MSG = {
  /** client → server */
  move: 'club:move',
  seat: 'club:seat',
  chat: 'club:chat',
  rename: 'club:rename',
  /** server → client */
  welcome: 'club:welcome',
  joined: 'club:joined',
  left: 'club:left',
  states: 'club:states',
  updated: 'club:updated',
  chatMessage: 'club:chatMessage',
  denied: 'club:denied',
} as const;

export const CLUB_NAME_MAX = 16;
export const CLUB_CHAT_MAX = 200;
export const CLUB_CHAT_HISTORY = 50;

/** 桌子 id：1F 麻將桌 table-N（4 人）、2F 棋桌 chess-N（2 人）、2F 撲克圓桌 cards-N（4 人） */
export const ClubTableIdSchema = z.string().regex(/^(table|chess|cards)-[1-9][0-9]?$/);

export function clubTableCapacity(tableId: string): number {
  return tableId.startsWith('chess-') ? 2 : 4;
}

/** 名字：去掉控制字元與角括號，最多 16 字 */
export function cleanClubName(raw: string): string {
  return raw
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, CLUB_NAME_MAX);
}

export function cleanClubText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, CLUB_CHAT_MAX);
}

export const ClubColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Coord = z.number().finite().min(-500).max(500);

export const ClubJoinOptionsSchema = z.object({
  protocol: z.literal(CLUB_PROTOCOL_VERSION),
  name: z.string().max(64).optional(),
  /** 這個視窗自己選好的角色顏色（#rrggbb）；省略就由伺服器分配 */
  color: ClubColorSchema.optional(),
});
export type ClubJoinOptions = z.infer<typeof ClubJoinOptionsSchema>;

/** 每格送出的位置；x、z 與前端 player.pos 同一套世界座標 */
export const ClubMoveSchema = z.object({
  floor: z.number().int().min(1).max(9),
  x: Coord,
  z: Coord,
  yaw: z.number().finite(),
  moving: z.boolean(),
  /** 按住 Shift 或點很遠的地方：跑步動畫 */
  running: z.boolean().optional(),
});
export type ClubMove = z.infer<typeof ClubMoveSchema>;

export const ClubSeatSchema = z.object({ tableId: ClubTableIdSchema.nullable() });

export const ClubChatSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(CLUB_CHAT_MAX * 2),
  /** 私聊對象的 id；省略就是公開 */
  to: z.string().min(1).max(64).optional(),
});

export const ClubRenameSchema = z.object({ name: z.string().min(1).max(64) });

export interface ClubPlayer extends ClubMove {
  id: string;
  name: string;
  /** 角色主色（#rrggbb），由伺服器分配，同一間俱樂部裡盡量不重複 */
  color: string;
  tableId: string | null;
  /** 在桌上的座位（0 起算） */
  seat: number | null;
}

export type ClubState = Pick<ClubPlayer, 'id' | 'floor' | 'x' | 'z' | 'yaw' | 'moving' | 'running'>;

export interface ClubChatMessage {
  id: string;
  at: number;
  from: string;
  fromName: string;
  fromColor: string;
  text: string;
  /** 私聊才有 */
  to?: string;
  toName?: string;
}

export interface ClubWelcome {
  you: string;
  players: ClubPlayer[];
  history: ClubChatMessage[];
}

export type ClubDenied = { reason: 'table-full' | 'rate-limited' | 'no-such-player' };

/** 角色配色：伺服器依序分配沒人用的顏色 */
export const CLUB_COLORS = [
  '#8552B8',
  '#E95B4B',
  '#4E816F',
  '#F2B552',
  '#3B7DD8',
  '#D96BA0',
  '#5BB8C9',
  '#9A6B3F',
  '#7DBA4C',
  '#C24A8A',
  '#6C6FD8',
  '#E48B3A',
] as const;
