import type { Card } from './cards';
import { evaluate, type Combo } from './combos';
import { checkPlay, type BigTwoState } from './engine';

function* subsets(
  cards: readonly Card[],
  size: number,
  start = 0,
  picked: Card[] = [],
): Generator<Card[]> {
  if (picked.length === size) {
    yield picked.slice();
    return;
  }
  for (let i = start; i <= cards.length - (size - picked.length); i++) {
    picked.push(cards[i]!);
    yield* subsets(cards, size, i + 1, picked);
    picked.pop();
  }
}

/** 手上所有成立的牌型（單張、對子、五張牌型） */
export function allCombos(hand: readonly Card[]): Combo[] {
  const out: Combo[] = [];
  for (const size of [1, 2, 5]) {
    if (hand.length < size) continue;
    for (const s of subsets(hand, size)) {
      const c = evaluate(s);
      if (c) out.push(c);
    }
  }
  return out;
}

const FIVE_ORDER = ['straight', 'full-house', 'four-of-a-kind', 'straight-flush'];
const strength = (c: Combo): number =>
  c.cards.length === 5 ? FIVE_ORDER.indexOf(c.kind) * 1000 + c.key : c.key;

/**
 * 輪到 seat 時所有合法的出法，由「最省牌力」排到最強。
 * 跟牌時由小到大；自由出牌時先帶走手上最小的那張（張數多的牌型優先），其餘再依張數、由小到大。
 */
export function legalPlays(state: BigTwoState, seat: number): Combo[] {
  const hand = state.hands[seat] ?? [];
  const lowest = Math.min(...hand);
  const plays = allCombos(hand).filter((c) => checkPlay(state, c.cards).ok);
  return plays.sort((a, b) => {
    if (!state.table) {
      const al = a.cards.includes(lowest) ? 0 : 1;
      const bl = b.cards.includes(lowest) ? 0 : 1;
      if (al !== bl) return al - bl;
      if (a.cards.length !== b.cards.length) return b.cards.length - a.cards.length;
    }
    return strength(a) - strength(b);
  });
}

/** 練習模式電腦玩家：出最省牌力的合法牌，沒有就過牌 */
export function botAction(
  state: BigTwoState,
  seat: number,
): { type: 'play'; cards: Card[] } | { type: 'pass' } {
  const best = legalPlays(state, seat)[0];
  return best ? { type: 'play', cards: best.cards } : { type: 'pass' };
}
