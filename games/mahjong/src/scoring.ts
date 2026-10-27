import { decompositions, waitingKinds, type HandSet } from './hand';
import {
  isDragon,
  isHonor,
  isWind,
  kindCounts,
  kindOf,
  suitOf,
  type Tile,
  type TileKind,
} from './tiles';

/** 已亮出（或暗槓）的面子 */
export interface Meld {
  type: 'chow' | 'pung' | 'kong';
  /** 順子為最小那張的牌種 */
  kind: TileKind;
  tiles: Tile[];
  /** 暗槓 = true；吃、碰、明槓、加槓 = false */
  concealed: boolean;
  /** 吃碰槓來源座位；暗槓與加槓的補牌為 null */
  from: number | null;
}

export type FirstTurnWin = 'heaven' | 'earth' | 'human';

/** 計算台數需要的胡牌情境 */
export interface WinContext {
  /** 胡牌時的暗手，含胡的那張 */
  concealed: Tile[];
  melds: Meld[];
  flowers: Tile[];
  winningKind: TileKind;
  selfDrawn: boolean;
  /** 0–3 = 東南西北 */
  seatWind: number;
  roundWind: number;
  /** 牌牆最後一張（海底撈月、河底撈魚） */
  lastTile: boolean;
  /** 槓或補花後補進的牌自摸 */
  afterKong: boolean;
  robKong: boolean;
  firstTurn: FirstTurnWin | null;
  /** 八仙過海、七搶一：不看手牌 */
  flowerWin: 'eight-flowers' | 'seven-rob-one' | null;
}

export interface TaiItem {
  key: string;
  label: string;
  tai: number;
}

const LABELS: Record<string, string> = {
  heaven: '天胡',
  earth: '地胡',
  human: '人胡',
  'eight-flowers': '八仙過海',
  'seven-rob-one': '七搶一',
  'concealed-self-draw': '門清自摸',
  concealed: '門清',
  'self-draw': '自摸',
  'seat-wind': '門風',
  'round-wind': '圈風',
  dragon: '三元牌',
  'big-three-dragons': '大三元',
  'little-three-dragons': '小三元',
  'big-four-winds': '大四喜',
  'little-four-winds': '小四喜',
  flower: '花牌',
  'flower-set': '花槓',
  'last-tile-draw': '海底撈月',
  'last-tile-discard': '河底撈魚',
  'kong-draw': '槓上開花',
  'rob-kong': '搶槓',
  'all-melded': '全求人',
  'all-chows': '平胡',
  'single-wait': '獨聽',
  'three-concealed': '三暗刻',
  'four-concealed': '四暗刻',
  'five-concealed': '五暗刻',
  'all-pungs': '碰碰胡',
  'half-flush': '混一色',
  'full-flush': '清一色',
  'all-honors': '字一色',
  dealer: '莊家',
  streak: '連莊',
};

export const taiLabel = (key: string): string => LABELS[key] ?? key;

const item = (key: string, tai: number): TaiItem => ({ key, label: taiLabel(key), tai });

interface ScoredSet {
  type: 'chow' | 'pung';
  kind: TileKind;
  concealed: boolean;
}

/** 平胡要求的兩面聽：胡的那張在某個順子的頭或尾，且不是邊張 */
function twoSidedChow(sets: readonly HandSet[], win: TileKind): boolean {
  return sets.some(
    (s) =>
      s.type === 'chow' &&
      ((s.kind === win && s.kind % 9 <= 5) || (s.kind + 2 === win && s.kind % 9 >= 1)),
  );
}

function flowerItems(flowers: readonly Tile[], seatWind: number): TaiItem[] {
  const kinds = new Set(flowers.map(kindOf));
  const out: TaiItem[] = [];
  for (const base of [34, 38]) {
    const group = [0, 1, 2, 3].map((i) => base + i);
    if (group.every((k) => kinds.has(k))) out.push(item('flower-set', 2));
    else if (kinds.has(base + seatWind)) out.push(item('flower', 1));
  }
  return out;
}

const total = (items: readonly TaiItem[]): number => items.reduce((a, b) => a + b.tai, 0);

/**
 * 胡牌的台數（不含莊家、連莊，那兩項依付款的雙方而定，見 engine.ts）。
 * 同一手牌有多種拆法時取台數最高的拆法。回傳空陣列表示不能胡。
 */
export function scoreWin(ctx: WinContext): TaiItem[] {
  if (ctx.flowerWin) return [item(ctx.flowerWin, 8)];

  const setsNeeded = 5 - ctx.melds.length;
  const counts = kindCounts(ctx.concealed);
  const decomps = decompositions(counts, setsNeeded);
  if (decomps.length === 0) return [];

  const before = counts.slice();
  before[ctx.winningKind]!--;
  const waits = waitingKinds(before, setsNeeded);
  const doorClear = ctx.melds.every((m) => m.concealed);
  const hasFlowers = ctx.flowers.length > 0;

  let best: TaiItem[] = [];
  for (const d of decomps) {
    const sets: ScoredSet[] = [
      ...d.sets.map((s) => ({
        type: s.type,
        kind: s.kind,
        // 胡別人打出的牌湊成的刻子不算暗刻
        concealed: !(s.type === 'pung' && s.kind === ctx.winningKind && !ctx.selfDrawn),
      })),
      ...ctx.melds.map((m) => ({
        type: m.type === 'chow' ? ('chow' as const) : ('pung' as const),
        kind: m.kind,
        concealed: m.concealed,
      })),
    ];
    const pungs = sets.filter((s) => s.type === 'pung');
    const items: TaiItem[] = [];

    if (ctx.firstTurn) items.push(item(ctx.firstTurn, ctx.firstTurn === 'heaven' ? 24 : 16));
    else if (doorClear && ctx.selfDrawn) items.push(item('concealed-self-draw', 3));
    else if (doorClear) items.push(item('concealed', 1));
    else if (ctx.selfDrawn) items.push(item('self-draw', 1));

    const windPungs = pungs.filter((s) => isWind(s.kind)).length;
    const dragonPungs = pungs.filter((s) => isDragon(s.kind)).length;
    if (windPungs === 4) items.push(item('big-four-winds', 16));
    else if (windPungs === 3 && isWind(d.pair)) items.push(item('little-four-winds', 8));
    else {
      if (pungs.some((s) => s.kind === 27 + ctx.seatWind)) items.push(item('seat-wind', 1));
      if (pungs.some((s) => s.kind === 27 + ctx.roundWind)) items.push(item('round-wind', 1));
    }
    if (dragonPungs === 3) items.push(item('big-three-dragons', 8));
    else if (dragonPungs === 2 && isDragon(d.pair)) items.push(item('little-three-dragons', 4));
    else for (let i = 0; i < dragonPungs; i++) items.push(item('dragon', 1));

    items.push(...flowerItems(ctx.flowers, ctx.seatWind));

    if (ctx.lastTile) items.push(item(ctx.selfDrawn ? 'last-tile-draw' : 'last-tile-discard', 1));
    if (ctx.afterKong && ctx.selfDrawn) items.push(item('kong-draw', 1));
    if (ctx.robKong) items.push(item('rob-kong', 1));

    const allMelded =
      ctx.melds.length === 5 && ctx.melds.every((m) => !m.concealed) && !ctx.selfDrawn;
    const allChows =
      !ctx.selfDrawn &&
      !hasFlowers &&
      sets.every((s) => s.type === 'chow') &&
      !isHonor(d.pair) &&
      ctx.melds.every((m) => m.type === 'chow') &&
      waits.length >= 2 &&
      twoSidedChow(d.sets, ctx.winningKind);
    if (allMelded) items.push(item('all-melded', 2));
    if (allChows) items.push(item('all-chows', 2));
    if (!allMelded && !allChows && !ctx.firstTurn && waits.length === 1) {
      items.push(item('single-wait', 1));
    }

    const concealedPungs = pungs.filter((s) => s.concealed).length;
    if (concealedPungs === 5) items.push(item('five-concealed', 8));
    else if (concealedPungs === 4) items.push(item('four-concealed', 5));
    else if (concealedPungs === 3) items.push(item('three-concealed', 2));

    const kinds = [d.pair, ...sets.map((s) => s.kind)];
    const suits = new Set(kinds.filter((k) => !isHonor(k)).map(suitOf));
    const honors = kinds.some(isHonor);
    if (suits.size === 0) items.push(item('all-honors', 16));
    else {
      if (pungs.length === 5) items.push(item('all-pungs', 4));
      if (suits.size === 1) items.push(item(honors ? 'half-flush' : 'full-flush', honors ? 4 : 8));
    }

    if (best.length === 0 || total(items) > total(best)) best = items;
  }
  // 沒有任何台數也能胡（底分照算），用空的「胡」佔位以和「不能胡」區分
  return best.length > 0 ? best : [item('base', 0)];
}

export const totalTai = total;
