import { err, ok, shuffle, type RandomInt, type Result } from '@xiangqi-arena/shared';
import { HAND_SIZE, THREE_OF_CLUBS, cardLabel, fullDeck, sortCards, type Card } from './cards';
import { COMBO_LABELS, beats, evaluate, type Combo } from './combos';

export const BIG_TWO_SEATS = 4;

export interface TablePlay {
  seat: number;
  combo: Combo;
}

export interface BigTwoHistoryEntry {
  seq: number;
  seat: number;
  /** null = 過牌 */
  combo: Combo | null;
  notation: string;
}

/** 本輪每個座位最後的動作，給畫面顯示；新的一輪開始時清空 */
export type RoundMark = { type: 'play'; combo: Combo } | { type: 'pass' } | null;

export interface BigTwoState {
  seats: number;
  hands: Card[][];
  turn: number;
  /** 目前桌上要壓的牌；null = 輪到的人自由出牌 */
  table: TablePlay | null;
  /** 第一手還沒出：必須包含梅花 3 */
  opening: boolean;
  round: RoundMark[];
  history: BigTwoHistoryEntry[];
  /** 出完手牌的座位；null = 進行中 */
  finishedBy: number | null;
  /** 平台判定結束（認輸、斷線、超時）的座位 */
  forfeitSeat: number | null;
}

export type BigTwoAction = { type: 'play'; cards: Card[] } | { type: 'pass' };

export type BigTwoError =
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  | 'NOT_IN_HAND'
  | 'INVALID_COMBO'
  | 'MUST_INCLUDE_3C'
  | 'MUST_MATCH_SIZE'
  | 'TOO_WEAK'
  | 'CANNOT_PASS';

/** 洗牌發牌，每人 13 張；持有梅花 3 的人先出 */
export function createBigTwoGame(random: RandomInt, seats = BIG_TWO_SEATS): BigTwoState {
  if (seats !== BIG_TWO_SEATS) throw new Error('Big Two needs exactly 4 seats');
  const deck = shuffle(fullDeck(), random);
  const hands = Array.from({ length: seats }, (_, s) =>
    sortCards(deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE)),
  );
  return dealtGame(hands);
}

/** 用指定手牌建立牌局（測試、殘局） */
export function dealtGame(hands: Card[][]): BigTwoState {
  const holder = hands.findIndex((h) => h.includes(THREE_OF_CLUBS));
  return {
    seats: hands.length,
    hands: hands.map(sortCards),
    turn: holder >= 0 ? holder : 0,
    table: null,
    opening: holder >= 0,
    round: hands.map(() => null),
    history: [],
    finishedBy: null,
    forfeitSeat: null,
  };
}

export const describeCombo = (combo: Combo): string =>
  `${COMBO_LABELS[combo.kind]} ${combo.cards.map(cardLabel).join(' ')}`;

/** 只檢查牌型與能否壓過桌面，不檢查是否持有（提示與前端預覽共用） */
export function checkPlay(state: BigTwoState, cards: readonly Card[]): Result<Combo, BigTwoError> {
  const combo = evaluate(cards);
  if (!combo) return err('INVALID_COMBO');
  if (state.opening && !combo.cards.includes(THREE_OF_CLUBS)) return err('MUST_INCLUDE_3C');
  if (state.table) {
    if (combo.cards.length !== state.table.combo.cards.length) return err('MUST_MATCH_SIZE');
    if (!beats(combo, state.table.combo)) return err('TOO_WEAK');
  }
  return ok(combo);
}

export const canPass = (state: BigTwoState): boolean => state.table !== null;

export function applyBigTwoAction(
  state: BigTwoState,
  seat: number,
  action: BigTwoAction,
): Result<{ state: BigTwoState; notation: string }, BigTwoError> {
  if (state.finishedBy !== null) return err('GAME_OVER');
  if (seat !== state.turn) return err('NOT_YOUR_TURN');
  const next = (state.turn + 1) % state.seats;
  const seq = state.history.length + 1;

  if (action.type === 'pass') {
    if (!canPass(state)) return err('CANNOT_PASS');
    const round = state.round.slice();
    round[seat] = { type: 'pass' };
    // 其他人都過牌，回到最後出牌者：清桌，由他自由出牌
    const backToLeader = state.table!.seat === next;
    const notation = '過';
    return ok({
      state: {
        ...state,
        turn: next,
        table: backToLeader ? null : state.table,
        round: backToLeader ? state.round.map(() => null) : round,
        history: [...state.history, { seq, seat, combo: null, notation }],
      },
      notation,
    });
  }

  const hand = state.hands[seat]!;
  if (!action.cards.every((c) => hand.includes(c))) return err('NOT_IN_HAND');
  const checked = checkPlay(state, action.cards);
  if (!checked.ok) return checked;
  const combo = checked.value;

  const hands = state.hands.slice();
  hands[seat] = hand.filter((c) => !combo.cards.includes(c));
  // 新的一輪（自由出牌）時清掉上一輪的標記
  const round = state.table ? state.round.slice() : state.round.map(() => null);
  round[seat] = { type: 'play', combo };
  const done = hands[seat]!.length === 0;
  const notation = describeCombo(combo);
  return ok({
    state: {
      ...state,
      hands,
      turn: done ? seat : next,
      table: { seat, combo },
      opening: false,
      round,
      history: [...state.history, { seq, seat, combo, notation }],
      finishedBy: done ? seat : null,
    },
    notation,
  });
}

/**
 * 名次：出完牌的人第一，其餘依剩餘張數由少到多；張數相同時，從勝者下家起依出牌順序排。
 * forfeitSeat（認輸、斷線、超時）一律最後。
 */
export function placements(
  state: BigTwoState,
  winner: number,
  forfeitSeat: number | null = null,
): number[] {
  const order = Array.from({ length: state.seats }, (_, i) => (winner + i) % state.seats);
  const ranked = order
    .filter((s) => s !== winner && s !== forfeitSeat)
    .sort((a, b) => state.hands[a]!.length - state.hands[b]!.length);
  const final = [winner, ...ranked];
  if (forfeitSeat !== null && forfeitSeat !== winner) final.push(forfeitSeat);
  const result = Array.from({ length: state.seats }, () => 0);
  final.forEach((seat, i) => (result[seat] = i + 1));
  return result;
}

/** 有人認輸 / 斷線 / 超時時的勝者：其餘玩家中剩牌最少者，同張數依出牌順序 */
export function forfeitWinner(state: BigTwoState, forfeitSeat: number): number {
  let best = -1;
  for (let i = 1; i < state.seats; i++) {
    const s = (forfeitSeat + i) % state.seats;
    if (best < 0 || state.hands[s]!.length < state.hands[best]!.length) best = s;
  }
  return best;
}

/**
 * 罰分（參考用，不影響勝負）：剩幾張扣幾分；剩 10 張以上加倍，一張都沒出（13 張）三倍。
 */
export function penaltyPoints(cardsLeft: number): number {
  if (cardsLeft >= HAND_SIZE) return cardsLeft * 3;
  if (cardsLeft >= 10) return cardsLeft * 2;
  return cardsLeft;
}
