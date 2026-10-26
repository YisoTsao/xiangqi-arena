import { opposite, type PieceKind, type Side } from '@xiangqi-arena/game-core';

export const FILES = 9;
export const RANKS = 10;
export const SQUARES = FILES * RANKS;

/** 棋盤座標：index = rank * 9 + file。file 0..8 由紅方左至右（a..i），rank 0..9 由紅方底線至黑方底線。 */
export type Square = number;

export interface XiangqiPiece {
  /** 穩定識別碼，供動畫追蹤用，不影響規則與局面比較 */
  readonly id: string;
  readonly side: Side;
  readonly kind: PieceKind;
}

export type Board = readonly (XiangqiPiece | null)[];

export const sq = (file: number, rank: number): Square => rank * FILES + file;
export const fileOf = (s: Square): number => s % FILES;
export const rankOf = (s: Square): number => Math.floor(s / FILES);
export const onBoard = (file: number, rank: number): boolean =>
  file >= 0 && file < FILES && rank >= 0 && rank < RANKS;
export const isSquare = (s: number): boolean => Number.isInteger(s) && s >= 0 && s < SQUARES;

/** ICCS 座標，例如 h2 */
export const squareName = (s: Square): string => `${'abcdefghi'[fileOf(s)]}${rankOf(s)}`;
export function parseSquare(name: string): Square | null {
  if (name.length !== 2) return null;
  const file = 'abcdefghi'.indexOf(name[0] ?? '');
  const rank = Number(name[1]);
  if (file < 0 || !Number.isInteger(rank) || !onBoard(file, rank)) return null;
  return sq(file, rank);
}

export const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';

const FEN_KIND: Record<string, PieceKind> = {
  k: 'king',
  a: 'advisor',
  b: 'elephant',
  e: 'elephant',
  n: 'horse',
  h: 'horse',
  r: 'chariot',
  c: 'cannon',
  p: 'pawn',
};
const KIND_FEN: Record<PieceKind, string> = {
  king: 'k',
  advisor: 'a',
  elephant: 'b',
  horse: 'n',
  chariot: 'r',
  cannon: 'c',
  pawn: 'p',
};

export interface ParsedPosition {
  board: Board;
  turn: Side;
}

/** 解析象棋 FEN（只使用棋盤與行棋方兩欄）。 */
export function parseFen(fen: string): ParsedPosition {
  const [placement, sideField = 'w'] = fen.trim().split(/\s+/);
  const rows = (placement ?? '').split('/');
  if (rows.length !== RANKS) throw new Error(`FEN must have ${RANKS} rows: ${fen}`);
  const board: (XiangqiPiece | null)[] = new Array<XiangqiPiece | null>(SQUARES).fill(null);
  const counters = new Map<string, number>();
  rows.forEach((row, rowIndex) => {
    const rank = RANKS - 1 - rowIndex;
    let file = 0;
    for (const ch of row) {
      if (/[1-9]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const kind = FEN_KIND[ch.toLowerCase()];
      if (!kind) throw new Error(`Invalid FEN piece "${ch}"`);
      if (file >= FILES) throw new Error(`FEN row too long: ${row}`);
      const side: Side = ch === ch.toUpperCase() ? 'red' : 'black';
      const key = `${side[0]}-${kind}`;
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      board[sq(file, rank)] = { id: `${key}-${n}`, side, kind };
      file++;
    }
    if (file !== FILES) throw new Error(`FEN row has wrong width: ${row}`);
  });
  const turn: Side = sideField === 'b' ? 'black' : 'red';
  return { board, turn };
}

export function toFen(board: Board, turn: Side): string {
  const rows: string[] = [];
  for (let rank = RANKS - 1; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < FILES; file++) {
      const p = board[sq(file, rank)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      const letter = KIND_FEN[p.kind];
      row += p.side === 'red' ? letter.toUpperCase() : letter;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return `${rows.join('/')} ${turn === 'red' ? 'w' : 'b'}`;
}

/** 局面比較鍵：只含棋子種類與位置及行棋方，不含 id。 */
export function positionKey(board: Board, turn: Side): string {
  return toFen(board, turn);
}

export const initialBoard = (): Board => parseFen(INITIAL_FEN).board;

export function findKing(board: Board, side: Side): Square {
  for (let i = 0; i < SQUARES; i++) {
    const p = board[i];
    if (p && p.side === side && p.kind === 'king') return i;
  }
  return -1;
}

export const inPalace = (side: Side, file: number, rank: number): boolean =>
  file >= 3 && file <= 5 && (side === 'red' ? rank <= 2 : rank >= 7);

/** 是否位於己方陣地（未過河） */
export const onOwnHalf = (side: Side, rank: number): boolean =>
  side === 'red' ? rank <= 4 : rank >= 5;

export const forward = (side: Side): number => (side === 'red' ? 1 : -1);

export const enemyOf = opposite;
