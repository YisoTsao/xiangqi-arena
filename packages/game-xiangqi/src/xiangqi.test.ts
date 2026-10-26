import { describe, expect, it } from 'vitest';
import {
  applyXiangqiMove,
  checkedKingSquare,
  createXiangqiGame,
  getLegalMoves,
  getLegalTargets,
  type XiangqiState,
} from './game';
import { INITIAL_FEN, parseFen, parseSquare, sq, toFen } from './board';
import { legalMoves, makeBoardMove } from './movegen';
import type { Board } from './board';
import type { Side } from '@xiangqi-arena/game-core';

const S = (name: string): number => {
  const s = parseSquare(name);
  if (s === null) throw new Error(`bad square ${name}`);
  return s;
};

function play(state: XiangqiState, ...moves: string[]): XiangqiState {
  let s = state;
  for (const m of moves) {
    const [a, b] = m.split('-') as [string, string];
    const r = applyXiangqiMove(s, s.turn, S(a), S(b));
    if (!r.ok) throw new Error(`move ${m} failed: ${r.error} @ ${toFen(s.board, s.turn)}`);
    s = r.value;
  }
  return s;
}

function perft(board: Board, side: Side, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(board, side);
  if (depth === 1) return moves.length;
  let n = 0;
  const next: Side = side === 'red' ? 'black' : 'red';
  for (const m of moves) n += perft(makeBoardMove(board, m.from, m.to), next, depth - 1);
  return n;
}

const targets = (fen: string, from: string): string[] => {
  const g = createXiangqiGame({ fen });
  return getLegalTargets(g, S(from))
    .map((t) => `${'abcdefghi'[t % 9]}${Math.floor(t / 9)}`)
    .sort();
};

describe('board & FEN', () => {
  it('round-trips the initial FEN', () => {
    const { board, turn } = parseFen(INITIAL_FEN);
    expect(toFen(board, turn)).toBe(INITIAL_FEN);
  });

  it('assigns unique piece ids', () => {
    const { board } = parseFen(INITIAL_FEN);
    const ids = board.filter((p) => p).map((p) => p!.id);
    expect(new Set(ids).size).toBe(32);
  });
});

describe('move generation (perft)', () => {
  const { board } = parseFen(INITIAL_FEN);
  it('perft(1) = 44', () => expect(perft(board, 'red', 1)).toBe(44));
  it('perft(2) = 1920', () => expect(perft(board, 'red', 2)).toBe(1920));
  it('perft(3) = 79666', () => expect(perft(board, 'red', 3)).toBe(79666));
});

describe('piece movement rules', () => {
  it('horse is blocked by its leg (蹩馬腳)', () => {
    // 初始局面：傌 b0 → a2 / c2；往 d1 被相 c0 擋住
    expect(targets(INITIAL_FEN, 'b0')).toEqual(['a2', 'c2']);
  });

  it('elephant cannot cross the river and is blocked by its eye (塞象眼)', () => {
    expect(targets('4k4/9/9/9/9/9/9/2B6/9/3K5 w', 'c2')).toEqual(['a0', 'a4', 'e0', 'e4']);
    // c4 往 a6 / e6 會過河
    expect(targets('4k4/9/9/9/9/2B6/9/9/9/3K5 w', 'c4')).toEqual(['a2', 'e2']);
    // d3 塞住往 e4 的象眼
    expect(targets('4k4/9/9/9/9/9/3P5/2B6/9/3K5 w', 'c2')).toEqual(['a0', 'a4', 'e0']);
  });

  it('advisor and king stay inside the palace', () => {
    expect(targets('4k4/9/9/9/9/9/9/9/9/3AK4 w', 'd0')).toEqual(['e1']);
    expect(targets('4k4/9/9/9/9/9/9/9/9/3K5 w', 'd0')).toEqual(['d1']); // e0 會與黑將照面
  });

  it('cannon needs exactly one screen to capture', () => {
    const t = targets(INITIAL_FEN, 'h2');
    expect(t).toContain('h9'); // 炮二進七 打馬
    expect(t).not.toContain('h7'); // 不能直接吃無炮架的砲
    expect(t).toContain('e2');
  });

  it('pawn moves sideways only after crossing the river', () => {
    expect(targets('4k4/9/9/9/9/9/4P4/9/9/3K5 w', 'e3')).toEqual(['e4']);
    expect(targets('4k4/9/9/9/4P4/9/9/9/9/3K5 w', 'e5')).toEqual(['d5', 'e6', 'f5']);
    expect(targets('4k4/9/9/9/9/9/9/9/9/3K4p w', 'i0').length).toBe(0); // 黑卒不屬於紅方
  });
});

describe('king safety', () => {
  it('kings may not face each other (將帥不能照面)', () => {
    // 紅帥 d0 不可走到 e0（與黑將同線無遮擋）
    expect(targets('4k4/9/9/9/9/9/9/9/9/3K5 w', 'd0')).not.toContain('e0');
  });

  it('a piece shielding the kings is pinned', () => {
    expect(targets('4k4/9/9/9/9/9/4R4/9/9/4K4 w', 'e3')).toEqual(
      ['e1', 'e2', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9'].sort(),
    );
  });

  it('cannot leave own king in check', () => {
    // 黑車 e9 將軍紅帥 e0 之外的情況：紅帥被黑車沿 e 線將軍，所有不解將的步都不合法
    const g = createXiangqiGame({ fen: '3k5/9/9/9/9/9/9/9/4r4/4K1R2 w' });
    expect(checkedKingSquare(g)).toBe(sq(4, 0));
    const moves = getLegalMoves(g).map((m) => `${m.from}-${m.to}`);
    // 帥吃車 or 帥橫移，或俥橫吃
    for (const m of getLegalMoves(g)) {
      const r = applyXiangqiMove(g, 'red', m.from, m.to);
      expect(r.ok).toBe(true);
    }
    expect(moves.length).toBeGreaterThan(0);
    const bad = applyXiangqiMove(g, 'red', S('g0'), S('g5'));
    expect(bad).toEqual({ ok: false, error: 'ILLEGAL_MOVE' });
  });
});

describe('game flow', () => {
  it('rejects moving opponent pieces and moving out of turn', () => {
    const g = createXiangqiGame();
    expect(applyXiangqiMove(g, 'red', S('b9'), S('c7'))).toEqual({
      ok: false,
      error: 'NOT_YOUR_PIECE',
    });
    expect(applyXiangqiMove(g, 'black', S('b9'), S('c7'))).toEqual({
      ok: false,
      error: 'NOT_YOUR_PIECE',
    });
    expect(applyXiangqiMove(g, 'red', S('e4'), S('e5'))).toEqual({ ok: false, error: 'NO_PIECE' });
    expect(applyXiangqiMove(g, 'red', -1, 200)).toEqual({ ok: false, error: 'INVALID_SQUARE' });
    expect(applyXiangqiMove(g, 'red', S('b0'), S('d1'))).toEqual({
      ok: false,
      error: 'ILLEGAL_MOVE',
    });
  });

  it('records capture and Chinese notation', () => {
    const g = play(createXiangqiGame(), 'h2-e2', 'h9-g7', 'i0-i1', 'b9-c7');
    expect(g.history.map((m) => m.notation)).toEqual([
      '炮二平五',
      '馬８進７',
      '俥一進一',
      '馬２進３',
    ]);
    const g2 = play(createXiangqiGame(), 'h2-h9');
    expect(g2.history[0]?.captured?.kind).toBe('horse');
    expect(g2.history[0]?.notation).toBe('炮二進七');
    expect(g2.plySinceCapture).toBe(0);
  });

  it('uses 前/後 for two same pieces on one file', () => {
    const g = play(createXiangqiGame({ fen: '4k4/9/9/9/9/9/9/R8/9/R2K5 w' }), 'a2-a4');
    expect(g.history[0]?.notation).toBe('前俥進二');
    const g2 = play(createXiangqiGame({ fen: '4k4/9/9/9/9/9/9/R8/9/R2K5 w' }), 'a0-b0');
    expect(g2.history[0]?.notation).toBe('後俥平八');
  });

  it('detects checkmate', () => {
    const g = play(createXiangqiGame({ fen: '4k4/R8/9/9/9/9/9/9/9/1R1K5 w' }), 'b0-b9');
    expect(g.outcome).toEqual({ type: 'win', winner: 'red', reason: 'checkmate' });
    expect(getLegalMoves(g)).toEqual([]);
    expect(applyXiangqiMove(g, 'black', S('e9'), S('e8'))).toEqual({
      ok: false,
      error: 'GAME_OVER',
    });
  });

  it('treats stalemate as a loss for the stalemated side (困斃)', () => {
    const g = play(createXiangqiGame({ fen: '3k5/9/8R/9/9/9/9/9/9/4K4 w' }), 'i7-i8');
    expect(g.outcome).toEqual({ type: 'win', winner: 'red', reason: 'stalemate' });
  });

  it('perpetual check loses (長將判負)', () => {
    const cycle = ['d5-e5', 'e9-d9', 'e5-d5', 'd9-e9'];
    let g = createXiangqiGame({ fen: '4k4/9/9/9/3R5/9/9/9/9/5K3 w' });
    g = play(g, ...cycle);
    expect(g.outcome).toBeNull();
    g = play(g, ...cycle);
    expect(g.outcome).toEqual({ type: 'win', winner: 'black', reason: 'perpetual-check' });
  });

  it('repetition is a draw under casual rules', () => {
    const cycle = ['d5-e5', 'e9-d9', 'e5-d5', 'd9-e9'];
    let g = createXiangqiGame({
      fen: '4k4/9/9/9/3R5/9/9/9/9/5K3 w',
      rules: { perpetual: 'draw' },
    });
    g = play(g, ...cycle, ...cycle);
    expect(g.outcome).toEqual({ type: 'draw', reason: 'repetition' });
  });

  it('perpetual chase of an unprotected piece loses (長捉判負)', () => {
    let g = createXiangqiGame({ fen: '4k4/9/c8/9/2R6/9/9/9/9/3K5 w' });
    g = play(g, 'c5-c7', 'a7-a8', 'c7-c8', 'a8-a7', 'c8-c7', 'a7-a8', 'c7-c8');
    expect(g.outcome).toBeNull();
    g = play(g, 'a8-a7', 'c8-c7');
    expect(g.history.at(-1)?.isChase).toBe(true);
    expect(g.outcome).toEqual({ type: 'win', winner: 'black', reason: 'perpetual-chase' });
  });

  it('idle repetition by both sides is a draw', () => {
    // 雙方來回移動帥將，不構成將或捉
    const cycle = ['d0-d1', 'f9-f8', 'd1-d0', 'f8-f9'];
    let g = createXiangqiGame({ fen: '5k3/9/9/9/9/9/9/9/9/R2K5 w' });
    g = play(g, ...cycle, ...cycle);
    expect(g.outcome).toEqual({ type: 'draw', reason: 'repetition' });
  });

  it('natural move limit draws the game', () => {
    let g = createXiangqiGame({
      fen: '5k3/9/9/9/9/9/9/9/9/R2K5 w',
      rules: { moveLimitPlies: 4, repetitionCount: 99 },
    });
    g = play(g, 'a0-a1', 'f9-f8', 'a1-a2');
    expect(g.outcome).toBeNull();
    g = play(g, 'f8-f9');
    expect(g.outcome).toEqual({ type: 'draw', reason: 'move-limit' });
  });

  it('draws when neither side has attacking material', () => {
    const g = play(createXiangqiGame({ fen: '3ak4/9/9/9/9/9/9/9/9/4AK3 w' }), 'e0-d1');
    expect(g.outcome).toEqual({ type: 'draw', reason: 'insufficient-material' });
  });

  it('duplicated move submissions are rejected after the first', () => {
    const g = createXiangqiGame();
    const first = applyXiangqiMove(g, 'red', S('h2'), S('e2'));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = applyXiangqiMove(first.value, 'red', S('h2'), S('e2'));
    expect(again).toEqual({ ok: false, error: 'NO_PIECE' });
    const outOfTurn = applyXiangqiMove(first.value, 'red', S('e2'), S('e1'));
    expect(outOfTurn).toEqual({ ok: false, error: 'NOT_YOUR_PIECE' });
  });
});
