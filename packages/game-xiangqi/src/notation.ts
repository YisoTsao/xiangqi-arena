import { pieceLabel, type PieceKind, type Side } from '@xiangqi-arena/game-core';
import { type Board, type Square, FILES, fileOf, forward, rankOf, squareName } from './board';

const RED_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const BLACK_NUM = ['１', '２', '３', '４', '５', '６', '７', '８', '９'];

const num = (side: Side, n: number): string => (side === 'red' ? RED_NUM : BLACK_NUM)[n - 1] ?? '?';

/** 由該方視角的縱線編號（1..9，從己方右手邊起算） */
const fileNumber = (side: Side, file: number): number => (side === 'red' ? FILES - file : file + 1);

const STRAIGHT: ReadonlySet<PieceKind> = new Set(['king', 'chariot', 'cannon', 'pawn']);

/**
 * 中文記譜（例：炮二平五、馬８進７、前俥進一）。
 * board 為走棋「前」的局面。
 */
export function chineseNotation(board: Board, from: Square, to: Square): string {
  const piece = board[from];
  if (!piece) return '?';
  const { side, kind } = piece;
  const f = fileOf(from);
  const r = rankOf(from);
  const f2 = fileOf(to);
  const r2 = rankOf(to);
  const fw = forward(side);

  // 同縱線同種棋子：用前/中/後 區分
  const sameFile: number[] = [];
  for (let rank = 0; rank < 10; rank++) {
    const p = board[rank * FILES + f];
    if (p && p.side === side && p.kind === kind) sameFile.push(rank);
  }
  let prefix: string;
  if (sameFile.length <= 1) {
    prefix = pieceLabel(side, kind) + num(side, fileNumber(side, f));
  } else {
    // 依「向前」程度排序：最前面的排第一
    const ordered = [...sameFile].sort((a, b) => (b - a) * fw);
    const idx = ordered.indexOf(r);
    let tag: string;
    if (ordered.length === 2) tag = idx === 0 ? '前' : '後';
    else if (ordered.length === 3) tag = ['前', '中', '後'][idx] ?? '';
    else tag = num(side, idx + 1);
    prefix = tag + pieceLabel(side, kind);
  }

  let action: string;
  let value: number;
  if (r2 === r) {
    action = '平';
    value = fileNumber(side, f2);
  } else {
    action = (r2 - r) * fw > 0 ? '進' : '退';
    value = STRAIGHT.has(kind) ? Math.abs(r2 - r) : fileNumber(side, f2);
  }
  return `${prefix}${action}${num(side, value)}`;
}

/** ICCS 座標記譜（例：h2-e2） */
export const iccsNotation = (from: Square, to: Square): string =>
  `${squareName(from)}-${squareName(to)}`;
