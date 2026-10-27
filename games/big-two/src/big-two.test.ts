import { describe, expect, it } from 'vitest';
import { Match } from '@xiangqi-arena/game-match';
import { seededRandom } from '@xiangqi-arena/shared';
import { THREE_OF_CLUBS, cardLabel, makeCard, type Card } from './cards';
import { beats, evaluate } from './combos';
import {
  applyBigTwoAction,
  createBigTwoGame,
  dealtGame,
  placements,
  type BigTwoState,
} from './engine';
import { botAction, legalPlays } from './hints';
import { BigTwoActionSchema, BigTwoMatchViewSchema } from './schema';
import { bigTwoGame, createBigTwoDefinition } from './definition';

const SUIT: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };
const RANK: Record<string, number> = {
  '3': 0,
  '4': 1,
  '5': 2,
  '6': 3,
  '7': 4,
  '8': 5,
  '9': 6,
  T: 7,
  J: 8,
  Q: 9,
  K: 10,
  A: 11,
  '2': 12,
};
/** 'As 2c Td' → 牌 */
const c = (s: string): Card[] =>
  s.split(/\s+/).map((t) => makeCard(RANK[t.slice(0, -1)]!, SUIT[t.slice(-1)]!));
const combo = (s: string) => evaluate(c(s));

describe('cards', () => {
  it('orders 3♣ lowest and 2♠ highest, with Taiwanese suit order', () => {
    expect(c('3c')[0]).toBe(THREE_OF_CLUBS);
    expect(c('2s')[0]).toBe(51);
    expect(cardLabel(c('Th')[0]!)).toBe('♥10');
    // ♣ < ♦ < ♥ < ♠
    const [cl, di, he, sp] = c('5c 5d 5h 5s');
    expect(cl! < di! && di! < he! && he! < sp!).toBe(true);
  });
});

describe('combos', () => {
  it('recognises the allowed hand types', () => {
    expect(combo('7h')?.kind).toBe('single');
    expect(combo('7h 7s')?.kind).toBe('pair');
    expect(combo('7h 8s')).toBeNull();
    expect(combo('7h 7s 7c')).toBeNull(); // 不採用三條
    expect(combo('3c 4d 5h 6s 7c')?.kind).toBe('straight');
    expect(combo('3c 6c 9c Jc Kc')).toBeNull(); // 不採用同花
    expect(combo('3c 3d 3h 9s 9c')?.kind).toBe('full-house');
    expect(combo('3c 3d 3h 3s 9c')?.kind).toBe('four-of-a-kind');
    expect(combo('3c 3d 3h 3s')).toBeNull(); // 鐵支要帶一張
    expect(combo('9h Th Jh Qh Kh')?.kind).toBe('straight-flush');
  });

  it('allows A2345 and 23456 but not wrap-around straights', () => {
    expect(combo('Ac 2d 3h 4s 5c')?.kind).toBe('straight');
    expect(combo('2d 3h 4s 5c 6c')?.kind).toBe('straight');
    expect(combo('Tc Jd Qh Ks Ac')?.kind).toBe('straight');
    for (const bad of ['Jc Qd Kh As 2c', 'Qc Kd Ah 2s 3c', 'Kc Ad 2h 3s 4c']) {
      expect(combo(bad)).toBeNull();
    }
  });

  it('ranks straights: 23456 > A2345 > 10JQKA > … > 34567, ties by suit of the top card', () => {
    const order = ['3c 4d 5h 6s 7c', 'Tc Jd Qh Ks Ac', 'Ac 2d 3h 4s 5c', '2c 3h 4s 5c 6c'];
    for (let i = 1; i < order.length; i++) {
      expect(beats(combo(order[i]!)!, combo(order[i - 1]!)!)).toBe(true);
      expect(beats(combo(order[i - 1]!)!, combo(order[i]!)!)).toBe(false);
    }
    expect(beats(combo('3c 4d 5h 6s 7s')!, combo('3d 4d 5h 6s 7h')!)).toBe(true);
  });

  it('compares singles and pairs by rank then suit', () => {
    expect(beats(combo('2c')!, combo('As')!)).toBe(true);
    expect(beats(combo('5s')!, combo('5h')!)).toBe(true);
    expect(beats(combo('9c 9s')!, combo('9d 9h')!)).toBe(true);
    expect(beats(combo('9d 9h')!, combo('9c 9s')!)).toBe(false);
  });

  it('five-card tiers: straight < full house < four of a kind < straight flush', () => {
    const straight = combo('Tc Jd Qh Ks Ac')!;
    const full = combo('3c 3d 3h 4s 4c')!;
    const four = combo('4c 4d 4h 4s 3c')!;
    const sf = combo('3d 4d 5d 6d 7d')!;
    expect(beats(full, straight)).toBe(true);
    expect(beats(four, full)).toBe(true);
    expect(beats(sf, four)).toBe(true);
    expect(beats(combo('5c 5d 5h 3s 3d')!, full)).toBe(true);
  });

  it('bombs cannot beat singles or pairs', () => {
    expect(beats(combo('4c 4d 4h 4s 3c')!, combo('2s')!)).toBe(false);
    expect(beats(combo('3d 4d 5d 6d 7d')!, combo('2h 2s')!)).toBe(false);
  });
});

/** 四家手牌：座位 0 拿梅花 3 */
function sampleHands(): Card[][] {
  return [
    c('3c 4c 5c 6d 7d 8d 9d Th Jh Qh Ks Ac 2s'),
    c('3d 4d 5d 6h 7h 8h 9h Ts Js Qs Kc Ad 2c'),
    c('3h 4h 5h 6s 7s 8s 9s Tc Jc Qc Kd Ah 2d'),
    c('3s 4s 5s 6c 7c 8c 9c Td Jd Qd Kh As 2h'),
  ];
}

const play = (s: BigTwoState, seat: number, cards: string) => {
  const r = applyBigTwoAction(s, seat, { type: 'play', cards: c(cards) });
  if (!r.ok) throw new Error(r.error);
  return r.value.state;
};
const pass = (s: BigTwoState, seat: number) => {
  const r = applyBigTwoAction(s, seat, { type: 'pass' });
  if (!r.ok) throw new Error(r.error);
  return r.value.state;
};

describe('engine', () => {
  it('deals 13 cards each and gives the first turn to the 3♣ holder', () => {
    const s = createBigTwoGame(seededRandom(7));
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(s.hands.flat()).size).toBe(52);
    expect(s.hands[s.turn]).toContain(THREE_OF_CLUBS);
    expect(s.opening).toBe(true);
  });

  it('the first play must include 3♣ and the leader cannot pass', () => {
    const s = dealtGame(sampleHands());
    expect(s.turn).toBe(0);
    expect(applyBigTwoAction(s, 0, { type: 'play', cards: c('4c') })).toEqual({
      ok: false,
      error: 'MUST_INCLUDE_3C',
    });
    expect(applyBigTwoAction(s, 0, { type: 'pass' })).toEqual({ ok: false, error: 'CANNOT_PASS' });
    expect(applyBigTwoAction(s, 1, { type: 'play', cards: c('3d') }).ok).toBe(false);
    expect(play(s, 0, '3c').turn).toBe(1);
  });

  it('followers must match size and beat the table', () => {
    let s = play(dealtGame(sampleHands()), 0, '3c');
    expect(applyBigTwoAction(s, 1, { type: 'play', cards: c('3d 4d') })).toMatchObject({
      error: 'INVALID_COMBO',
    });
    expect(applyBigTwoAction(s, 1, { type: 'play', cards: c('5c') })).toMatchObject({
      error: 'NOT_IN_HAND',
    });
    s = play(s, 1, '3d');
    expect(applyBigTwoAction(s, 2, { type: 'play', cards: c('3h') }).ok).toBe(true);
    expect(applyBigTwoAction(play(s, 2, '3h'), 3, { type: 'play', cards: c('3s') }).ok).toBe(true);
  });

  it('after three passes the last player leads freely', () => {
    let s = play(dealtGame(sampleHands()), 0, '3c');
    s = play(s, 1, '2c');
    s = pass(s, 2);
    s = pass(s, 3);
    expect(s.table?.seat).toBe(1);
    s = pass(s, 0);
    expect(s.turn).toBe(1);
    expect(s.table).toBeNull();
    expect(s.round).toEqual([null, null, null, null]);
    // 自由出牌可以換張數
    s = play(s, 1, '3d 4d 5d 6h 7h');
    expect(s.table?.combo.kind).toBe('straight');
  });

  it('ends when someone empties their hand', () => {
    const hands = sampleHands();
    hands[0] = c('3c');
    let s = dealtGame(hands);
    s = play(s, 0, '3c');
    expect(s.finishedBy).toBe(0);
    expect(applyBigTwoAction(s, 0, { type: 'pass' })).toMatchObject({ error: 'GAME_OVER' });
    expect(placements(s, 0)).toEqual([1, 2, 3, 4]);
  });

  it('places by cards left, ties broken by turn order after the winner', () => {
    const s = dealtGame([c('3c'), c('4c 5c'), c('6c'), c('7c 8c')]);
    expect(placements({ ...s, hands: [[], c('4c 5c'), c('6c'), c('7c 8c')] }, 0)).toEqual([
      1, 3, 2, 4,
    ]);
    expect(placements({ ...s, hands: [[], c('4c'), c('6c'), c('7c 8c')] }, 0, 1)).toEqual([
      1, 4, 2, 3,
    ]);
  });
});

describe('hints and bots', () => {
  it('only suggests legal plays, opening with 3♣', () => {
    const s = dealtGame(sampleHands());
    const plays = legalPlays(s, 0);
    expect(plays.length).toBeGreaterThan(0);
    for (const p of plays) expect(p.cards).toContain(THREE_OF_CLUBS);
    expect(plays[0]!.cards.length).toBe(5); // 3♣4♣5♣6♦7♦ 順子
  });

  it('four bots always finish a game', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = createBigTwoGame(seededRandom(seed));
      for (let i = 0; i < 500 && s.finishedBy === null; i++) {
        const r = applyBigTwoAction(s, s.turn, botAction(s, s.turn));
        if (!r.ok) throw new Error(`seed ${seed}: ${r.error}`);
        s = r.value.state;
      }
      expect(s.finishedBy).not.toBeNull();
    }
  });
});

describe('platform definition', () => {
  it('validates actions', () => {
    expect(BigTwoActionSchema.safeParse({ kind: 'play', cards: [0, 5] }).success).toBe(true);
    expect(BigTwoActionSchema.safeParse({ kind: 'pass' }).success).toBe(true);
    for (const bad of [
      { kind: 'play', cards: [] },
      { kind: 'play', cards: [1, 1] },
      { kind: 'play', cards: [52] },
      { kind: 'play', cards: [1, 2, 3, 4, 5, 6] },
      { kind: 'pass', seat: 1 },
    ]) {
      expect(BigTwoActionSchema.safeParse(bad).success).toBe(false);
    }
  });

  const newMatch = (hands?: Card[][]) =>
    new Match(hands ? createBigTwoDefinition({ hands }) : bigTwoGame, {
      mode: 'standard',
      seats: 4,
      timeControl: null,
      random: seededRandom(11),
      now: 0,
    });
  let id = 0;
  const intent = (m: { version: number }, action: unknown) => ({
    actionId: `bigtwo-${++id}-xx`,
    expectedVersion: m.version,
    action,
  });

  it('hides other hands from each viewer and from spectators', () => {
    const m = newMatch(sampleHands());
    for (let seat = 0; seat < 4; seat++) {
      const v = m.view(seat);
      expect(BigTwoMatchViewSchema.safeParse(v).success).toBe(true);
      expect(v.hand).toEqual(sampleHands()[seat]);
      expect(v.handCounts).toEqual([13, 13, 13, 13]);
      expect(v.result).toBeNull();
    }
    expect(m.view(null).hand).toEqual([]);
    expect(JSON.stringify(m.view(1))).not.toContain(JSON.stringify(sampleHands()[0]));
  });

  it('plays a full match through the platform and records placements', () => {
    const hands = sampleHands();
    hands[0] = c('3c 4c');
    const m = newMatch(hands);
    expect(m.turnSeat).toBe(0);
    expect(m.submitAction(1, intent(m, { kind: 'pass' }), 1).ok).toBe(false);
    expect(m.submitAction(0, intent(m, { kind: 'play', cards: c('3c') }), 1).ok).toBe(true);
    for (const seat of [1, 2, 3]) {
      expect(m.submitAction(seat, intent(m, { kind: 'pass' }), 2).ok).toBe(true);
    }
    expect(m.turnSeat).toBe(0);
    expect(m.submitAction(0, intent(m, { kind: 'play', cards: c('4c') }), 3).ok).toBe(true);
    expect(m.outcome).toEqual({ type: 'win', winner: 0, reason: 'empty-hand' });
    const v = m.view(2);
    expect(v.result?.placements[0]).toBe(1);
    expect(v.result?.hands[1]).toHaveLength(13);
    expect(v.result?.penalties[1]).toBe(39);
    expect(m.summary().placements?.[0]).toBe(1);
  });

  it('a resign ends the game; the fewest-cards player wins and the resigner is last', () => {
    const m = newMatch(sampleHands());
    m.submitAction(0, intent(m, { kind: 'play', cards: c('3c 4c 5c 6d 7d') }), 1);
    expect(m.resign(2, 'resign-abcdefgh', 2).ok).toBe(true);
    expect(m.outcome).toEqual({ type: 'win', winner: 0, reason: 'resign' });
    expect(m.summary().placements).toEqual([1, 2, 4, 3]);
    expect(m.view(0).result?.placements).toEqual([1, 2, 4, 3]);
  });
});
