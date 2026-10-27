import { err, ok, seededRandom, shuffle, type Result } from '@xiangqi-arena/shared';
import { isComplete } from './hand';
import { scoreWin, totalTai, type FirstTurnWin, type Meld, type TaiItem } from './scoring';
import {
  HAND_SIZE,
  fullWall,
  isFlower,
  kindCounts,
  kindOf,
  sortTiles,
  suitOf,
  tileLabel,
  kindLabel,
  type Tile,
  type TileKind,
} from './tiles';

export const MAHJONG_SEATS = 4;
/** 牌牆剩這麼多張時流局（留一墩半之外的 16 張） */
export const DEAD_WALL = 16;
/** 每把底分；每台 1 分 */
export const BASE_POINTS = 3;
export const POINTS_PER_TAI = 1;
export const STARTING_POINTS = 500;

export interface PlayerState {
  /** 暗手 */
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  /** 過水：自己下次摸牌前不能胡的牌種 */
  furiten: TileKind[];
}

export type ClaimResponse =
  | { type: 'pass' }
  | { type: 'chow'; tiles: [Tile, Tile] }
  | { type: 'pung' }
  | { type: 'kong' }
  | { type: 'win' };

export type Phase =
  | {
      type: 'discard';
      seat: number;
      /** 剛摸進的牌；吃碰後要打牌時為 null */
      drawn: Tile | null;
      /** 這手可以自摸（剛摸牌、開局的莊家） */
      canWin: boolean;
      /** 剛補過槓 */
      afterKong: boolean;
    }
  | {
      type: 'claim';
      /** 打出（或加槓）這張牌的座位 */
      from: number;
      tile: Tile;
      /** 每個座位的回應；from 的位置固定為 pass */
      responses: (ClaimResponse | null)[];
      /** 加槓等待搶槓時：加槓的那組面子 */
      robKong: { meldIndex: number } | null;
    }
  | { type: 'hand-end'; ready: boolean[] }
  | { type: 'over' };

export interface HandResult {
  hand: number;
  kind: 'win' | 'draw';
  winner: number | null;
  /** 放槍者；自摸與流局為 null */
  from: number | null;
  winningTile: Tile | null;
  tai: TaiItem[];
  /** 莊家 1 台 + 連莊、拉莊各 2 台，只算在莊家參與的那一筆 */
  dealerTai: number;
  dealer: number;
  deltas: number[];
  /** 結束時各家的暗手（公開） */
  hands: Tile[][];
}

export interface HistoryEntry {
  seq: number;
  seat: number;
  notation: string;
}

export interface MahjongState {
  seats: number;
  /** 每一把的洗牌都由 seed + 第幾把決定；只存在伺服器 */
  seed: number;
  /** 要打幾圈：1 = 東風圈，4 = 四圈 */
  rounds: number;
  initialDealer: number;
  dealer: number;
  /** 連莊次數 */
  streak: number;
  /** 下莊次數；每 4 次換圈風 */
  dealerChanges: number;
  handNumber: number;
  wall: Tile[];
  players: PlayerState[];
  points: number[];
  phase: Phase;
  /** 本把是否有人吃碰槓過（天地人胡用） */
  claimed: boolean;
  discardCount: number;
  /** 本把各家正常摸牌次數（不含發牌與補牌） */
  draws: number[];
  /** 本把的紀錄 */
  history: HistoryEntry[];
  lastHand: HandResult | null;
}

export type MahjongAction =
  | { type: 'discard'; tile: Tile }
  | { type: 'win' }
  /** 自己回合的暗槓或加槓 */
  | { type: 'self-kong'; kind: TileKind }
  | ClaimResponse
  | { type: 'next' };

export type MahjongError =
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  | 'WRONG_PHASE'
  | 'NOT_IN_HAND'
  | 'CANNOT_DISCARD_FLOWER'
  | 'CANNOT_WIN'
  | 'FURITEN'
  | 'CANNOT_CHOW'
  | 'CANNOT_PUNG'
  | 'CANNOT_KONG'
  | 'ALREADY_RESPONDED';

export const seatWind = (s: MahjongState, seat: number): number =>
  (seat - s.dealer + s.seats) % s.seats;
export const roundWind = (s: MahjongState): number => Math.floor(s.dealerChanges / 4) % 4;

function clone(s: MahjongState): MahjongState {
  const phase: Phase =
    s.phase.type === 'claim'
      ? { ...s.phase, responses: s.phase.responses.slice() }
      : s.phase.type === 'hand-end'
        ? { ...s.phase, ready: s.phase.ready.slice() }
        : { ...s.phase };
  return {
    ...s,
    wall: s.wall.slice(),
    players: s.players.map((p) => ({
      hand: p.hand.slice(),
      melds: p.melds.map((m) => ({ ...m, tiles: m.tiles.slice() })),
      flowers: p.flowers.slice(),
      discards: p.discards.slice(),
      furiten: p.furiten.slice(),
    })),
    points: s.points.slice(),
    draws: s.draws.slice(),
    history: s.history.slice(),
    phase,
  };
}

const log = (s: MahjongState, seat: number, notation: string): void => {
  s.history.push({ seq: s.history.length + 1, seat, notation });
};

const countKind = (tiles: readonly Tile[], kind: TileKind): number =>
  tiles.filter((t) => kindOf(t) === kind).length;

function takeKind(hand: Tile[], kind: TileKind, n: number): Tile[] {
  const out: Tile[] = [];
  for (let i = hand.length - 1; i >= 0 && out.length < n; i--) {
    if (kindOf(hand[i]!) === kind) out.push(...hand.splice(i, 1));
  }
  return out;
}

// ── 結算 ────────────────────────────────────────────────────

interface WinFlags {
  from: number | null;
  winningTile: Tile | null;
  robKong?: boolean;
  afterKong?: boolean;
  lastTile?: boolean;
  firstTurn?: FirstTurnWin | null;
  flowerWin?: 'eight-flowers' | 'seven-rob-one' | null;
}

function winTai(s: MahjongState, seat: number, flags: WinFlags): TaiItem[] {
  const p = s.players[seat]!;
  const concealed =
    flags.from !== null && flags.winningTile !== null && !flags.flowerWin
      ? [...p.hand, flags.winningTile]
      : p.hand;
  return scoreWin({
    concealed,
    melds: p.melds,
    flowers: p.flowers,
    winningKind: flags.winningTile === null ? -1 : kindOf(flags.winningTile),
    selfDrawn: flags.from === null,
    seatWind: seatWind(s, seat),
    roundWind: roundWind(s),
    lastTile: flags.lastTile ?? false,
    afterKong: flags.afterKong ?? false,
    robKong: flags.robKong ?? false,
    firstTurn: flags.firstTurn ?? null,
    flowerWin: flags.flowerWin ?? null,
  });
}

function finishHand(s: MahjongState, result: HandResult, dealerKeeps: boolean): void {
  s.lastHand = result;
  for (let i = 0; i < s.seats; i++) s.points[i]! += result.deltas[i]!;
  if (dealerKeeps) {
    s.streak++;
  } else {
    s.dealer = (s.dealer + 1) % s.seats;
    s.streak = 0;
    s.dealerChanges++;
  }
  s.phase =
    s.dealerChanges >= s.rounds * 4
      ? { type: 'over' }
      : { type: 'hand-end', ready: Array.from({ length: s.seats }, () => false) };
}

function settleWin(s: MahjongState, winner: number, flags: WinFlags): void {
  const tai = winTai(s, winner, flags);
  const dealerTai = 1 + 2 * s.streak;
  const deltas = Array.from({ length: s.seats }, () => 0);
  const payers =
    flags.from !== null
      ? [flags.from]
      : Array.from({ length: s.seats }, (_, i) => i).filter((i) => i !== winner);
  for (const payer of payers) {
    const dealerInvolved = winner === s.dealer || payer === s.dealer;
    const amount =
      BASE_POINTS + (totalTai(tai) + (dealerInvolved ? dealerTai : 0)) * POINTS_PER_TAI;
    deltas[payer]! -= amount;
    deltas[winner]! += amount;
  }
  const hands = s.players.map((p) => sortTiles(p.hand));
  if (flags.from !== null && flags.winningTile !== null && !flags.flowerWin) {
    hands[winner] = sortTiles([...hands[winner]!, flags.winningTile]);
  }
  log(s, winner, flags.from === null ? '自摸' : '胡');
  finishHand(
    s,
    {
      hand: s.handNumber,
      kind: 'win',
      winner,
      from: flags.from,
      winningTile: flags.winningTile,
      tai,
      dealerTai,
      dealer: s.dealer,
      deltas,
      hands,
    },
    winner === s.dealer,
  );
}

function settleDraw(s: MahjongState): void {
  log(s, s.dealer, '流局');
  finishHand(
    s,
    {
      hand: s.handNumber,
      kind: 'draw',
      winner: null,
      from: null,
      winningTile: null,
      tai: [],
      dealerTai: 0,
      dealer: s.dealer,
      deltas: Array.from({ length: s.seats }, () => 0),
      hands: s.players.map((p) => sortTiles(p.hand)),
    },
    true,
  );
}

// ── 摸牌與補花 ──────────────────────────────────────────────

/**
 * 把 seat 手上的花全部亮出並從牌尾補牌。
 * 回傳 false 表示這把已經結束（八仙過海、七搶一或牌牆不夠流局）。
 */
function revealFlowers(s: MahjongState, seat: number): boolean {
  const p = s.players[seat]!;
  for (;;) {
    const i = p.hand.findIndex(isFlower);
    if (i < 0) return true;
    const [flower] = p.hand.splice(i, 1);
    p.flowers.push(flower!);
    log(s, seat, `補花 ${tileLabel(flower!)}`);
    if (p.flowers.length === 8) {
      settleWin(s, seat, { from: null, winningTile: flower!, flowerWin: 'eight-flowers' });
      return false;
    }
    const holder = s.players.findIndex((q, j) => j !== seat && q.flowers.length === 7);
    if (holder >= 0) {
      settleWin(s, holder, { from: seat, winningTile: flower!, flowerWin: 'seven-rob-one' });
      return false;
    }
    if (s.wall.length <= DEAD_WALL) {
      settleDraw(s);
      return false;
    }
    p.hand.push(s.wall.pop()!);
  }
}

/** seat 摸一張（fromBack = 槓後補牌），之後輪到他打牌 */
function drawFor(s: MahjongState, seat: number, fromBack: boolean): void {
  if (s.wall.length <= DEAD_WALL) {
    settleDraw(s);
    return;
  }
  const p = s.players[seat]!;
  p.hand.push(fromBack ? s.wall.pop()! : s.wall.shift()!);
  if (!fromBack) {
    s.draws[seat]!++;
    p.furiten = [];
  }
  if (!revealFlowers(s, seat)) return;
  s.phase = {
    type: 'discard',
    seat,
    drawn: p.hand[p.hand.length - 1]!,
    canWin: true,
    afterKong: fromBack,
  };
}

/** 開新的一把：洗牌、發牌（莊家 17 張）、依序補花 */
function startHand(s: MahjongState): void {
  const random = seededRandom((s.seed + s.handNumber * 7919) >>> 0);
  s.wall = shuffle(fullWall(), random);
  s.players = Array.from({ length: s.seats }, () => ({
    hand: [],
    melds: [],
    flowers: [],
    discards: [],
    furiten: [],
  }));
  s.claimed = false;
  s.discardCount = 0;
  s.draws = Array.from({ length: s.seats }, () => 0);
  s.history = [];
  for (let i = 0; i < s.seats; i++) {
    const seat = (s.dealer + i) % s.seats;
    s.players[seat]!.hand = s.wall.splice(0, HAND_SIZE + (i === 0 ? 1 : 0));
  }
  for (let i = 0; i < s.seats; i++) {
    if (!revealFlowers(s, (s.dealer + i) % s.seats)) return;
  }
  s.phase = { type: 'discard', seat: s.dealer, drawn: null, canWin: true, afterKong: false };
}

export interface MahjongSetup {
  seed: number;
  dealer: number;
  rounds?: number;
}

function baseState({ seed, dealer, rounds = 1 }: MahjongSetup): MahjongState {
  return {
    seats: MAHJONG_SEATS,
    seed: seed >>> 0,
    rounds,
    initialDealer: dealer,
    dealer,
    streak: 0,
    dealerChanges: 0,
    handNumber: 1,
    wall: [],
    players: [],
    points: Array.from({ length: MAHJONG_SEATS }, () => STARTING_POINTS),
    phase: { type: 'over' },
    claimed: false,
    discardCount: 0,
    draws: [],
    history: [],
    lastHand: null,
  };
}

export function createMahjongGame(setup: MahjongSetup): MahjongState {
  const s = baseState(setup);
  startHand(s);
  return s;
}

/**
 * 用指定的牌牆開局（測試用）：wall 依發牌順序排列，從莊家起每人 16 張、莊家多 1 張，
 * 之後的牌依序是摸牌順序；補牌從尾端拿。
 */
export function presetGame(wall: Tile[], dealer = 0, rounds = 1): MahjongState {
  const s = baseState({ seed: 1, dealer, rounds });
  s.wall = wall.slice();
  s.players = Array.from({ length: s.seats }, () => ({
    hand: [],
    melds: [],
    flowers: [],
    discards: [],
    furiten: [],
  }));
  s.draws = Array.from({ length: s.seats }, () => 0);
  for (let i = 0; i < s.seats; i++) {
    const seat = (dealer + i) % s.seats;
    s.players[seat]!.hand = s.wall.splice(0, HAND_SIZE + (i === 0 ? 1 : 0));
  }
  s.phase = { type: 'discard', seat: dealer, drawn: null, canWin: true, afterKong: false };
  for (let i = 0; i < s.seats; i++) {
    if (!revealFlowers(s, (dealer + i) % s.seats)) break;
  }
  return s;
}

// ── 合法性判斷（也給畫面提示與電腦玩家用） ─────────────────

const setsNeeded = (p: PlayerState): number => 5 - p.melds.length;

export function canSelfDraw(s: MahjongState, seat: number): boolean {
  if (s.phase.type !== 'discard' || s.phase.seat !== seat || !s.phase.canWin) return false;
  const p = s.players[seat]!;
  return isComplete(kindCounts(p.hand), setsNeeded(p));
}

export function canRon(s: MahjongState, seat: number, tile: Tile): boolean {
  const p = s.players[seat]!;
  if (p.furiten.includes(kindOf(tile))) return false;
  return isComplete(kindCounts([...p.hand, tile]), setsNeeded(p));
}

/** 自己回合可以暗槓或加槓的牌種 */
export function selfKongKinds(s: MahjongState, seat: number): TileKind[] {
  if (s.phase.type !== 'discard' || s.phase.seat !== seat) return [];
  const p = s.players[seat]!;
  const out = new Set<TileKind>();
  const counts = kindCounts(p.hand);
  counts.forEach((c, k) => c === 4 && out.add(k));
  for (const m of p.melds) if (m.type === 'pung' && counts[m.kind]! > 0) out.add(m.kind);
  return [...out].sort((a, b) => a - b);
}

/** 吃的所有組合（手上的兩張牌） */
export function chowOptions(s: MahjongState, seat: number): [Tile, Tile][] {
  if (s.phase.type !== 'claim' || s.phase.robKong) return [];
  if (seat !== (s.phase.from + 1) % s.seats) return [];
  const k = kindOf(s.phase.tile);
  if (k >= 27) return [];
  const hand = s.players[seat]!.hand;
  const find = (kind: TileKind): Tile | undefined => hand.find((t) => kindOf(t) === kind);
  const out: [Tile, Tile][] = [];
  for (const [a, b] of [
    [k - 2, k - 1],
    [k - 1, k + 1],
    [k + 1, k + 2],
  ] as const) {
    if (suitOf(a) !== suitOf(k) || suitOf(b) !== suitOf(k) || a < 0) continue;
    const ta = find(a);
    const tb = find(b);
    if (ta !== undefined && tb !== undefined) out.push([ta, tb]);
  }
  return out;
}

export interface ClaimOptions {
  win: boolean;
  pung: boolean;
  kong: boolean;
  chow: [Tile, Tile][];
}

export function claimOptions(s: MahjongState, seat: number): ClaimOptions {
  const none = { win: false, pung: false, kong: false, chow: [] };
  if (s.phase.type !== 'claim' || seat === s.phase.from) return none;
  const { tile, robKong } = s.phase;
  const n = countKind(s.players[seat]!.hand, kindOf(tile));
  return {
    win: canRon(s, seat, tile),
    pung: !robKong && n >= 2,
    kong: !robKong && n >= 3,
    chow: chowOptions(s, seat),
  };
}

// ── 動作 ────────────────────────────────────────────────────

function applyDiscardPhase(
  s: MahjongState,
  seat: number,
  action: MahjongAction,
): Result<string, MahjongError> {
  const phase = s.phase as Extract<Phase, { type: 'discard' }>;
  const p = s.players[seat]!;

  if (action.type === 'win') {
    if (!canSelfDraw(s, seat)) return err('CANNOT_WIN');
    const firstTurn: FirstTurnWin | null = s.claimed
      ? null
      : seat === s.dealer && s.discardCount === 0
        ? 'heaven'
        : seat !== s.dealer && s.draws[seat] === 1 && p.discards.length === 0
          ? 'earth'
          : null;
    settleWin(s, seat, {
      from: null,
      winningTile: phase.drawn ?? p.hand[p.hand.length - 1]!,
      afterKong: phase.afterKong,
      lastTile: s.wall.length === DEAD_WALL,
      firstTurn,
    });
    return ok('自摸');
  }

  if (action.type === 'self-kong') {
    if (!selfKongKinds(s, seat).includes(action.kind)) return err('CANNOT_KONG');
    const label = kindLabel(action.kind);
    if (countKind(p.hand, action.kind) === 4) {
      p.melds.push({
        type: 'kong',
        kind: action.kind,
        tiles: takeKind(p.hand, action.kind, 4),
        concealed: true,
        from: null,
      });
      s.claimed = true;
      log(s, seat, '暗槓');
      drawFor(s, seat, true);
      return ok('暗槓');
    }
    // 加槓：先讓其他人有機會搶槓
    const meldIndex = p.melds.findIndex((m) => m.type === 'pung' && m.kind === action.kind);
    const [tile] = takeKind(p.hand, action.kind, 1);
    s.phase = {
      type: 'claim',
      from: seat,
      tile: tile!,
      responses: s.players.map((_, i) => (i === seat ? { type: 'pass' as const } : null)),
      robKong: { meldIndex },
    };
    log(s, seat, `加槓 ${label}`);
    return ok(`加槓 ${label}`);
  }

  if (action.type === 'discard') {
    const i = p.hand.indexOf(action.tile);
    if (i < 0) return err('NOT_IN_HAND');
    if (isFlower(action.tile)) return err('CANNOT_DISCARD_FLOWER');
    p.hand.splice(i, 1);
    p.discards.push(action.tile);
    s.discardCount++;
    s.phase = {
      type: 'claim',
      from: seat,
      tile: action.tile,
      responses: s.players.map((_, j) => (j === seat ? { type: 'pass' as const } : null)),
      robKong: null,
    };
    const notation = `打 ${tileLabel(action.tile)}`;
    log(s, seat, notation);
    return ok(notation);
  }

  return err('WRONG_PHASE');
}

function validateClaim(s: MahjongState, seat: number, r: ClaimResponse): MahjongError | null {
  const opts = claimOptions(s, seat);
  const phase = s.phase as Extract<Phase, { type: 'claim' }>;
  switch (r.type) {
    case 'pass':
      return null;
    case 'win':
      if (opts.win) return null;
      return s.players[seat]!.furiten.includes(kindOf(phase.tile)) ? 'FURITEN' : 'CANNOT_WIN';
    case 'pung':
      return opts.pung ? null : 'CANNOT_PUNG';
    case 'kong':
      return opts.kong ? null : 'CANNOT_KONG';
    case 'chow': {
      const want = r.tiles
        .map(kindOf)
        .sort((a, b) => a - b)
        .join();
      const hand = s.players[seat]!.hand;
      if (r.tiles[0] === r.tiles[1] || !r.tiles.every((t) => hand.includes(t)))
        return 'NOT_IN_HAND';
      return opts.chow.some(
        (c) =>
          c
            .map(kindOf)
            .sort((a, b) => a - b)
            .join() === want,
      )
        ? null
        : 'CANNOT_CHOW';
    }
  }
}

/** 三家都回應後依「胡 > 碰槓 > 吃」處理；同時多家胡由放槍者下家起最近的一家胡（截胡） */
function resolveClaims(s: MahjongState): void {
  const phase = s.phase as Extract<Phase, { type: 'claim' }>;
  const { from, tile, responses, robKong } = phase;
  const order = [1, 2, 3].map((i) => (from + i) % s.seats);
  const lastTile = s.wall.length === DEAD_WALL;

  const winner = order.find((i) => responses[i]?.type === 'win');
  if (winner !== undefined) {
    const human = !s.claimed && from === s.dealer && s.discardCount === 1 && !robKong;
    if (!robKong) s.players[from]!.discards.pop();
    settleWin(s, winner, {
      from,
      winningTile: tile,
      robKong: robKong !== null,
      lastTile: lastTile && !robKong,
      firstTurn: human ? 'human' : null,
    });
    return;
  }

  if (robKong) {
    const meld = s.players[from]!.melds[robKong.meldIndex]!;
    meld.type = 'kong';
    meld.tiles.push(tile);
    s.claimed = true;
    drawFor(s, from, true);
    return;
  }

  const claimer =
    order.find((i) => responses[i]?.type === 'pung' || responses[i]?.type === 'kong') ??
    order.find((i) => responses[i]?.type === 'chow');
  if (claimer === undefined) {
    drawFor(s, (from + 1) % s.seats, false);
    return;
  }

  const r = responses[claimer]!;
  const p = s.players[claimer]!;
  const kind = kindOf(tile);
  s.players[from]!.discards.pop();
  s.claimed = true;
  if (r.type === 'chow') {
    for (const t of r.tiles) p.hand.splice(p.hand.indexOf(t), 1);
    const tiles = sortTiles([...r.tiles, tile]);
    p.melds.push({ type: 'chow', kind: kindOf(tiles[0]!), tiles, concealed: false, from });
    log(s, claimer, `吃 ${tiles.map(tileLabel).join('')}`);
  } else {
    const n = r.type === 'kong' ? 3 : 2;
    p.melds.push({
      type: r.type === 'kong' ? 'kong' : 'pung',
      kind,
      tiles: [...takeKind(p.hand, kind, n), tile],
      concealed: false,
      from,
    });
    log(s, claimer, `${r.type === 'kong' ? '槓' : '碰'} ${kindLabel(kind)}`);
  }
  if (r.type === 'kong') {
    drawFor(s, claimer, true);
  } else {
    s.phase = { type: 'discard', seat: claimer, drawn: null, canWin: false, afterKong: false };
  }
}

export function activeSeats(s: MahjongState): number[] {
  switch (s.phase.type) {
    case 'discard':
      return [s.phase.seat];
    case 'claim': {
      // 三家都要回應，不論能不能吃碰胡，避免從「誰在等」洩漏手牌
      const r = s.phase.responses;
      return r.flatMap((x, i) => (x === null ? [i] : []));
    }
    case 'hand-end':
      return s.phase.ready.flatMap((x, i) => (x ? [] : [i]));
    case 'over':
      return [];
  }
}

export function applyMahjongAction(
  state: MahjongState,
  seat: number,
  action: MahjongAction,
): Result<{ state: MahjongState; notation: string }, MahjongError> {
  if (state.phase.type === 'over') return err('GAME_OVER');
  if (!activeSeats(state).includes(seat)) return err('NOT_YOUR_TURN');
  const s = clone(state);

  switch (s.phase.type) {
    case 'discard': {
      const r = applyDiscardPhase(s, seat, action);
      return r.ok ? ok({ state: s, notation: r.value }) : r;
    }
    case 'claim': {
      if (action.type === 'next' || action.type === 'discard' || action.type === 'self-kong') {
        return err('WRONG_PHASE');
      }
      const e = validateClaim(s, seat, action);
      if (e) return err(e);
      const kind = kindOf(s.phase.tile);
      // 過水：能胡卻不胡，到自己下次摸牌前都不能胡這種牌
      if (action.type !== 'win' && canRon(s, seat, s.phase.tile)) {
        s.players[seat]!.furiten.push(kind);
      }
      s.phase.responses[seat] = action;
      if (s.phase.responses.every((x) => x !== null)) resolveClaims(s);
      const notation = action.type === 'pass' ? '過' : '宣告';
      return ok({ state: s, notation });
    }
    case 'hand-end': {
      if (action.type !== 'next') return err('WRONG_PHASE');
      s.phase.ready[seat] = true;
      if (s.phase.ready.every(Boolean)) {
        s.handNumber++;
        startHand(s);
      }
      return ok({ state: s, notation: '下一把' });
    }
  }
  return err('WRONG_PHASE');
}

/** 名次：點數高到低；同分時從第一把的莊家起依座位順序 */
export function placements(s: MahjongState): number[] {
  const order = Array.from({ length: s.seats }, (_, i) => (s.initialDealer + i) % s.seats);
  const ranked = order.slice().sort((a, b) => s.points[b]! - s.points[a]!);
  const out = Array.from({ length: s.seats }, () => 0);
  ranked.forEach((seat, i) => (out[seat] = i + 1));
  return out;
}

export const isOver = (s: MahjongState): boolean => s.phase.type === 'over';
