import { describe, expect, it } from 'vitest';
import { seededRandom } from '@xiangqi-arena/shared';
import type { PieceKind, Seat, Side } from '@xiangqi-arena/game-core';
import { CELLS, parseCell } from './board';
import {
  applyBanqiAction,
  createBanqiGame,
  createBanqiGameFromCells,
  legalBanqiActions,
  type BanqiAction,
  type BanqiPiece,
  type BanqiState,
} from './game';
import type { BanqiRules } from './rules';

const C = (name: string): number => {
  const c = parseCell(name);
  if (c === null) throw new Error(`bad cell ${name}`);
  return c;
};

type Spec = [Side, PieceKind, boolean?];
function board(
  specs: Record<string, Spec>,
  opts: { rules?: Partial<BanqiRules>; turn?: Seat; seatSides?: [Side, Side] } = {},
): BanqiState {
  const cells: (BanqiPiece | null)[] = new Array<BanqiPiece | null>(CELLS).fill(null);
  let n = 0;
  for (const [name, [side, kind, faceUp = true]] of Object.entries(specs)) {
    cells[C(name)] = { id: `t${n++}`, side, kind, faceUp };
  }
  return createBanqiGameFromCells(cells, {
    rules: opts.rules,
    firstSeat: opts.turn ?? 0,
    seatSides: opts.seatSides ?? ['red', 'black'],
  });
}

const mv = (from: string, to: string): BanqiAction => ({ type: 'move', from: C(from), to: C(to) });
const flip = (at: string): BanqiAction => ({ type: 'flip', square: C(at) });

function run(state: BanqiState, ...actions: BanqiAction[]): BanqiState {
  let s = state;
  for (const a of actions) {
    const r = applyBanqiAction(s, s.turn, a);
    if (!r.ok) throw new Error(`action ${JSON.stringify(a)} failed: ${r.error}`);
    s = r.value;
  }
  return s;
}

describe('deal', () => {
  it('deals 32 face-down pieces, 16 per side with the correct composition', () => {
    const g = createBanqiGame({ random: seededRandom(1) });
    expect(g.cells).toHaveLength(32);
    expect(g.cells.every((c) => c && !c.faceUp)).toBe(true);
    for (const side of ['red', 'black'] as const) {
      const kinds = g.cells.filter((c) => c!.side === side).map((c) => c!.kind);
      expect(kinds).toHaveLength(16);
      expect(kinds.filter((k) => k === 'pawn')).toHaveLength(5);
      expect(kinds.filter((k) => k === 'king')).toHaveLength(1);
      for (const k of ['advisor', 'elephant', 'chariot', 'horse', 'cannon'] as const) {
        expect(kinds.filter((x) => x === k)).toHaveLength(2);
      }
    }
    expect(g.seatSides).toBeNull();
  });

  it('is reproducible with the same seed and varies with different seeds', () => {
    const a = createBanqiGame({ random: seededRandom(5) });
    const b = createBanqiGame({ random: seededRandom(5) });
    const c = createBanqiGame({ random: seededRandom(6) });
    expect(a.positionKeys[0]).toBe(b.positionKeys[0]);
    expect(a.positionKeys[0]).not.toBe(c.positionKeys[0]);
  });

  it('piece ids follow deal position and do not reveal identity', () => {
    const g = createBanqiGame({ random: seededRandom(9) });
    expect(g.cells.map((c) => c!.id)).toEqual(Array.from({ length: 32 }, (_, i) => `p${i}`));
  });
});

describe('flipping', () => {
  it('first flip decides the flipper side (翻棋定色)', () => {
    const g = createBanqiGame({ random: seededRandom(3) });
    const first = g.cells[0]!;
    const s = run(g, { type: 'flip', square: 0 });
    expect(s.seatSides?.[0]).toBe(first.side);
    expect(s.seatSides?.[1]).toBe(first.side === 'red' ? 'black' : 'red');
    expect(s.turn).toBe(1);
    expect(s.cells[0]!.faceUp).toBe(true);
    expect(s.history[0]!.revealed).toEqual({ side: first.side, kind: first.kind });
  });

  it('second seat flipping first gets the flipped colour', () => {
    const g = createBanqiGame({ random: seededRandom(3), firstSeat: 1 });
    const first = g.cells[5]!;
    const s = run(g, { type: 'flip', square: 5 });
    expect(s.seatSides?.[1]).toBe(first.side);
  });

  it('rejects invalid flips', () => {
    const g = createBanqiGame({ random: seededRandom(3) });
    expect(applyBanqiAction(g, 1, flip('a1'))).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(applyBanqiAction(g, 0, { type: 'flip', square: 99 })).toEqual({
      ok: false,
      error: 'INVALID_SQUARE',
    });
    const s = run(g, flip('a1'));
    expect(applyBanqiAction(s, 1, flip('a1'))).toEqual({ ok: false, error: 'ALREADY_FACE_UP' });
    const empty = board({ a1: ['red', 'king'], h4: ['black', 'king', false] });
    expect(applyBanqiAction(empty, 0, flip('c3'))).toEqual({ ok: false, error: 'NO_PIECE' });
  });
});

describe('moving and capturing', () => {
  it('moves one step orthogonally only', () => {
    const g = board({ c2: ['red', 'chariot'], h4: ['black', 'king'] });
    const targets = legalBanqiActions(g, 0)
      .filter((a) => a.type === 'move')
      .map((a) => (a.type === 'move' ? a.to : -1))
      .sort((x, y) => x - y);
    expect(targets).toEqual([C('c1'), C('b2'), C('d2'), C('c3')].sort((x, y) => x - y));
    expect(applyBanqiAction(g, 0, mv('c2', 'd3')).ok).toBe(false);
    expect(applyBanqiAction(g, 0, mv('c2', 'c4')).ok).toBe(false);
  });

  it('cannot move hidden or opponent pieces', () => {
    const g = board({ a1: ['red', 'king', false], b1: ['black', 'horse'], h4: ['red', 'pawn'] });
    expect(applyBanqiAction(g, 0, mv('a1', 'a2'))).toEqual({ ok: false, error: 'PIECE_HIDDEN' });
    expect(applyBanqiAction(g, 0, mv('b1', 'b2'))).toEqual({ ok: false, error: 'NOT_YOUR_PIECE' });
  });

  it('captures by rank, equal rank allowed', () => {
    const g = board({
      a1: ['red', 'chariot'],
      a2: ['black', 'horse'],
      b1: ['black', 'chariot'],
      h4: ['black', 'king'],
    });
    const s = run(g, mv('a1', 'a2'));
    expect(s.captured.black).toEqual(['horse']);
    // 同階可互吃；低階不可吃高階
    const eq = board({ a1: ['red', 'chariot'], b1: ['black', 'chariot'], h4: ['black', 'king'] });
    expect(applyBanqiAction(eq, 0, mv('a1', 'b1')).ok).toBe(true);
    const low = board({ a1: ['red', 'horse'], b1: ['black', 'chariot'], h4: ['black', 'king'] });
    expect(applyBanqiAction(low, 0, mv('a1', 'b1'))).toEqual({ ok: false, error: 'ILLEGAL_MOVE' });
  });

  it('king cannot capture pawn, pawn can capture king', () => {
    const g = board({ a1: ['red', 'king'], b1: ['black', 'pawn'], h4: ['black', 'advisor'] });
    expect(applyBanqiAction(g, 0, mv('a1', 'b1'))).toEqual({ ok: false, error: 'ILLEGAL_MOVE' });
    const p = board({ a1: ['red', 'pawn'], b1: ['black', 'king'], h4: ['black', 'advisor'] });
    const s = run(p, mv('a1', 'b1'));
    expect(s.captured.black).toEqual(['king']);
  });

  it('variant: king captures pawn when enabled', () => {
    const g = board(
      { a1: ['red', 'king'], b1: ['black', 'pawn'], h4: ['black', 'advisor'] },
      { rules: { kingCanCapturePawn: true, pawnCanCaptureKing: false } },
    );
    expect(applyBanqiAction(g, 0, mv('a1', 'b1')).ok).toBe(true);
  });

  it('cannon captures by jumping exactly one screen, any distance and any rank', () => {
    const g = board({
      a1: ['red', 'cannon'],
      b1: ['black', 'pawn', false], // 蓋著的棋子也能當炮架
      f1: ['black', 'king'],
      a2: ['black', 'pawn'],
    });
    const caps = legalBanqiActions(g, 0).filter((a) => a.type === 'move');
    expect(caps).toContainEqual(mv('a1', 'f1'));
    // 不可直接吃相鄰
    expect(caps).not.toContainEqual(mv('a1', 'a2'));
    const s = run(g, mv('a1', 'f1'));
    expect(s.captured.black).toEqual(['king']);
  });

  it('cannon cannot capture hidden pieces or jump two screens', () => {
    const g = board({
      a1: ['red', 'cannon'],
      b1: ['black', 'pawn', false],
      c1: ['black', 'horse', false],
      d1: ['black', 'chariot'],
      a3: ['black', 'king'],
    });
    const caps = legalBanqiActions(g, 0).filter((a) => a.type === 'move' && a.to !== C('a2'));
    expect(caps).not.toContainEqual(mv('a1', 'c1'));
    expect(caps).not.toContainEqual(mv('a1', 'd1'));
  });

  it('variant: cannon capturing adjacent pieces by rank', () => {
    const g = board(
      { a1: ['red', 'cannon'], a2: ['black', 'pawn'], h4: ['black', 'king'] },
      { rules: { cannonCanCaptureAdjacent: true } },
    );
    expect(applyBanqiAction(g, 0, mv('a1', 'a2')).ok).toBe(true);
  });
});

describe('game end', () => {
  it('wins when the opponent has no pieces left', () => {
    const g = board({ a1: ['red', 'chariot'], a2: ['black', 'horse'] });
    const s = run(g, mv('a1', 'a2'));
    expect(s.outcome).toEqual({ type: 'win', winner: 0, reason: 'no-pieces' });
    expect(applyBanqiAction(s, 1, mv('a2', 'a3'))).toEqual({ ok: false, error: 'GAME_OVER' });
  });

  it('wins when the opponent has no legal action', () => {
    const g = board({
      a1: ['black', 'pawn'],
      a2: ['red', 'chariot'],
      b1: ['red', 'chariot'],
      h4: ['red', 'horse'],
    });
    const s = run(g, mv('h4', 'h3'));
    expect(s.outcome).toEqual({ type: 'win', winner: 0, reason: 'no-moves' });
  });

  it('draws after N plies without flip or capture', () => {
    const g = board(
      { a1: ['red', 'chariot'], h4: ['black', 'chariot'] },
      { rules: { noProgressDrawPlies: 4, repetitionDrawCount: 0 } },
    );
    const s = run(g, mv('a1', 'a2'), mv('h4', 'h3'), mv('a2', 'a3'));
    expect(s.outcome).toBeNull();
    expect(run(s, mv('h3', 'h2')).outcome).toEqual({ type: 'draw', reason: 'move-limit' });
  });

  it('draws on threefold repetition', () => {
    const g = board({ a1: ['red', 'chariot'], h4: ['black', 'chariot'] });
    const cycle = [mv('a1', 'a2'), mv('h4', 'h3'), mv('a2', 'a1'), mv('h3', 'h4')];
    let s = run(g, ...cycle);
    expect(s.outcome).toBeNull();
    s = run(s, ...cycle);
    expect(s.outcome).toEqual({ type: 'draw', reason: 'repetition' });
  });

  it('flips reset the no-progress counter', () => {
    const g = board(
      { a1: ['red', 'chariot'], h4: ['black', 'chariot'], d2: ['black', 'pawn', false] },
      { rules: { noProgressDrawPlies: 3, repetitionDrawCount: 0 } },
    );
    const s = run(g, mv('a1', 'a2'), mv('h4', 'h3'), flip('d2'));
    expect(s.plySinceProgress).toBe(0);
    expect(s.outcome).toBeNull();
  });

  it('only the seat to move has legal actions', () => {
    const g = createBanqiGame({ random: seededRandom(2) });
    expect(legalBanqiActions(g, 0)).toHaveLength(32);
    expect(legalBanqiActions(g, 1)).toHaveLength(0);
  });
});
