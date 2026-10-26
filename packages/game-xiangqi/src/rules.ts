/**
 * 象棋規則設定。預設值為本專案選定的「亞洲象棋規則（AXF）簡化版」，
 * 詳細說明與尚未涵蓋的情況見 docs/GAME_RULES.md。
 */
export interface XiangqiRules {
  /** 同一局面出現幾次觸發循環判定 */
  repetitionCount: number;
  /** 連續多少個半回合（ply）無吃子判和；AXF 為 60 回合 = 120 ply */
  moveLimitPlies: number;
  /** 'asian'：長將、長捉一方判負；'draw'：任何循環皆判和（休閒規則） */
  perpetual: 'asian' | 'draw';
}

export const DEFAULT_XIANGQI_RULES: XiangqiRules = {
  repetitionCount: 3,
  moveLimitPlies: 120,
  perpetual: 'asian',
};
