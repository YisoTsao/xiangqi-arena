import { describe, expect, it } from 'vitest';
import { Match } from '@xiangqi-arena/game-match';
import { seededRandom } from '@xiangqi-arena/shared';
import { decompositions, waitingKinds } from './hand';
import { scoreWin, totalTai, type Meld, type WinContext } from './scoring';
import {
  BASE_POINTS,
  DEAD_WALL,
  STARTING_POINTS,
  activeSeats,
  applyMahjongAction,
  createMahjongGame,
  presetGame,
  type MahjongAction,
  type MahjongState,
} from './engine';
import { botAction, botActionForView, toActionInput } from './bot';
import {
  KIND_COUNT,
  isFlower,
  kindCounts,
  kindOf,
  tileOfKind,
  type Tile,
  type TileKind,
} from './tiles';
import { MahjongActionSchema, MahjongMatchViewSchema } from './schema';
import { createMahjongDefinition, mahjongGame } from './definition';

// ── 牌的寫法：1m–9m 萬、1p–9p 筒、1s–9s 條、E S W N 風、C F P 中發白、f1–f8 花 ──
const HONOR: Record<string, number> = { E: 27, S: 28, W: 29, N: 30, C: 31, F: 32, P: 33 };
function kindOfToken(t: string): TileKind {
  if (t in HONOR) return HONOR[t]!;
  if (t[0] === 'f') return 33 + Number(t.slice(1));
  const n = Number(t[0]) - 1;
  return { m: 0, p: 9, s: 18 }[t[1] as 'm' | 'p' | 's'] + n;
}
const kinds = (s: string): TileKind[] => s.trim().split(/\s+/).filter(Boolean).map(kindOfToken);
const counts = (s: string): number[] => {
  const c = Array.from({ length: KIND_COUNT }, () => 0);
  for (const k of kinds(s)) c[k]!++;
  return c;
};

/** 依需要分配實體牌，避免同一張牌出現兩次 */
class TileBag {
  private used = new Set<Tile>();
  take(kind: TileKind): Tile {
    const copies = kind >= 34 ? 1 : 4;
    for (let c = 0; c < copies; c++) {
      const t = tileOfKind(kind, c);
      if (!this.used.has(t)) {
        this.used.add(t);
        return t;
      }
    }
    throw new Error(`no more ${kind}`);
  }
  tiles(s: string): Tile[] {
    return kinds(s).map((k) => this.take(k));
  }
  /** 不是花、也還沒用過的牌，用來填牌牆 */
  filler(n: number, avoid: TileKind[] = []): Tile[] {
    const out: Tile[] = [];
    for (let t = 0; t < 136 && out.length < n; t++) {
      if (this.used.has(t) || avoid.includes(kindOf(t))) continue;
      this.used.add(t);
      out.push(t);
    }
    return out;
  }
}

interface WallSpec {
  /** 從莊家起的四家手牌（莊家 17 張） */
  hands: [string, string, string, string];
  /** 之後依序摸到的牌 */
  draws?: string;
  /** 補牌（從尾端拿），依補牌順序 */
  replacements?: string;
  filler?: number;
  avoid?: string;
}

function wallOf(spec: WallSpec): { wall: Tile[]; bag: TileBag } {
  const bag = new TileBag();
  spec.hands.forEach((h, i) => {
    if (kinds(h).length !== (i === 0 ? 17 : 16)) throw new Error(`hand ${i} has wrong size`);
  });
  const hands = spec.hands.flatMap((h) => bag.tiles(h));
  const draws = bag.tiles(spec.draws ?? '');
  const repl = bag.tiles(spec.replacements ?? '');
  const filler = bag.filler(spec.filler ?? 40, kinds(spec.avoid ?? ''));
  return { wall: [...hands, ...draws, ...filler, ...repl.reverse()], bag };
}

const game = (spec: WallSpec, dealer = 0): MahjongState => presetGame(wallOf(spec).wall, dealer);

function act(s: MahjongState, seat: number, a: MahjongAction): MahjongState {
  const r = applyMahjongAction(s, seat, a);
  if (!r.ok) throw new Error(`seat ${seat} ${JSON.stringify(a)}: ${r.error}`);
  return r.value.state;
}
const tileIn = (s: MahjongState, seat: number, token: string): Tile =>
  s.players[seat]!.hand.find((t) => kindOf(t) === kindOfToken(token))!;
const passAll = (s: MahjongState, except: number[] = []): MahjongState =>
  activeSeats(s)
    .filter((i) => !except.includes(i))
    .reduce((acc, i) => act(acc, i, { type: 'pass' }), s);

// 「沒有任何組合」的散牌：閒家 16 張，莊家再多一張
const J16 = '1m 4m 7m 1p 4p 7p 1s 4s 7s E S W N C F P';
const JUNK = `${J16} 9m`;

describe('hand analysis', () => {
  it('finds all ways to split a winning hand', () => {
    const d = decompositions(counts('1m 1m 1m 2m 2m 2m 3m 3m 3m 4m 4m'), 3);
    // 4m 對（三刻子或三順子），或 1m 對 + 123、234、234
    expect(d.length).toBe(3);
    expect(decompositions(counts('1m 2m 4m 5m 5m'), 1)).toEqual([]);
  });

  it('lists waiting tiles', () => {
    expect(waitingKinds(counts('2m 3m 5p 5p'), 1)).toEqual(kinds('1m 4m'));
    expect(waitingKinds(counts('1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 9m 9m'), 4)).toEqual(
      kinds('1m 2m 3m 4m 5m 6m 7m 8m 9m'),
    );
  });
});

describe('scoring', () => {
  const base: Omit<WinContext, 'concealed' | 'winningKind'> = {
    melds: [],
    flowers: [],
    selfDrawn: false,
    seatWind: 1,
    roundWind: 0,
    lastTile: false,
    afterKong: false,
    robKong: false,
    firstTurn: null,
    flowerWin: null,
  };
  const score = (hand: string, win: string, extra: Partial<WinContext> = {}) => {
    const bag = new TileBag();
    const items = scoreWin({
      ...base,
      concealed: bag.tiles(hand),
      winningKind: kindOfToken(win),
      ...extra,
    });
    return { keys: items.map((i) => i.key).sort(), tai: totalTai(items) };
  };

  it('平胡 + 門清', () => {
    const r = score('1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 6p 7p 8p 5s 5s', '4m');
    expect(r.keys).toEqual(['all-chows', 'concealed']);
    expect(r.tai).toBe(3);
  });

  it('門清自摸 replaces 門清 and 自摸; no 平胡 on self draw', () => {
    const r = score('1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 6p 7p 8p 5s 5s', '4m', {
      selfDrawn: true,
    });
    expect(r.keys).toEqual(['concealed-self-draw']);
  });

  it('碰碰胡 counts concealed pungs, but not the pung completed by a discard', () => {
    const hand = '1m 1m 1m 5p 5p 5p 9s 9s 9s C C C 3m 3m 3m 7p 7p';
    const ron = score(hand, '3m');
    expect(ron.keys).toEqual(['all-pungs', 'concealed', 'dragon', 'four-concealed']);
    const tsumo = score(hand, '3m', { selfDrawn: true });
    expect(tsumo.keys).toEqual(['all-pungs', 'concealed-self-draw', 'dragon', 'five-concealed']);
  });

  it('清一色、混一色、字一色', () => {
    expect(score('1m 1m 1m 2m 3m 4m 5m 6m 7m 7m 8m 9m 9m 9m 9m 2m 2m', '2m').keys).toContain(
      'full-flush',
    );
    expect(score('1m 2m 3m 4m 5m 6m 7m 8m 9m E E E C C C S S', 'S').keys).toContain('half-flush');
    const honors = score('E E E S S S W W W C C C F F F P P', 'P');
    expect(honors.keys).toContain('all-honors');
    expect(honors.keys).not.toContain('all-pungs');
  });

  it('大三元 and 小三元 replace the single dragon tai', () => {
    expect(score('C C C F F F P P P 1m 2m 3m 4p 5p 6p 9s 9s', '9s').keys).toContain(
      'big-three-dragons',
    );
    const small = score('C C C F F F P P 1m 2m 3m 4p 5p 6p 7s 8s 9s', '9s');
    expect(small.keys).toContain('little-three-dragons');
    expect(small.keys).not.toContain('dragon');
  });

  it('門風 / 圈風 and own flowers', () => {
    const r = score('S S S E E E 1m 2m 3m 4p 5p 6p 7s 8s 9s 9m 9m', '9m', {
      flowers: new TileBag().tiles('f2 f6 f1'),
    });
    // seatWind 1 = 南，roundWind 0 = 東；花 f2 夏、f6 蘭 是南家的花
    expect(r.keys.filter((k) => k === 'flower')).toHaveLength(2);
    expect(r.keys).toContain('seat-wind');
    expect(r.keys).toContain('round-wind');
  });

  it('獨聽 for an edge wait', () => {
    expect(score('1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 6p 7p 8p 5s 5s', '3m').keys).toContain(
      'single-wait',
    );
  });

  it('全求人 needs five exposed melds and a discard', () => {
    const bag = new TileBag();
    const meld = (type: Meld['type'], s: string): Meld => {
      const tiles = bag.tiles(s);
      return { type, kind: kindOf(tiles[0]!), tiles, concealed: false, from: 0 };
    };
    const melds = [
      meld('chow', '1m 2m 3m'),
      meld('pung', '5p 5p 5p'),
      meld('chow', '7s 8s 9s'),
      meld('pung', 'E E E'),
      meld('chow', '4m 5m 6m'),
    ];
    const items = scoreWin({
      ...base,
      melds,
      concealed: bag.tiles('9p 9p'),
      winningKind: kindOfToken('9p'),
    });
    expect(items.map((i) => i.key)).toContain('all-melded');
  });

  it('rejects a hand that is not complete', () => {
    expect(scoreWin({ ...base, concealed: new TileBag().tiles(JUNK), winningKind: 0 })).toEqual([]);
  });
});

describe('dealing', () => {
  it('deals 17 to the dealer and 16 to others, replacing flowers from the back', () => {
    const s = createMahjongGame({ seed: 42, dealer: 2 });
    expect(s.players[2]!.hand.length).toBe(17);
    for (const seat of [0, 1, 3]) expect(s.players[seat]!.hand.length).toBe(16);
    for (const p of s.players) expect(p.hand.some(isFlower)).toBe(false);
    const all = [...s.wall, ...s.players.flatMap((p) => [...p.hand, ...p.flowers])].sort(
      (a, b) => a - b,
    );
    expect(all).toEqual(Array.from({ length: 144 }, (_, i) => i));
    expect(s.phase).toMatchObject({ type: 'discard', seat: 2 });
  });

  it('is deterministic for the same seed', () => {
    const a = createMahjongGame({ seed: 7, dealer: 0 });
    const b = createMahjongGame({ seed: 7, dealer: 0 });
    expect(a.players).toEqual(b.players);
  });
});

describe('turn flow', () => {
  it('opens a claim window for all three other seats after every discard', () => {
    let s = game({ hands: [JUNK, J16, J16.replace('1m', '2m'), J16.replace('1m', '3m')] });
    s = act(s, 0, { type: 'discard', tile: tileIn(s, 0, 'E') });
    expect(s.phase.type).toBe('claim');
    expect(activeSeats(s)).toEqual([1, 2, 3]);
    s = passAll(s);
    expect(s.phase).toMatchObject({ type: 'discard', seat: 1 });
    expect(s.players[1]!.hand.length).toBe(17);
  });

  it('rejects acting out of turn', () => {
    const s = game({ hands: [JUNK, J16, J16, J16.replace('1m', '2m')] });
    const r = applyMahjongAction(s, 1, { type: 'discard', tile: tileIn(s, 1, 'E') });
    expect(r.ok).toBe(false);
  });

  it('pung beats chow even though the chow seat is next', () => {
    let s = game({
      hands: [
        JUNK.replace('1m', '4m'),
        J16.replace('1m 4m', '2m 3m'),
        J16.replace('1m 4m', '4m 4m'),
        J16.replace('1m 4m', '6m 8m'),
      ],
    });
    s = act(s, 0, { type: 'discard', tile: tileIn(s, 0, '4m') });
    s = act(s, 1, { type: 'chow', tiles: [tileIn(s, 1, '2m'), tileIn(s, 1, '3m')] });
    s = act(s, 2, { type: 'pung' });
    s = act(s, 3, { type: 'pass' });
    expect(s.phase).toMatchObject({ type: 'discard', seat: 2, canWin: false });
    expect(s.players[2]!.melds[0]).toMatchObject({ type: 'pung', from: 0 });
    expect(s.players[1]!.melds).toEqual([]);
    expect(s.players[0]!.discards).toEqual([]);
  });
});

/** 聽 5s 單吊的手牌（16 張） */
const WAIT_5S = '1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 6p 7p 8p 5s';

describe('winning', () => {
  it('天胡: the dealer wins on the opening 17 tiles', () => {
    let s = game({ hands: [`${WAIT_5S} 5s`, J16, J16, J16] });
    s = act(s, 0, { type: 'win' });
    const r = s.lastHand!;
    expect(r.winner).toBe(0);
    expect(r.tai.map((t) => t.key)).toContain('heaven');
    const pay = BASE_POINTS + totalTai(r.tai) + r.dealerTai;
    expect(r.deltas).toEqual([pay * 3, -pay, -pay, -pay]);
    expect(s.points[0]).toBe(STARTING_POINTS + pay * 3);
    // 莊家胡：連莊
    expect(s.dealer).toBe(0);
    expect(s.streak).toBe(1);
  });

  it('ron: only the discarder pays; a non-dealer win passes the deal', () => {
    let s = game({ hands: [JUNK.replace('9m', '5s'), WAIT_5S, J16, J16] });
    s = act(s, 0, { type: 'discard', tile: tileIn(s, 0, '5s') });
    s = act(s, 1, { type: 'win' });
    s = passAll(s);
    const r = s.lastHand!;
    expect(r).toMatchObject({ winner: 1, from: 0 });
    // 莊家放槍：多付莊家台；第一張就胡是人胡
    expect(r.tai.map((t) => t.key)).toContain('human');
    const pay = BASE_POINTS + totalTai(r.tai) + r.dealerTai;
    expect(r.deltas).toEqual([-pay, pay, 0, 0]);
    expect(s.dealer).toBe(1);
    expect(s.phase.type).toBe('hand-end');
  });

  it('截胡: when two seats can win, the one nearest the discarder wins', () => {
    let s = game({
      hands: [JUNK.replace('9m', '5s'), J16, WAIT_5S, WAIT_5S.replace('1m 2m 3m', '1p 2p 3p')],
    });
    s = act(s, 0, { type: 'discard', tile: tileIn(s, 0, '5s') });
    s = act(s, 3, { type: 'win' });
    s = act(s, 2, { type: 'win' });
    s = act(s, 1, { type: 'pass' });
    expect(s.lastHand).toMatchObject({ winner: 2, from: 0 });
  });

  it('過水: passing a winning tile blocks ron on it until your next draw', () => {
    let s = game({
      hands: [JUNK.replace('9m', '5s'), J16.replace('1m', '5s'), WAIT_5S, J16],
      draws: '9p 9p',
      avoid: '5s',
    });
    s = act(s, 0, { type: 'discard', tile: tileIn(s, 0, '5s') });
    s = passAll(s);
    expect(s.players[2]!.furiten).toEqual(kinds('5s'));
    // 1 摸 9p，打出 5s：2 還沒摸牌，不能胡
    s = act(s, 1, { type: 'discard', tile: tileIn(s, 1, '5s') });
    const r = applyMahjongAction(s, 2, { type: 'win' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FURITEN');
    s = passAll(s);
    // 輪到 2 摸牌，過水解除
    expect(s.phase).toMatchObject({ type: 'discard', seat: 2 });
    expect(s.players[2]!.furiten).toEqual([]);
  });

  it('搶槓: another seat can win on the tile being added to a pung', () => {
    let s = game({
      hands: [
        '5s 5s 5s 5s 1m 4m 7m 1p 4p 7p E S W N C F P',
        J16.replace('1m', '2m'),
        '1p 2p 3p 4p 5p 6p 7p 8p 9p 2m 3m 4m 9m 9m 3s 4s',
        J16.replace('1m', '3m'),
      ],
    });
    // 讓莊家先有一組 5s 刻子（碰 3 家的），手上留一張 5s
    const p0 = s.players[0]!;
    const fives = p0.hand.filter((t) => kindOf(t) === kindOfToken('5s'));
    p0.hand = p0.hand.filter((t) => !fives.slice(0, 3).includes(t));
    p0.melds.push({
      type: 'pung',
      kind: kindOfToken('5s'),
      tiles: fives.slice(0, 3),
      concealed: false,
      from: 3,
    });
    s.claimed = true;
    s = act(s, 0, { type: 'self-kong', kind: kindOfToken('5s') });
    expect(s.phase).toMatchObject({ type: 'claim', from: 0 });
    expect(activeSeats(s)).toEqual([1, 2, 3]);
    s = act(s, 2, { type: 'win' });
    s = passAll(s);
    expect(s.lastHand).toMatchObject({ winner: 2, from: 0 });
    expect(s.lastHand!.tai.map((t) => t.key)).toContain('rob-kong');
  });

  it('a kong that nobody robs completes and draws a replacement from the back', () => {
    let s = game({
      hands: [
        '5s 5s 5s 5s 1m 4m 7m 1p 4p 7p E S W N C F P',
        J16,
        J16.replace('1m', '2m'),
        J16.replace('1m', '3m'),
      ],
      replacements: '9p',
    });
    s = act(s, 0, { type: 'self-kong', kind: kindOfToken('5s') });
    expect(s.players[0]!.melds[0]).toMatchObject({ type: 'kong', concealed: true });
    expect(s.phase).toMatchObject({ type: 'discard', seat: 0, afterKong: true });
    expect(kindOf((s.phase as { drawn: Tile }).drawn)).toBe(kindOfToken('9p'));
  });

  it('八仙過海: the eighth flower wins at once and everyone pays', () => {
    const s = game({
      hands: [
        'f1 f2 f3 f4 f5 f6 f7 f8 1m 4m 7m 1p 4p 7p E S W',
        J16,
        J16.replace('1m', '2m'),
        J16.replace('1m', '3m'),
      ],
      replacements: '2p 3p 5p 6p 8p 9p 2s 3s',
    });
    expect(s.lastHand).toMatchObject({ kind: 'win', winner: 0, from: null });
    expect(s.lastHand!.tai.map((t) => t.key)).toEqual(['eight-flowers']);
    expect(s.phase.type).toBe('hand-end');
  });

  it('流局: the wall runs down to the dead wall and the dealer keeps the deal', () => {
    let s = game({
      hands: [JUNK, J16, J16.replace('1m', '2m'), J16.replace('1m', '3m')],
      filler: DEAD_WALL + 2,
    });
    // 打到牌牆只剩 16 張
    for (let guard = 0; guard < 50 && s.phase.type !== 'hand-end'; guard++) {
      const seat = activeSeats(s)[0]!;
      s =
        s.phase.type === 'discard'
          ? act(s, seat, { type: 'discard', tile: s.players[seat]!.hand[0]! })
          : passAll(s);
    }
    expect(s.lastHand).toMatchObject({ kind: 'draw' });
    expect(s.dealer).toBe(0);
    expect(s.streak).toBe(1);
  });
});

describe('platform integration', () => {
  it('parses actions strictly', () => {
    expect(MahjongActionSchema.safeParse({ kind: 'discard', tile: 5 }).success).toBe(true);
    expect(MahjongActionSchema.safeParse({ kind: 'discard', tile: 500 }).success).toBe(false);
    expect(MahjongActionSchema.safeParse({ kind: 'win', extra: 1 }).success).toBe(false);
  });

  it('only shows a player their own hand, and hides other seats’ concealed kongs', () => {
    const s = createMahjongGame({ seed: 3, dealer: 0 });
    const def = createMahjongDefinition();
    const v1 = def.view(s, 1);
    expect(v1.hand).toEqual(s.players[1]!.hand);
    expect(v1.players[0]!.handCount).toBe(17);
    expect(JSON.stringify(def.view(s, null).hand)).toBe('[]');
    s.players[0]!.melds.push({
      type: 'kong',
      kind: 5,
      tiles: [20, 21, 22, 23],
      concealed: true,
      from: null,
    });
    expect(def.view(s, 1).players[0]!.melds[0]).toMatchObject({ kind: null, tiles: [] });
    expect(def.view(s, 0).players[0]!.melds[0]).toMatchObject({ kind: 5 });
  });

  it('plays a whole east round with four bots through the platform Match', () => {
    for (const seed of [1, 2, 3]) {
      const random = seededRandom(seed);
      const match = new Match(mahjongGame, { mode: 'east', timeControl: null, random, now: 0 });
      let n = 0;
      while (!match.isOver && n < 20_000) {
        const seat = match.activeSeats[0]!;
        const state = (match as unknown as { state: MahjongState }).state;
        // 一半的座位用完整狀態、一半只看自己的畫面，兩種電腦都要能打完
        const input =
          seat % 2 === 0
            ? toActionInput(botAction(state, seat))
            : botActionForView(MahjongMatchViewSchema.parse(match.view(seat)));
        const r = match.submitAction(
          seat,
          { actionId: `a${n}`, expectedVersion: match.version, action: input },
          n,
        );
        expect(r.ok).toBe(true);
        if (n % 97 === 0) {
          for (const viewer of [0, 1, 2, 3, null]) {
            expect(MahjongMatchViewSchema.safeParse(match.view(viewer)).success).toBe(true);
          }
        }
        n++;
      }
      expect(match.isOver).toBe(true);
      const state = (match as unknown as { state: MahjongState }).state;
      expect(state.points.reduce((a, b) => a + b, 0)).toBe(STARTING_POINTS * 4);
      const summary = match.summary();
      expect([...summary.placements!].sort()).toEqual([1, 2, 3, 4]);
      expect(summary.outcome).toMatchObject({ type: 'win', reason: 'points' });
    }
  });
});
