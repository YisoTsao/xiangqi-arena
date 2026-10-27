import { z } from 'zod';

/** v2：遊戲無關的協定。動作與畫面內容由各遊戲自己定義與驗證 */
export const PROTOCOL_VERSION = 2;

/** 座位編號；實際上限由遊戲的 players.max 決定 */
export const SeatSchema = z.number().int().min(0).max(7);
export const MAX_SEATS = 8;

export const GameIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);
export const ModeIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);

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

/** 結束原因：平台的原因（認輸、超時…）或遊戲自訂的原因字串 */
export const ReasonSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);

/** 錯誤碼：平台的錯誤碼或遊戲自訂的錯誤碼 */
export const ErrorCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_MESSAGE: '訊息格式錯誤',
  RATE_LIMITED: '操作太頻繁，請稍候',
  NOT_SEATED: '你不是此房間的玩家',
  NOT_HOST: '只有房主可以這麼做',
  NOT_IN_LOBBY: '對局進行中無法變更設定',
  PLAYERS_NOT_READY: '玩家都準備好才能開始',
  INVALID_CONFIG: '這個遊戲沒有這種模式',
  GAME_NOT_ACTIVE: '對局尚未開始或已結束',
  NOT_YOUR_TURN: '還沒輪到你',
  STALE_VERSION: '棋局已更新，請重新操作',
  DUPLICATE: '重複的操作已忽略',
  ILLEGAL_ACTION: '不合法的操作',
  NOT_SUPPORTED: '這個遊戲不支援這個操作',
  NO_DRAW_OFFER: '目前沒有和棋提議',
  DRAW_OFFER_LIMIT: '每一步只能提議和棋一次',
};

/** 平台產生的結束原因 */
export const PLATFORM_REASON_LABELS: Record<string, string> = {
  resign: '認輸',
  timeout: '超時',
  abandon: '斷線逾時',
  agreement: '雙方同意和棋',
};
