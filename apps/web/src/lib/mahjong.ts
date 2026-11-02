import type { RoomSnapshot } from '@xiangqi-arena/game-protocol';
import { MahjongMatchViewSchema, type MahjongMatchView } from '@xiangqi-arena/games-mahjong';

export const MAHJONG_ID = 'mahjong';

export type MahjongSnapshot = Omit<RoomSnapshot, 'game'> & { game: MahjongMatchView | null };

/** 協定層只驗證平台欄位，這裡再用麻將的 schema 驗證遊戲欄位 */
export function toMahjongSnapshot(snapshot: RoomSnapshot): MahjongSnapshot | null {
  if (snapshot.config.gameId !== MAHJONG_ID) return null;
  if (snapshot.game === null) return { ...snapshot, game: null };
  const game = MahjongMatchViewSchema.safeParse(snapshot.game);
  return game.success ? { ...snapshot, game: game.data } : null;
}
