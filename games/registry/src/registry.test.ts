import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_ID, GAMES, getGame, hasMode } from './index';

describe('game registry', () => {
  it('registers every game under its own id', () => {
    for (const [id, game] of Object.entries(GAMES)) {
      expect(game.id).toBe(id);
      expect(game.players.min).toBeGreaterThanOrEqual(1);
      expect(game.players.max).toBeLessThanOrEqual(8);
      expect(hasMode(game, game.defaultMode)).toBe(true);
    }
    expect(getGame(DEFAULT_GAME_ID)).not.toBeNull();
  });

  it('does not resolve unknown or inherited ids', () => {
    expect(getGame('nope')).toBeNull();
    expect(getGame('toString')).toBeNull();
    expect(getGame('__proto__')).toBeNull();
  });

  it('xiangqi has classic and banqi modes', () => {
    const g = getGame('xiangqi')!;
    expect(g.modes.map((m) => m.id)).toEqual(['classic', 'banqi']);
    expect(hasMode(g, 'xiangqi')).toBe(false);
  });

  it('big two is a four-player game', () => {
    const g = getGame('big-two')!;
    expect(g.players).toEqual({ min: 4, max: 4 });
    expect(g.defaultMode).toBe('standard');
  });
});
