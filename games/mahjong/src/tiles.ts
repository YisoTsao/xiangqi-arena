/**
 * 牌的編碼。台灣 16 張用 144 張牌：
 *
 * - 牌種（kind）0–33：0–8 萬、9–17 筒、18–26 條、27–30 東南西北、31–33 中發白
 * - 花牌 kind 34–41：春夏秋冬（34–37）、梅蘭竹菊（38–41）
 *
 * 每一張實體牌（Tile）有唯一編號：一般牌 = kind × 4 + 第幾張（0–135），花牌 = 136–143。
 * 規則判斷幾乎都用 kind；Tile 編號只用來確認「這張牌在你手上」。
 */

export type Tile = number;
export type TileKind = number;

export const TILE_COUNT = 144;
export const KIND_COUNT = 34;
export const HAND_SIZE = 16;

export const WINDS = [27, 28, 29, 30] as const;
export const DRAGONS = [31, 32, 33] as const;

export const kindOf = (tile: Tile): TileKind => (tile < 136 ? tile >> 2 : 34 + (tile - 136));

export const isFlower = (tile: Tile): boolean => tile >= 136;
export const isHonor = (kind: TileKind): boolean => kind >= 27 && kind < KIND_COUNT;
export const isWind = (kind: TileKind): boolean => kind >= 27 && kind <= 30;
export const isDragon = (kind: TileKind): boolean => kind >= 31 && kind <= 33;
/** 0 萬、1 筒、2 條；字牌與花牌回傳 -1 */
export const suitOf = (kind: TileKind): number => (kind < 27 ? Math.floor(kind / 9) : -1);
/** 數字 1–9；字牌回傳 0 */
export const rankOf = (kind: TileKind): number => (kind < 27 ? (kind % 9) + 1 : 0);

/** 第一張（copy 0）實體牌，測試與電腦玩家方便用 */
export const tileOfKind = (kind: TileKind, copy = 0): Tile =>
  kind < KIND_COUNT ? kind * 4 + copy : 136 + (kind - 34);

export function fullWall(): Tile[] {
  return Array.from({ length: TILE_COUNT }, (_, i) => i);
}

/** 依牌種、再依編號排序 */
export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return tiles.slice().sort((a, b) => kindOf(a) - kindOf(b) || a - b);
}

/** 34 格的牌種張數表（忽略花牌） */
export function kindCounts(tiles: readonly Tile[]): number[] {
  const counts = Array.from({ length: KIND_COUNT }, () => 0);
  for (const t of tiles) {
    const k = kindOf(t);
    if (k < KIND_COUNT) counts[k]!++;
  }
  return counts;
}

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUITS = ['萬', '筒', '條'];
const HONORS = ['東', '南', '西', '北', '中', '發', '白'];
const FLOWERS = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];

export function kindLabel(kind: TileKind): string {
  if (kind < 27) return `${NUMERALS[kind % 9]}${SUITS[Math.floor(kind / 9)]}`;
  if (kind < KIND_COUNT) return HONORS[kind - 27]!;
  return FLOWERS[kind - 34]!;
}

export const tileLabel = (tile: Tile): string => kindLabel(kindOf(tile));

/**
 * 座位的花：門風東（莊家）= 春、梅；南 = 夏、蘭；西 = 秋、竹；北 = 冬、菊。
 * seatWind 0–3 = 東南西北。
 */
export const seatFlowerKinds = (seatWind: number): [TileKind, TileKind] => [
  34 + seatWind,
  38 + seatWind,
];
