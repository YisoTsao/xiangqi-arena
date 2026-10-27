/**
 * 撲克牌編碼：一張牌是 0–51 的整數，id = rank * 4 + suit。
 * 數值本身就是大老二的單張大小：3♣ = 0 最小，2♠ = 51 最大。
 *
 * rank：0 = 3、1 = 4 … 10 = K、11 = A、12 = 2
 * suit（台灣規則）：0 = ♣ 梅花 < 1 = ♦ 方塊 < 2 = ♥ 紅心 < 3 = ♠ 黑桃
 */
export type Card = number;

export const DECK_SIZE = 52;
export const HAND_SIZE = 13;

/** 梅花 3：持有者先出，且第一手必須包含它 */
export const THREE_OF_CLUBS: Card = 0;

export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const;
export const SUIT_NAMES = ['梅花', '方塊', '紅心', '黑桃'] as const;
export const RANK_LABELS = [
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
  '2',
] as const;

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;
export const isCard = (n: unknown): n is Card =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < DECK_SIZE;

/** 紅色花色（方塊、紅心） */
export const isRedSuit = (suit: number): boolean => suit === 1 || suit === 2;

/** 牌面點數（順子判定用）：3–13 照常，A = 14，2 = 15 */
export const faceOf = (card: Card): number => rankOf(card) + 3;

export const cardLabel = (card: Card): string =>
  `${SUIT_SYMBOLS[suitOf(card)]}${RANK_LABELS[rankOf(card)]}`;

export const fullDeck = (): Card[] => Array.from({ length: DECK_SIZE }, (_, i) => i);

export const sortCards = (cards: readonly Card[]): Card[] => [...cards].sort((a, b) => a - b);

/** 依花色再依點數排序（理牌用） */
export const sortBySuit = (cards: readonly Card[]): Card[] =>
  [...cards].sort((a, b) => suitOf(a) - suitOf(b) || a - b);
