import { ERROR_MESSAGES, PLATFORM_REASON_LABELS } from '@xiangqi-arena/game-protocol';
import { BIG_TWO_ERROR_MESSAGES, BIG_TWO_REASON_LABELS } from '@xiangqi-arena/games-big-two';
import { MAHJONG_ERROR_MESSAGES, MAHJONG_REASON_LABELS } from '@xiangqi-arena/games-mahjong';
import { XIANGQI_ERROR_MESSAGES, XIANGQI_REASON_LABELS } from '@xiangqi-arena/games-xiangqi';

/** 前端的遊戲目錄：大廳顯示的名稱、模式與規則摘要 */
export interface GameInfo {
  id: string;
  name: string;
  modes: { value: string; label: string; title: string; rules: string[] }[];
}

export const GAME_INFO: Record<string, GameInfo> = {
  xiangqi: {
    id: 'xiangqi',
    name: '象棋',
    modes: [
      {
        value: 'classic',
        label: '大盤象棋',
        title: '大盤象棋',
        rules: [
          '9×10 棋盤，紅先黑後',
          '將死或困斃對方即獲勝',
          '長將、長捉依亞洲規則判負',
          '連續 60 回合無吃子判和',
        ],
      },
      {
        value: 'banqi',
        label: '暗棋',
        title: '暗棋（台灣規則）',
        rules: [
          '4×8 棋盤，32 子全部蓋牌',
          '第一個翻出的棋子顏色即為你的陣營',
          '大吃小；兵卒可吃將帥，帥將不能吃兵卒',
          '炮需隔一子跳吃，不限距離與階級',
        ],
      },
    ],
  },
  'big-two': {
    id: 'big-two',
    name: '大老二',
    modes: [
      {
        value: 'standard',
        label: '台灣規則',
        title: '大老二（台灣規則）',
        rules: [
          '四人各 13 張，梅花 3 先出且第一手要包含它',
          '2 最大、3 最小；花色 黑桃 > 紅心 > 方塊 > 梅花',
          '牌型：單張、對子、順子、葫蘆、鐵支、同花順',
          '最先出完手牌的人獲勝，其餘依剩牌排名',
        ],
      },
    ],
  },
};

export const gameName = (gameId: string): string => GAME_INFO[gameId]?.name ?? gameId;

export const reasonLabel = (reason: string): string =>
  PLATFORM_REASON_LABELS[reason] ??
  XIANGQI_REASON_LABELS[reason] ??
  BIG_TWO_REASON_LABELS[reason] ??
  MAHJONG_REASON_LABELS[reason] ??
  reason;

export const errorMessage = (code: string): string =>
  ERROR_MESSAGES[code] ??
  XIANGQI_ERROR_MESSAGES[code] ??
  BIG_TWO_ERROR_MESSAGES[code] ??
  MAHJONG_ERROR_MESSAGES[code] ??
  '不合法的操作';
