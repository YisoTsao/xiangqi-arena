import type { Seat } from './side';

export type WinReason =
  | 'checkmate' // 將死
  | 'stalemate' // 困斃（象棋無子可動判負）
  | 'perpetual-check' // 長將違規
  | 'perpetual-chase' // 長捉違規
  | 'no-pieces' // 暗棋：棋子被吃光
  | 'no-moves' // 暗棋：無合法行動
  | 'resign'
  | 'timeout'
  | 'abandon'; // 斷線逾時未回

export type DrawReason =
  | 'agreement' // 雙方同意和棋
  | 'repetition' // 重複局面
  | 'mutual-perpetual' // 雙方皆長將 / 長捉
  | 'move-limit' // 自然限著（無吃子步數上限）
  | 'insufficient-material'; // 雙方皆無過河攻擊子力

export type Outcome =
  { type: 'win'; winner: Seat; reason: WinReason } | { type: 'draw'; reason: DrawReason };
