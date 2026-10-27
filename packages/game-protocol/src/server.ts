import { z } from 'zod';
import {
  ErrorCodeSchema,
  GameIdSchema,
  MAX_SEATS,
  ModeIdSchema,
  ReasonSchema,
  SeatSchema,
  TimeControlIdSchema,
} from './common';

export const OutcomeViewSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('win'), winner: SeatSchema, reason: ReasonSchema }),
  z.object({ type: z.literal('draw'), reason: ReasonSchema }),
]);
export type OutcomeView = z.infer<typeof OutcomeViewSchema>;

/**
 * 對局畫面中平台負責的欄位。遊戲自己的欄位（棋盤、手牌…）會合併在同一個物件，
 * 協定層原樣放行，由前端的遊戲模組用自己的 schema 驗證。
 */
export const MatchViewBaseSchema = z.looseObject({
  gameId: GameIdSchema,
  mode: ModeIdSchema,
  /** 對局版本：每次成功操作 +1，客戶端送出行動時需附上 */
  version: z.number().int().min(0),
  /** 現在可以行動的座位 */
  activeSeats: z.array(SeatSchema).max(MAX_SEATS),
  /** 只有一個座位可行動時的那個座位 */
  turnSeat: SeatSchema.nullable(),
  outcome: OutcomeViewSchema.nullable(),
});
export type MatchViewBase = z.infer<typeof MatchViewBaseSchema>;

export const SeatViewSchema = z.object({
  name: z.string(),
  connected: z.boolean(),
  ready: z.boolean(),
});
export type SeatView = z.infer<typeof SeatViewSchema>;

export const ClockViewSchema = z.object({
  remainingMs: z.array(z.number()).max(MAX_SEATS),
  running: SeatSchema.nullable(),
  incrementMs: z.number(),
});
export type ClockView = z.infer<typeof ClockViewSchema>;

export const RoomSnapshotSchema = z.object({
  roomCode: z.string(),
  roomVersion: z.number().int(),
  phase: z.enum(['lobby', 'playing', 'ended']),
  hostSeat: SeatSchema,
  yourSeat: SeatSchema.nullable(),
  /** 長度 = 遊戲的 players.max；null = 空位 */
  seats: z.array(SeatViewSchema.nullable()).max(MAX_SEATS),
  config: z.object({ gameId: GameIdSchema, mode: ModeIdSchema, timeControl: TimeControlIdSchema }),
  matchNumber: z.number().int(),
  clock: ClockViewSchema.nullable(),
  drawOfferSeat: SeatSchema.nullable(),
  rematchVotes: z.array(z.boolean()).max(MAX_SEATS),
  game: MatchViewBaseSchema.nullable(),
  /** 斷線座位的自動判負期限（伺服器時間戳差值，毫秒） */
  abandonDeadlineMs: z.array(z.number().nullable()).max(MAX_SEATS),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const AckSchema = z.object({
  actionId: z.string().nullable(),
  intent: z.string(),
  ok: z.boolean(),
  error: ErrorCodeSchema.optional(),
});
export type Ack = z.infer<typeof AckSchema>;

export const NoticeSchema = z.object({
  kind: z.enum([
    'drawOffered',
    'drawDeclined',
    'rematchRequested',
    'playerJoined',
    'playerLeft',
    'playerDisconnected',
    'playerReconnected',
    'replacedByNewConnection',
  ]),
  seat: SeatSchema.nullable(),
});
export type Notice = z.infer<typeof NoticeSchema>;
