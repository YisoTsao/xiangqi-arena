import { describe, expect, it } from 'vitest';
import type { GameDefinition } from '@xiangqi-arena/game-core';
import { err, ok, seededRandom } from '@xiangqi-arena/shared';
import { Match } from './match';

/**
 * 一個極簡的三人遊戲：輪流報數，誰先報到 target 誰贏。
 * 用來確認平台不依賴象棋，也能處理兩人以上與無法認輸的遊戲。
 */
interface CountState {
  seats: number;
  turn: number;
  total: number;
  target: number;
}
type CountAction = { add: 1 | 2 };

const countGame: GameDefinition<CountState, CountAction, { total: number }, 'race'> = {
  id: 'count-race',
  name: 'Count race',
  players: { min: 3, max: 4 },
  modes: [{ id: 'race', label: 'Race' }],
  defaultMode: 'race',
  features: { drawOffers: false, clock: true, resign: false },
  parseAction: (raw) => {
    const add = (raw as { add?: unknown } | null)?.add;
    return add === 1 || add === 2 ? { add } : null;
  },
  setup: ({ seats, firstSeat }) => ({ seats, turn: firstSeat, total: 0, target: 5 }),
  activeSeats: (s) => (s.total >= s.target ? [] : [s.turn]),
  apply: (s, seat, a) => {
    if (s.total + a.add > s.target) return err('OVERSHOOT');
    return ok({
      state: { ...s, total: s.total + a.add, turn: (s.turn + 1) % s.seats },
      notation: `${seat}+${a.add}`,
    });
  },
  outcome: (s) =>
    s.total >= s.target
      ? { type: 'win', winner: (s.turn + s.seats - 1) % s.seats, reason: 'reached' }
      : null,
  view: (s) => ({ total: s.total }),
};

let n = 0;
const aid = () => `generic-${++n}-xxxx`;

describe('Match with a non-xiangqi game', () => {
  const make = (tc: { initialMs: number; incrementMs: number } | null = null) =>
    new Match(countGame, {
      mode: 'race',
      seats: 3,
      timeControl: tc,
      random: seededRandom(3),
      firstSeat: 0,
      now: 0,
    });

  it('rotates through three seats and reports the winner', () => {
    const m = make();
    const play = (seat: number, add: 1 | 2) =>
      m.submitAction(seat, { actionId: aid(), expectedVersion: m.version, action: { add } }, 0);
    expect(play(1, 1)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(play(0, 2).ok).toBe(true);
    expect(m.turnSeat).toBe(1);
    expect(play(1, 2).ok).toBe(true);
    expect(play(2, 2)).toEqual({ ok: false, error: 'OVERSHOOT' });
    expect(play(2, 1).ok).toBe(true);
    expect(m.outcome).toEqual({ type: 'win', winner: 2, reason: 'reached' });
    expect(m.view(0)).toMatchObject({
      gameId: 'count-race',
      total: 5,
      activeSeats: [],
      turnSeat: null,
    });
    expect(m.log.map((e) => e.notation)).toEqual(['0+2', '1+2', '2+1']);
  });

  it('validates raw actions with the game parser', () => {
    const m = make();
    expect(
      m.submitAction(0, { actionId: aid(), expectedVersion: 0, action: { add: 7 } }, 0),
    ).toEqual({ ok: false, error: 'ILLEGAL_ACTION' });
  });

  it('keeps a clock per seat', () => {
    const m = make({ initialMs: 10_000, incrementMs: 0 });
    m.submitAction(0, { actionId: aid(), expectedVersion: 0, action: { add: 1 } }, 3_000);
    expect(m.clockView(3_000)).toEqual({
      remainingMs: [7_000, 10_000, 10_000],
      running: 1,
      incrementMs: 0,
    });
  });

  it('refuses features the game does not support', () => {
    const m = make();
    expect(m.resign(0, aid(), 0)).toEqual({ ok: false, error: 'NOT_SUPPORTED' });
    expect(m.offerDraw(0, aid(), 0)).toEqual({ ok: false, error: 'NOT_SUPPORTED' });
  });

  it('rejects a seat count outside the game limits', () => {
    expect(
      () =>
        new Match(countGame, {
          mode: 'race',
          seats: 2,
          timeControl: null,
          random: seededRandom(1),
          now: 0,
        }),
    ).toThrow();
  });
});
