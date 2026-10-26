export const COLS = 8;
export const ROWS = 4;
export const CELLS = COLS * ROWS;

/** index = row * 8 + col；row 0..3、col 0..7 */
export const cell = (col: number, row: number): number => row * COLS + col;
export const colOf = (i: number): number => i % COLS;
export const rowOf = (i: number): number => Math.floor(i / COLS);
export const onBoard = (col: number, row: number): boolean =>
  col >= 0 && col < COLS && row >= 0 && row < ROWS;
export const isCell = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < CELLS;

/** 例：a1、h4 */
export const cellName = (i: number): string => `${'abcdefgh'[colOf(i)]}${rowOf(i) + 1}`;
export function parseCell(name: string): number | null {
  const col = 'abcdefgh'.indexOf(name[0] ?? '');
  const row = Number(name.slice(1)) - 1;
  if (col < 0 || !Number.isInteger(row) || !onBoard(col, row)) return null;
  return cell(col, row);
}

export const ORTHO: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function neighbors(i: number): number[] {
  const c = colOf(i);
  const r = rowOf(i);
  const out: number[] = [];
  for (const [dc, dr] of ORTHO) if (onBoard(c + dc, r + dr)) out.push(cell(c + dc, r + dr));
  return out;
}
