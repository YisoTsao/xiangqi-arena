import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const SeatSchema = z.union([z.literal(0), z.literal(1)]);
export const SideSchema = z.enum(['red', 'black']);
export const PieceKindSchema = z.enum([
  'king',
  'advisor',
  'elephant',
  'chariot',
  'horse',
  'cannon',
  'pawn',
]);
export const GameModeSchema = z.enum(['xiangqi', 'banqi']);
export type GameMode = z.infer<typeof GameModeSchema>;

export const TimeControlIdSchema = z.enum([
  'unlimited',
  'blitz-5-3',
  'rapid-10-5',
  'classic-20-10',
]);
export type TimeControlId = z.infer<typeof TimeControlIdSchema>;

export const TIME_CONTROLS: Record<
  TimeControlId,
  { label: string; initialMs: number; incrementMs: number } | null
> = {
  unlimited: null,
  'blitz-5-3': { label: '快棋 5+3', initialMs: 5 * 60_000, incrementMs: 3_000 },
  'rapid-10-5': { label: '標準 10+5', initialMs: 10 * 60_000, incrementMs: 5_000 },
  'classic-20-10': { label: '慢棋 20+10', initialMs: 20 * 60_000, incrementMs: 10_000 },
};
export const TIME_CONTROL_LABELS: Record<TimeControlId, string> = {
  unlimited: '不計時',
  'blitz-5-3': '快棋 5+3',
  'rapid-10-5': '標準 10+5',
  'classic-20-10': '慢棋 20+10',
};
export const DEFAULT_TIME_CONTROL: TimeControlId = 'rapid-10-5';

export const SquareSchema = z.number().int().min(0).max(89);

export const WinReasonSchema = z.enum([
  'checkmate',
  'stalemate',
  'perpetual-check',
  'perpetual-chase',
  'no-pieces',
  'no-moves',
  'resign',
  'timeout',
  'abandon',
]);
export const DrawReasonSchema = z.enum([
  'agreement',
  'repetition',
  'mutual-perpetual',
  'move-limit',
  'insufficient-material',
]);

export const ErrorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'RATE_LIMITED',
  'NOT_SEATED',
  'NOT_HOST',
  'NOT_IN_LOBBY',
  'PLAYERS_NOT_READY',
  'GAME_NOT_ACTIVE',
  'NOT_YOUR_TURN',
  'NOT_YOUR_PIECE',
  'STALE_VERSION',
  'DUPLICATE',
  'ILLEGAL_ACTION',
  'CANNOT_FLIP',
  'NO_DRAW_OFFER',
  'DRAW_OFFER_LIMIT',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_MESSAGE: '訊息格式錯誤',
  RATE_LIMITED: '操作太頻繁，請稍候',
  NOT_SEATED: '你不是此房間的玩家',
  NOT_HOST: '只有房主可以這麼做',
  NOT_IN_LOBBY: '對局進行中無法變更設定',
  PLAYERS_NOT_READY: '雙方都準備好才能開始',
  GAME_NOT_ACTIVE: '對局尚未開始或已結束',
  NOT_YOUR_TURN: '還沒輪到你',
  NOT_YOUR_PIECE: '不能操作對方的棋子',
  STALE_VERSION: '棋局已更新，請重新操作',
  DUPLICATE: '重複的操作已忽略',
  ILLEGAL_ACTION: '不合法的走法',
  CANNOT_FLIP: '這顆棋子不能翻',
  NO_DRAW_OFFER: '目前沒有和棋提議',
  DRAW_OFFER_LIMIT: '每一步只能提議和棋一次',
};

export const WIN_REASON_LABELS: Record<z.infer<typeof WinReasonSchema>, string> = {
  checkmate: '將死',
  stalemate: '困斃（無子可動）',
  'perpetual-check': '長將違規',
  'perpetual-chase': '長捉違規',
  'no-pieces': '棋子全被吃光',
  'no-moves': '無棋可走',
  resign: '認輸',
  timeout: '超時',
  abandon: '斷線逾時',
};
export const DRAW_REASON_LABELS: Record<z.infer<typeof DrawReasonSchema>, string> = {
  agreement: '雙方同意和棋',
  repetition: '重複局面',
  'mutual-perpetual': '雙方皆長將／長捉',
  'move-limit': '達到無進展步數上限',
  'insufficient-material': '雙方皆無攻擊子力',
};
