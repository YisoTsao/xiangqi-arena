import type { RoomSnapshot } from '@xiangqi-arena/game-protocol';
import {
  BigTwoMatchViewSchema,
  BigTwoModeSchema,
  type BigTwoMatchView,
  type BigTwoMode,
} from '@xiangqi-arena/games-big-two';

export const BIG_TWO_ID = 'big-two';

export type BigTwoSnapshot = Omit<RoomSnapshot, 'game' | 'config'> & {
  config: Omit<RoomSnapshot['config'], 'mode'> & { mode: BigTwoMode };
  game: BigTwoMatchView | null;
};

/** 協定層只驗證平台欄位，這裡再用大老二的 schema 驗證遊戲欄位 */
export function toBigTwoSnapshot(snapshot: RoomSnapshot): BigTwoSnapshot | null {
  if (snapshot.config.gameId !== BIG_TWO_ID) return null;
  const mode = BigTwoModeSchema.safeParse(snapshot.config.mode);
  if (!mode.success) return null;
  const config = { ...snapshot.config, mode: mode.data };
  if (snapshot.game === null) return { ...snapshot, config, game: null };
  const game = BigTwoMatchViewSchema.safeParse(snapshot.game);
  return game.success ? { ...snapshot, config, game: game.data } : null;
}
