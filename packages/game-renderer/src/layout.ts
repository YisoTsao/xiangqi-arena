import type { BoardLayout } from './model';

export interface LayoutSpec {
  cols: number;
  rows: number;
  /** 棋子所在點的間距 */
  spacing: number;
  /** 棋盤木板外緣尺寸 */
  boardWidth: number;
  boardDepth: number;
  pieceRadius: number;
  pieceHeight: number;
  /** 棋子在格線交點（象棋）或格子中心（暗棋） */
  onIntersections: boolean;
}

export const LAYOUTS: Record<BoardLayout, LayoutSpec> = {
  xiangqi: {
    cols: 9,
    rows: 10,
    spacing: 1,
    boardWidth: 9.9,
    boardDepth: 10.9,
    pieceRadius: 0.44,
    pieceHeight: 0.24,
    onIntersections: true,
  },
  banqi: {
    cols: 8,
    rows: 4,
    spacing: 1.2,
    boardWidth: 10.5,
    boardDepth: 5.7,
    pieceRadius: 0.47,
    pieceHeight: 0.24,
    onIntersections: false,
  },
};

/**
 * 棋盤座標 → 世界座標（x 向右，z 朝向鏡頭）。
 * 象棋 rank 0（紅方底線）靠近鏡頭；flipped 時改為黑方靠近鏡頭。
 */
export function squareToWorld(
  layout: BoardLayout,
  square: number,
  flipped: boolean,
): [number, number] {
  const spec = LAYOUTS[layout];
  let col = square % spec.cols;
  let row = Math.floor(square / spec.cols);
  if (flipped) {
    col = spec.cols - 1 - col;
    row = spec.rows - 1 - row;
  }
  const x = (col - (spec.cols - 1) / 2) * spec.spacing;
  const z = ((spec.rows - 1) / 2 - row) * spec.spacing;
  return [x, z];
}

export function worldToSquare(
  layout: BoardLayout,
  x: number,
  z: number,
  flipped: boolean,
): number | null {
  const spec = LAYOUTS[layout];
  // 翻轉視角等同繞原點旋轉 180°
  const ux = flipped ? -x : x;
  const uz = flipped ? -z : z;
  const col = Math.round(ux / spec.spacing + (spec.cols - 1) / 2);
  const row = Math.round((spec.rows - 1) / 2 - uz / spec.spacing);
  if (col < 0 || col >= spec.cols || row < 0 || row >= spec.rows) return null;
  const square = row * spec.cols + col + 0;
  const [cx, cz] = squareToWorld(layout, square, false);
  // 離點太遠不算點擊
  if (Math.hypot(ux - cx, uz - cz) > spec.spacing * 0.62) return null;
  return square;
}
