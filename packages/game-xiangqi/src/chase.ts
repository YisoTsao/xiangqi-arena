import type { PieceKind, Side } from '@xiangqi-arena/game-core';
import { type Board, type Square, enemyOf, onOwnHalf, rankOf } from './board';
import { legalMoves, legalTargets, makeBoardMove } from './movegen';

/**
 * 「捉」的判定（亞洲象棋規則精神的簡化實作，詳見 docs/GAME_RULES.md §2.6）：
 * 一步棋走完後，走棋方「新產生」一個可合法吃掉對方非將帥棋子的威脅，且
 *   1. 被捉子無保護（對方無法在該點合法回吃），或
 *   2. 被捉子價值高於攻擊子（例如馬、炮捉車）。
 * 例外：將帥與兵卒捉子不算捉；未過河的兵卒被捉不算捉。
 */
const VALUE: Record<PieceKind, number> = {
  king: 100,
  chariot: 9,
  cannon: 4.5,
  horse: 4,
  advisor: 2,
  elephant: 2,
  pawn: 1,
};

function captureSet(board: Board, side: Side): Map<string, { from: Square; to: Square }> {
  const out = new Map<string, { from: Square; to: Square }>();
  for (const m of legalMoves(board, side)) {
    const attacker = board[m.from];
    const target = board[m.to];
    if (!attacker || !target) continue;
    out.set(`${attacker.id}>${target.id}`, m);
  }
  return out;
}

function isProtected(board: Board, attackerSq: Square, targetSq: Square): boolean {
  const target = board[targetSq];
  if (!target) return false;
  const after = makeBoardMove(board, attackerSq, targetSq);
  const defender = target.side;
  for (let from = 0; from < after.length; from++) {
    const p = after[from];
    if (!p || p.side !== defender) continue;
    if (legalTargets(after, from).includes(targetSq)) return true;
  }
  return false;
}

/** 回傳此步是否構成「捉」。before：走棋前局面；after：走棋後局面；mover：走棋方。 */
export function isChaseMove(before: Board, after: Board, mover: Side): boolean {
  const prev = captureSet(before, mover);
  const next = captureSet(after, mover);
  for (const [key, m] of next) {
    if (prev.has(key)) continue;
    const attacker = after[m.from];
    const target = after[m.to];
    if (!attacker || !target) continue;
    if (target.kind === 'king') continue;
    if (attacker.kind === 'king' || attacker.kind === 'pawn') continue;
    if (target.kind === 'pawn' && onOwnHalf(enemyOf(mover), rankOf(m.to))) continue;
    if (VALUE[target.kind] > VALUE[attacker.kind]) return true;
    if (!isProtected(after, m.from, m.to)) return true;
  }
  return false;
}
