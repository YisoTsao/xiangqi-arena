import type { PieceKind, Side } from '@xiangqi-arena/game-core';

export type BoardLayout = 'xiangqi' | 'banqi';

/** 渲染層只認得這份與規則無關的資料 */
export interface RenderPiece {
  id: string;
  square: number;
  faceUp: boolean;
  side: Side | null;
  kind: PieceKind | null;
}

export interface BoardTarget {
  square: number;
  capture: boolean;
}

export interface BoardModel {
  layout: BoardLayout;
  pieces: RenderPiece[];
  selected: number | null;
  targets: BoardTarget[];
  /** 可翻開的蓋牌位置（暗棋） */
  flippable: number[];
  lastMove: { from: number | null; to: number } | null;
  checkSquare: number | null;
  /** 從黑方視角觀看（象棋） */
  flipped: boolean;
  interactive: boolean;
}

export type RenderQuality = 'low' | 'medium' | 'high';

export interface BoardViewProps {
  model: BoardModel;
  onSquareClick: (square: number) => void;
  quality: RenderQuality;
  /** 動畫速度倍率：0 = 關閉，0.5 = 快速，1 = 標準 */
  animationScale: number;
}
