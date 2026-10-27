import { describe, expect, it } from 'vitest';
import { Match } from '@xiangqi-arena/game-match';
import { seededRandom } from '@xiangqi-arena/shared';
import { xiangqiGame } from '@xiangqi-arena/games-xiangqi';
import { handleSquareClick, toBoardModel } from './interaction';

const sq = (file: number, rank: number) => rank * 9 + file;

describe('board interaction', () => {
  const m = new Match(xiangqiGame, {
    mode: 'classic',
    timeControl: null,
    random: seededRandom(1),
    firstSeat: 0,
    now: 0,
  });
  const view = m.view(0);

  it('selects own piece, then moves to a legal target', () => {
    const cannon = sq(7, 2);
    const a = handleSquareClick(view, 0, null, cannon);
    expect(a).toEqual({ selected: cannon, action: null });
    const b = handleSquareClick(view, 0, cannon, sq(4, 2));
    expect(b.action).toEqual({ kind: 'move', from: cannon, to: sq(4, 2) });
  });

  it('ignores clicks when it is not your turn', () => {
    expect(handleSquareClick(m.view(1), 1, null, sq(7, 7))).toEqual({
      selected: null,
      action: null,
    });
  });

  it('switches selection to another own piece and deselects on empty', () => {
    const r = handleSquareClick(view, 0, sq(7, 2), sq(1, 2));
    expect(r.selected).toBe(sq(1, 2));
    expect(handleSquareClick(view, 0, sq(7, 2), sq(4, 5)).selected).toBeNull();
  });

  it('builds targets with capture flags', () => {
    const model = toBoardModel(view, { selected: sq(7, 2), flipped: false, interactive: true });
    expect(model.targets.find((t) => t.square === sq(7, 9))?.capture).toBe(true);
    expect(model.pieces).toHaveLength(32);
  });

  it('banqi: click on hidden piece flips it', () => {
    const b = new Match(xiangqiGame, {
      mode: 'banqi',
      timeControl: null,
      random: seededRandom(3),
      firstSeat: 0,
      now: 0,
    });
    const r = handleSquareClick(b.view(0), 0, null, 5);
    expect(r.action).toEqual({ kind: 'flip', square: 5 });
    const model = toBoardModel(b.view(0), { selected: null, flipped: false, interactive: true });
    expect(model.pieces.every((p) => !p.faceUp && p.kind === null)).toBe(true);
    expect(model.flippable).toHaveLength(32);
  });
});
