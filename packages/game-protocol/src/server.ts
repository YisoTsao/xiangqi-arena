import { z } from 'zod';
import {
  DrawReasonSchema,
  ErrorCodeSchema,
  GameModeSchema,
  PieceKindSchema,
  SeatSchema,
  SideSchema,
  SquareSchema,
  TimeControlIdSchema,
  WinReasonSchema,
} from './common';
import { GameActionSchema } from './client';

const PieceRefSchema = z.object({ side: SideSchema, kind: PieceKindSchema });

/** 棋盤格：null = 空；faceUp=false 時「不含」身分資訊 */
export const CellViewSchema = z.union([
  z.null(),
  z.object({ id: z.string(), faceUp: z.literal(false) }).strict(),
  z
    .object({ id: z.string(), faceUp: z.literal(true), side: SideSchema, kind: PieceKindSchema })
    .strict(),
]);
export type CellView = z.infer<typeof CellViewSchema>;

export const LastActionSchema = z.object({
  ply: z.number().int(),
  seat: SeatSchema,
  kind: z.enum(['move', 'flip']),
  from: SquareSchema.nullable(),
  to: SquareSchema,
  pieceId: z.string(),
  captured: PieceRefSchema.nullable(),
  revealed: PieceRefSchema.nullable(),
});
export type LastAction = z.infer<typeof LastActionSchema>;

export const OutcomeViewSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('win'), winner: SeatSchema, reason: WinReasonSchema }),
  z.object({ type: z.literal('draw'), reason: DrawReasonSchema }),
]);
export type OutcomeView = z.infer<typeof OutcomeViewSchema>;

export const MoveListEntrySchema = z.object({
  ply: z.number().int(),
  seat: SeatSchema,
  side: SideSchema.nullable(),
  notation: z.string().max(32),
});
export type MoveListEntry = z.infer<typeof MoveListEntrySchema>;

export const GameViewSchema = z.object({
  mode: GameModeSchema,
  /** 棋局版本：每次成功操作 +1，客戶端送出行動時需附上 */
  version: z.number().int().min(0),
  turnSeat: SeatSchema.nullable(),
  seatSides: z.tuple([SideSchema.nullable(), SideSchema.nullable()]),
  board: z.array(CellViewSchema).max(90),
  /** 只在輪到觀看者時提供，作為落點提示；最終合法性仍由伺服器判定 */
  legalActions: z.array(GameActionSchema).max(300),
  lastAction: LastActionSchema.nullable(),
  checkSquare: SquareSchema.nullable(),
  moveList: z.array(MoveListEntrySchema).max(2000),
  captured: z.object({ red: z.array(PieceKindSchema), black: z.array(PieceKindSchema) }),
  outcome: OutcomeViewSchema.nullable(),
  progress: z.object({ plySinceProgress: z.number().int(), limit: z.number().int() }),
});
export type GameView = z.infer<typeof GameViewSchema>;

export const SeatViewSchema = z.object({
  name: z.string(),
  connected: z.boolean(),
  ready: z.boolean(),
});
export type SeatView = z.infer<typeof SeatViewSchema>;

export const ClockViewSchema = z.object({
  remainingMs: z.tuple([z.number(), z.number()]),
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
  seats: z.tuple([SeatViewSchema.nullable(), SeatViewSchema.nullable()]),
  config: z.object({ mode: GameModeSchema, timeControl: TimeControlIdSchema }),
  matchNumber: z.number().int(),
  clock: ClockViewSchema.nullable(),
  drawOfferSeat: SeatSchema.nullable(),
  rematchVotes: z.tuple([z.boolean(), z.boolean()]),
  game: GameViewSchema.nullable(),
  /** 斷線座位的自動判負期限（伺服器時間戳差值，毫秒） */
  abandonDeadlineMs: z.tuple([z.number().nullable(), z.number().nullable()]),
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
