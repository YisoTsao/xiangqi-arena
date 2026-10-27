import {
  ERROR_MESSAGES,
  PLATFORM_REASON_LABELS,
  type RoomSnapshot,
} from '@xiangqi-arena/game-protocol';
import {
  XIANGQI_ERROR_MESSAGES,
  XIANGQI_REASON_LABELS,
  XiangqiMatchViewSchema,
  XiangqiModeSchema,
  type XiangqiMatchView,
  type XiangqiMode,
} from '@xiangqi-arena/games-xiangqi';

/** 前端目前只有象棋這一款遊戲；平台前端（step 3）會改成依 gameId 載入遊戲模組 */
export const GAME_ID = 'xiangqi';

export type XiangqiSnapshot = Omit<RoomSnapshot, 'game' | 'config'> & {
  config: Omit<RoomSnapshot['config'], 'mode'> & { mode: XiangqiMode };
  game: XiangqiMatchView | null;
};

/** 協定層只驗證平台欄位，這裡再用象棋的 schema 驗證遊戲欄位 */
export function toXiangqiSnapshot(snapshot: RoomSnapshot): XiangqiSnapshot | null {
  if (snapshot.config.gameId !== GAME_ID) return null;
  const mode = XiangqiModeSchema.safeParse(snapshot.config.mode);
  if (!mode.success) return null;
  const config = { ...snapshot.config, mode: mode.data };
  if (snapshot.game === null) return { ...snapshot, config, game: null };
  const game = XiangqiMatchViewSchema.safeParse(snapshot.game);
  return game.success ? { ...snapshot, config, game: game.data } : null;
}

export const reasonLabel = (reason: string): string =>
  PLATFORM_REASON_LABELS[reason] ?? XIANGQI_REASON_LABELS[reason] ?? reason;

export const errorMessage = (code: string): string =>
  ERROR_MESSAGES[code] ?? XIANGQI_ERROR_MESSAGES[code] ?? '不合法的操作';
