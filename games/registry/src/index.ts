import type { AnyGameDefinition } from '@xiangqi-arena/game-core';
import { xiangqiGame } from '@xiangqi-arena/games-xiangqi';

/**
 * 遊戲註冊表：伺服器與前端都從這裡取得遊戲定義。
 * 新增遊戲 = 在 games/ 下新增套件，並在這裡加一行。
 */
export const GAMES: Readonly<Record<string, AnyGameDefinition>> = {
  [xiangqiGame.id]: xiangqiGame,
};

export const DEFAULT_GAME_ID = xiangqiGame.id;

export function getGame(id: string): AnyGameDefinition | null {
  return Object.hasOwn(GAMES, id) ? GAMES[id]! : null;
}

/** 模式是否屬於該遊戲 */
export function hasMode(game: AnyGameDefinition, mode: string): boolean {
  return game.modes.some((m) => m.id === mode);
}
