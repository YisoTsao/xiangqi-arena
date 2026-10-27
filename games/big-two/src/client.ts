import type { Card } from './cards';
import { evaluate, type Combo } from './combos';
import { checkPlay, type BigTwoState } from './engine';
import { legalPlays } from './hints';
import type { BigTwoView } from './schema';

/**
 * 前端用：只憑觀看者看得到的資料（自己的手牌、桌面）重建判斷出牌所需的狀態，
 * 用來即時預覽選牌是否合法與產生提示。最終合法性仍由伺服器判定。
 */
function partialState(view: BigTwoView, seat: number): BigTwoState {
  const hands = view.handCounts.map((): Card[] => []);
  hands[seat] = [...view.hand];
  const tableCombo = view.table ? evaluate(view.table.cards) : null;
  return {
    seats: view.handCounts.length,
    hands,
    turn: seat,
    table: view.table && tableCombo ? { seat: view.table.seat, combo: tableCombo } : null,
    opening: view.opening,
    round: view.handCounts.map(() => null),
    history: [],
    finishedBy: null,
    forfeitSeat: null,
  };
}

/** 選取的牌能不能出；不能出時回傳錯誤碼 */
export function previewPlay(
  view: BigTwoView,
  seat: number,
  cards: readonly Card[],
): { ok: true; combo: Combo } | { ok: false; error: string } {
  if (cards.length === 0) return { ok: false, error: 'EMPTY' };
  const r = checkPlay(partialState(view, seat), cards);
  return r.ok ? { ok: true, combo: r.value } : { ok: false, error: r.error };
}

/** 依觀看者的手牌列出可出的牌（提示用），由最省牌力排到最強 */
export function hintsForView(view: BigTwoView, seat: number): Combo[] {
  return legalPlays(partialState(view, seat), seat);
}
