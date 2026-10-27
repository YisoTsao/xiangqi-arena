import type { GameDefinition, MatchOutcome } from '@xiangqi-arena/game-core';
import { err, ok } from '@xiangqi-arena/shared';
import {
  BIG_TWO_SEATS,
  applyBigTwoAction,
  createBigTwoGame,
  dealtGame,
  forfeitWinner,
  penaltyPoints,
  placements,
  type BigTwoState,
} from './engine';
import type { Card } from './cards';
import {
  BigTwoActionSchema,
  BIG_TWO_MODE_LABELS,
  type BigTwoActionInput,
  type BigTwoMode,
  type BigTwoView,
} from './schema';

export type BigTwoGameDefinition = GameDefinition<
  BigTwoState,
  BigTwoActionInput,
  BigTwoView,
  BigTwoMode
>;

export interface BigTwoDefinitionOptions {
  /** 直接指定四家手牌（測試用） */
  hands?: Card[][];
}

/**
 * 大老二（台灣規則，四人）。規則引擎在 engine.ts / combos.ts，這裡只負責接上平台介面。
 * 先手由梅花 3 決定，所以平台給的 firstSeat 不使用。
 */
export function createBigTwoDefinition(
  options: BigTwoDefinitionOptions = {},
): BigTwoGameDefinition {
  return {
    id: 'big-two',
    name: '大老二',
    players: { min: BIG_TWO_SEATS, max: BIG_TWO_SEATS },
    modes: [{ id: 'standard', label: BIG_TWO_MODE_LABELS.standard }],
    defaultMode: 'standard',
    features: { drawOffers: false, clock: true, resign: true },

    parseAction(raw) {
      const r = BigTwoActionSchema.safeParse(raw);
      return r.success ? r.data : null;
    },

    setup({ random }) {
      return options.hands ? dealtGame(options.hands) : createBigTwoGame(random);
    },

    activeSeats(s) {
      return s.finishedBy === null && s.forfeitSeat === null ? [s.turn] : [];
    },

    apply(s, seat, action) {
      const r = applyBigTwoAction(
        s,
        seat,
        action.kind === 'pass' ? { type: 'pass' } : { type: 'play', cards: action.cards },
      );
      if (!r.ok) return err(r.error === 'NOT_YOUR_TURN' ? 'NOT_YOUR_TURN' : r.error);
      return ok(r.value);
    },

    outcome(s): MatchOutcome | null {
      const w = s.finishedBy;
      return w === null ? null : { type: 'win', winner: w, reason: 'empty-hand' };
    },

    end(s, _outcome, forfeitSeat) {
      return forfeitSeat === null ? s : { ...s, forfeitSeat };
    },

    /** 有人認輸、斷線或超時：其餘三家中剩牌最少的人獲勝 */
    forfeit(s, seat, reason) {
      return { type: 'win', winner: forfeitWinner(s, seat), reason };
    },

    placements(s, outcome) {
      if (outcome.type !== 'win') return null;
      return placements(s, outcome.winner, s.forfeitSeat);
    },

    seatLabel() {
      return null;
    },

    /** 只給觀看者自己的手牌；其他人只有張數，對局結束後才公開 */
    view(s, viewer) {
      const over = s.finishedBy !== null || s.forfeitSeat !== null;
      const winner =
        s.finishedBy ?? (s.forfeitSeat !== null ? forfeitWinner(s, s.forfeitSeat) : null);
      return {
        hand: viewer !== null && viewer >= 0 && viewer < s.seats ? [...s.hands[viewer]!] : [],
        handCounts: s.hands.map((h) => h.length),
        table: s.table
          ? { seat: s.table.seat, kind: s.table.combo.kind, cards: [...s.table.combo.cards] }
          : null,
        round: s.round.map((m) =>
          m === null
            ? null
            : m.type === 'pass'
              ? { type: 'pass' as const }
              : { type: 'play' as const, kind: m.combo.kind, cards: [...m.combo.cards] },
        ),
        opening: s.opening,
        history: s.history.map((h) => ({
          seq: h.seq,
          seat: h.seat,
          kind: h.combo?.kind ?? null,
          cards: h.combo ? [...h.combo.cards] : [],
          notation: h.notation,
        })),
        result:
          over && winner !== null
            ? {
                placements: placements(s, winner, s.forfeitSeat),
                hands: s.hands.map((h) => [...h]),
                penalties: s.hands.map((h) => (h.length === 0 ? 0 : penaltyPoints(h.length))),
              }
            : null,
      };
    },
  };
}

export const bigTwoGame = createBigTwoDefinition();
