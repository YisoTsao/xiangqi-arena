import type { PieceKind } from '@xiangqi-arena/game-core';

/**
 * 暗棋規則設定（RuleSet）。預設值為常見台灣暗棋玩法，
 * 每個選項的意義與地方差異見 docs/GAME_RULES.md §3。
 */
export interface BanqiRules {
  /** 階級（數字越大越高）。預設：帥7 仕6 相5 俥4 傌3 炮2 兵1 */
  ranks: Record<PieceKind, number>;
  /** 同階級可互吃 */
  equalRankCapture: boolean;
  /** 帥將可吃兵卒（台灣常見：不可） */
  kingCanCapturePawn: boolean;
  /** 兵卒可吃帥將（台灣常見：可） */
  pawnCanCaptureKing: boolean;
  /** 炮需隔一子（炮架）跳吃，可跨任意距離 */
  cannonJumpCapture: boolean;
  /** 炮跳吃不受階級限制 */
  cannonCapturesAnyRank: boolean;
  /** 炮可以像一般棋子一樣吃相鄰棋子（台灣常見：不可） */
  cannonCanCaptureAdjacent: boolean;
  /** 連續多少個半回合無翻棋、無吃子判和 */
  noProgressDrawPlies: number;
  /** 同一局面（含未翻開棋子）出現幾次判和；0 表示停用 */
  repetitionDrawCount: number;
}

export const DEFAULT_BANQI_RULES: BanqiRules = {
  ranks: { king: 7, advisor: 6, elephant: 5, chariot: 4, horse: 3, cannon: 2, pawn: 1 },
  equalRankCapture: true,
  kingCanCapturePawn: false,
  pawnCanCaptureKing: true,
  cannonJumpCapture: true,
  cannonCapturesAnyRank: true,
  cannonCanCaptureAdjacent: false,
  noProgressDrawPlies: 50,
  repetitionDrawCount: 3,
};

/** 每方 16 子：帥1 仕2 相2 俥2 傌2 炮2 兵5 */
export const BANQI_SET: readonly PieceKind[] = [
  'king',
  'advisor',
  'advisor',
  'elephant',
  'elephant',
  'chariot',
  'chariot',
  'horse',
  'horse',
  'cannon',
  'cannon',
  'pawn',
  'pawn',
  'pawn',
  'pawn',
  'pawn',
];
