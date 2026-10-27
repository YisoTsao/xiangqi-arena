import { faceOf, rankOf, sortCards, suitOf, type Card } from './cards';

/**
 * 牌型（台灣常見規則）：單張、對子，以及五張牌型的順子、葫蘆、鐵支、同花順。
 * 不採用三條與同花。
 */
export type ComboKind =
  'single' | 'pair' | 'straight' | 'full-house' | 'four-of-a-kind' | 'straight-flush';

export const COMBO_LABELS: Record<ComboKind, string> = {
  single: '單張',
  pair: '對子',
  straight: '順子',
  'full-house': '葫蘆',
  'four-of-a-kind': '鐵支',
  'straight-flush': '同花順',
};

/** 五張牌型之間的大小：同花順 > 鐵支 > 葫蘆 > 順子 */
const FIVE_CARD_TIER: Partial<Record<ComboKind, number>> = {
  straight: 0,
  'full-house': 1,
  'four-of-a-kind': 2,
  'straight-flush': 3,
};

export interface Combo {
  kind: ComboKind;
  /** 由小到大排序 */
  cards: Card[];
  /** 同牌型比較用的數值，越大越強 */
  key: number;
}

/**
 * 順子等級：34567 = 0 … 10JQKA = 7，A2345 = 8，23456 = 9（最大）。
 * JQKA2、QKA23、KA234 不算順子。回傳 [等級, 決定花色的那張牌]。
 */
function straightLevel(cards: Card[]): [number, Card] | null {
  const faces = cards.map(faceOf).sort((a, b) => a - b);
  for (let i = 1; i < faces.length; i++) if (faces[i] === faces[i - 1]) return null;
  const two = cards.find((c) => faceOf(c) === 15);
  if (faces.join() === '3,4,5,14,15') return [8, two!];
  if (faces.join() === '3,4,5,6,15') return [9, two!];
  if (faces[4]! > 14 || faces[4]! - faces[0]! !== 4) return null;
  const top = cards.reduce((a, b) => (faceOf(b) > faceOf(a) ? b : a));
  return [faces[0]! - 3, top];
}

function rankGroups(cards: Card[]): number[] {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  return [...counts.values()].sort((a, b) => b - a);
}

function rankWithCount(cards: Card[], n: number): number {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  for (const [rank, count] of counts) if (count === n) return rank;
  return -1;
}

/** 判斷一組牌的牌型；不成牌型回傳 null。不檢查牌是否重複以外的持有關係 */
export function evaluate(input: readonly Card[]): Combo | null {
  const cards = sortCards(input);
  if (new Set(cards).size !== cards.length) return null;
  switch (cards.length) {
    case 1:
      return { kind: 'single', cards, key: cards[0]! };
    case 2:
      if (rankOf(cards[0]!) !== rankOf(cards[1]!)) return null;
      return { kind: 'pair', cards, key: cards[1]! };
    case 5: {
      const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
      const straight = straightLevel(cards);
      if (straight) {
        const [level, top] = straight;
        return {
          kind: flush ? 'straight-flush' : 'straight',
          cards,
          key: level * 4 + suitOf(top),
        };
      }
      const groups = rankGroups(cards).join();
      if (groups === '3,2') return { kind: 'full-house', cards, key: rankWithCount(cards, 3) };
      if (groups === '4,1') return { kind: 'four-of-a-kind', cards, key: rankWithCount(cards, 4) };
      return null;
    }
    default:
      return null;
  }
}

/**
 * play 能否壓過 table。張數必須相同（鐵支、同花順只能壓五張牌型，不能炸單張或對子）；
 * 五張牌型先比牌型等級，再比 key。
 */
export function beats(play: Combo, table: Combo): boolean {
  if (play.cards.length !== table.cards.length) return false;
  if (play.cards.length === 5) {
    const a = FIVE_CARD_TIER[play.kind]!;
    const b = FIVE_CARD_TIER[table.kind]!;
    if (a !== b) return a > b;
  }
  return play.key > table.key;
}
