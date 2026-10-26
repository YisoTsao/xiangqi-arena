import type { Side } from '@xiangqi-arena/game-core';
import {
  type Board,
  type Square,
  type XiangqiPiece,
  FILES,
  SQUARES,
  enemyOf,
  fileOf,
  findKing,
  forward,
  inPalace,
  onBoard,
  onOwnHalf,
  rankOf,
  sq,
} from './board';

export interface Move {
  from: Square;
  to: Square;
}

const ORTHO: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
/** 馬：[df, dr, 馬腳 df, 馬腳 dr] */
const HORSE: readonly (readonly [number, number, number, number])[] = [
  [1, 2, 0, 1],
  [-1, 2, 0, 1],
  [1, -2, 0, -1],
  [-1, -2, 0, -1],
  [2, 1, 1, 0],
  [2, -1, 1, 0],
  [-2, 1, -1, 0],
  [-2, -1, -1, 0],
];

/**
 * 產生某顆棋子的「擬合法」落點（不檢查己方將帥安全）。
 * 包含走到空位與吃對方棋子。
 */
export function pseudoTargets(board: Board, from: Square): Square[] {
  const piece = board[from];
  if (!piece) return [];
  const f = fileOf(from);
  const r = rankOf(from);
  const out: Square[] = [];
  const tryAdd = (file: number, rank: number): void => {
    if (!onBoard(file, rank)) return;
    const t = sq(file, rank);
    const occ = board[t];
    if (!occ || occ.side !== piece.side) out.push(t);
  };

  switch (piece.kind) {
    case 'king':
      for (const [df, dr] of ORTHO) {
        if (inPalace(piece.side, f + df, r + dr)) tryAdd(f + df, r + dr);
      }
      break;
    case 'advisor':
      for (const [df, dr] of DIAG) {
        if (inPalace(piece.side, f + df, r + dr)) tryAdd(f + df, r + dr);
      }
      break;
    case 'elephant':
      for (const [df, dr] of DIAG) {
        const nf = f + 2 * df;
        const nr = r + 2 * dr;
        if (!onBoard(nf, nr) || !onOwnHalf(piece.side, nr)) continue;
        if (board[sq(f + df, r + dr)]) continue; // 象眼被塞
        tryAdd(nf, nr);
      }
      break;
    case 'horse':
      for (const [df, dr, lf, lr] of HORSE) {
        const nf = f + df;
        const nr = r + dr;
        if (!onBoard(nf, nr)) continue;
        if (board[sq(f + lf, r + lr)]) continue; // 蹩馬腳
        tryAdd(nf, nr);
      }
      break;
    case 'chariot':
      for (const [df, dr] of ORTHO) {
        let nf = f + df;
        let nr = r + dr;
        while (onBoard(nf, nr)) {
          const t = sq(nf, nr);
          const occ = board[t];
          if (!occ) out.push(t);
          else {
            if (occ.side !== piece.side) out.push(t);
            break;
          }
          nf += df;
          nr += dr;
        }
      }
      break;
    case 'cannon':
      for (const [df, dr] of ORTHO) {
        let nf = f + df;
        let nr = r + dr;
        let jumped = false;
        while (onBoard(nf, nr)) {
          const t = sq(nf, nr);
          const occ = board[t];
          if (!jumped) {
            if (!occ) out.push(t);
            else jumped = true; // 炮架
          } else if (occ) {
            if (occ.side !== piece.side) out.push(t);
            break;
          }
          nf += df;
          nr += dr;
        }
      }
      break;
    case 'pawn': {
      const fw = forward(piece.side);
      tryAdd(f, r + fw);
      if (!onOwnHalf(piece.side, r)) {
        tryAdd(f - 1, r);
        tryAdd(f + 1, r);
      }
      break;
    }
  }
  return out;
}

export function isAttacked(board: Board, target: Square, bySide: Side): boolean {
  for (let i = 0; i < SQUARES; i++) {
    const p = board[i];
    if (!p || p.side !== bySide) continue;
    if (pseudoTargets(board, i).includes(target)) return true;
  }
  return false;
}

/** 將帥照面：同一縱線且中間無子 */
export function kingsFacing(board: Board): boolean {
  const rk = findKing(board, 'red');
  const bk = findKing(board, 'black');
  if (rk < 0 || bk < 0) return false;
  if (fileOf(rk) !== fileOf(bk)) return false;
  for (let s = rk + FILES; s < bk; s += FILES) if (board[s]) return false;
  return true;
}

export function inCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side);
  if (k < 0) return true;
  return isAttacked(board, k, enemyOf(side));
}

export function makeBoardMove(board: Board, from: Square, to: Square): Board {
  const next = board.slice();
  next[to] = next[from] ?? null;
  next[from] = null;
  return next;
}

/** 走完後己方未被將軍、且將帥未照面，才是合法步 */
export function isSafeAfter(board: Board, side: Side): boolean {
  return !kingsFacing(board) && !inCheck(board, side);
}

export function legalTargets(board: Board, from: Square): Square[] {
  const piece = board[from];
  if (!piece) return [];
  return pseudoTargets(board, from).filter((to) =>
    isSafeAfter(makeBoardMove(board, from, to), piece.side),
  );
}

export function legalMoves(board: Board, side: Side): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < SQUARES; from++) {
    const p = board[from];
    if (!p || p.side !== side) continue;
    for (const to of legalTargets(board, from)) out.push({ from, to });
  }
  return out;
}

export function hasLegalMove(board: Board, side: Side): boolean {
  for (let from = 0; from < SQUARES; from++) {
    const p = board[from];
    if (!p || p.side !== side) continue;
    if (legalTargets(board, from).length > 0) return true;
  }
  return false;
}

export function isLegalMove(board: Board, side: Side, from: Square, to: Square): boolean {
  const p = board[from];
  if (!p || p.side !== side) return false;
  return legalTargets(board, from).includes(to);
}

export function piecesOf(board: Board, side: Side): { square: Square; piece: XiangqiPiece }[] {
  const out: { square: Square; piece: XiangqiPiece }[] = [];
  for (let i = 0; i < SQUARES; i++) {
    const p = board[i];
    if (p && p.side === side) out.push({ square: i, piece: p });
  }
  return out;
}
