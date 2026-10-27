import type { RoomSnapshot } from '@xiangqi-arena/game-protocol';
import {
  XiangqiMatchViewSchema,
  XiangqiModeSchema,
  type XiangqiMatchView,
  type XiangqiMode,
} from '@xiangqi-arena/games-xiangqi';

export { errorMessage, reasonLabel } from './games';

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
