import type { DrawReason, PieceKind, Side, WinReason } from '@xiangqi-arena/game-core';
import { err, ok, type Result } from '@xiangqi-arena/shared';
import {
  type Board,
  type Square,
  type XiangqiPiece,
  enemyOf,
  findKing,
  isSquare,
  parseFen,
  positionKey,
  INITIAL_FEN,
} from './board';
import { isChaseMove } from './chase';
import {
  hasLegalMove,
  inCheck,
  legalMoves,
  legalTargets,
  makeBoardMove,
  type Move,
} from './movegen';
import { chineseNotation, iccsNotation } from './notation';
import { DEFAULT_XIANGQI_RULES, type XiangqiRules } from './rules';

export type XiangqiOutcome =
  { type: 'win'; winner: Side; reason: WinReason } | { type: 'draw'; reason: DrawReason };

export interface XiangqiMoveRecord {
  ply: number;
  side: Side;
  from: Square;
  to: Square;
  pieceId: string;
  kind: PieceKind;
  captured: XiangqiPiece | null;
  notation: string;
  iccs: string;
  givesCheck: boolean;
  isChase: boolean;
}

export interface XiangqiState {
  readonly board: Board;
  readonly turn: Side;
  readonly ply: number;
  readonly plySinceCapture: number;
  readonly history: readonly XiangqiMoveRecord[];
  /** positionKeys[i] = 第 i 個半回合後的局面（0 = 開局） */
  readonly positionKeys: readonly string[];
  readonly outcome: XiangqiOutcome | null;
  readonly rules: XiangqiRules;
}

export type XiangqiMoveError =
  'GAME_OVER' | 'INVALID_SQUARE' | 'NO_PIECE' | 'NOT_YOUR_PIECE' | 'ILLEGAL_MOVE';

export function createXiangqiGame(
  options: { fen?: string; rules?: Partial<XiangqiRules> } = {},
): XiangqiState {
  const { board, turn } = parseFen(options.fen ?? INITIAL_FEN);
  return {
    board,
    turn,
    ply: 0,
    plySinceCapture: 0,
    history: [],
    positionKeys: [positionKey(board, turn)],
    outcome: null,
    rules: { ...DEFAULT_XIANGQI_RULES, ...options.rules },
  };
}

export function getLegalMoves(state: XiangqiState): Move[] {
  if (state.outcome) return [];
  return legalMoves(state.board, state.turn);
}

export function getLegalTargets(state: XiangqiState, from: Square): Square[] {
  if (state.outcome) return [];
  const p = state.board[from];
  if (!p || p.side !== state.turn) return [];
  return legalTargets(state.board, from);
}

export function isInCheck(state: XiangqiState): boolean {
  return inCheck(state.board, state.turn);
}

/** 目前被將軍的將帥位置（供 UI 提示），無則 null */
export function checkedKingSquare(state: XiangqiState): Square | null {
  return inCheck(state.board, state.turn) ? findKing(state.board, state.turn) : null;
}

/**
 * 執行一步棋（純函式，回傳新狀態）。
 * `side` 為發出行動的陣營，用來阻擋控制對手棋子的企圖。
 */
export function applyXiangqiMove(
  state: XiangqiState,
  side: Side,
  from: number,
  to: number,
): Result<XiangqiState, XiangqiMoveError> {
  if (state.outcome) return err('GAME_OVER');
  if (!isSquare(from) || !isSquare(to)) return err('INVALID_SQUARE');
  const piece = state.board[from];
  if (!piece) return err('NO_PIECE');
  if (piece.side !== side || side !== state.turn) return err('NOT_YOUR_PIECE');
  if (!legalTargets(state.board, from).includes(to)) return err('ILLEGAL_MOVE');

  const before = state.board;
  const captured = before[to] ?? null;
  const after = makeBoardMove(before, from, to);
  const nextTurn = enemyOf(side);
  const givesCheck = inCheck(after, nextTurn);
  const isChase = !givesCheck && isChaseMove(before, after, side);

  const record: XiangqiMoveRecord = {
    ply: state.ply + 1,
    side,
    from,
    to,
    pieceId: piece.id,
    kind: piece.kind,
    captured,
    notation: chineseNotation(before, from, to),
    iccs: iccsNotation(from, to),
    givesCheck,
    isChase,
  };

  const next: XiangqiState = {
    ...state,
    board: after,
    turn: nextTurn,
    ply: state.ply + 1,
    plySinceCapture: captured ? 0 : state.plySinceCapture + 1,
    history: [...state.history, record],
    positionKeys: [...state.positionKeys, positionKey(after, nextTurn)],
    outcome: null,
  };
  return ok({ ...next, outcome: evaluateOutcome(next) });
}

/** 一方認輸、超時等外部結束 */
export function endXiangqiGame(state: XiangqiState, outcome: XiangqiOutcome): XiangqiState {
  if (state.outcome) return state;
  return { ...state, outcome };
}

type CycleBehaviour = 'check' | 'chase' | 'idle';

function classify(moves: readonly XiangqiMoveRecord[]): CycleBehaviour {
  if (moves.length === 0) return 'idle';
  if (moves.every((m) => m.givesCheck)) return 'check';
  if (moves.every((m) => m.givesCheck || m.isChase)) return 'chase';
  return 'idle';
}

const ATTACKERS: ReadonlySet<PieceKind> = new Set(['chariot', 'horse', 'cannon', 'pawn']);

function evaluateOutcome(state: XiangqiState): XiangqiOutcome | null {
  const mover = enemyOf(state.turn);

  // 1. 將死 / 困斃：輪到的一方無合法步即判負
  if (!hasLegalMove(state.board, state.turn)) {
    return {
      type: 'win',
      winner: mover,
      reason: inCheck(state.board, state.turn) ? 'checkmate' : 'stalemate',
    };
  }

  // 2. 重複局面：長將 / 長捉判定
  const key = state.positionKeys[state.positionKeys.length - 1];
  const occurrences: number[] = [];
  state.positionKeys.forEach((k, i) => {
    if (k === key) occurrences.push(i);
  });
  if (occurrences.length >= state.rules.repetitionCount) {
    const start = occurrences[occurrences.length - state.rules.repetitionCount] ?? 0;
    // history[i] 產生 positionKeys[i + 1]
    const cycle = state.history.slice(start);
    if (state.rules.perpetual === 'draw') return { type: 'draw', reason: 'repetition' };
    const red = classify(cycle.filter((m) => m.side === 'red'));
    const black = classify(cycle.filter((m) => m.side === 'black'));
    if (red === 'idle' && black === 'idle') return { type: 'draw', reason: 'repetition' };
    if (red !== 'idle' && black !== 'idle') {
      if (red === black) return { type: 'draw', reason: 'mutual-perpetual' };
      // 長將對長捉：長將方須變著，判負
      const loser: Side = red === 'check' ? 'red' : 'black';
      return { type: 'win', winner: enemyOf(loser), reason: 'perpetual-check' };
    }
    const loser: Side = red !== 'idle' ? 'red' : 'black';
    const behaviour = loser === 'red' ? red : black;
    return {
      type: 'win',
      winner: enemyOf(loser),
      reason: behaviour === 'check' ? 'perpetual-check' : 'perpetual-chase',
    };
  }

  // 3. 自然限著
  if (state.plySinceCapture >= state.rules.moveLimitPlies) {
    return { type: 'draw', reason: 'move-limit' };
  }

  // 4. 雙方皆無攻擊子力
  const hasAttacker = state.board.some((p) => p !== null && ATTACKERS.has(p.kind));
  if (!hasAttacker) return { type: 'draw', reason: 'insufficient-material' };

  return null;
}
