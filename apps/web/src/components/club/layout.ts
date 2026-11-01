/**
 * 暮光遊樂館：街口與 1F 麻將館的精確配置（單位：公尺，見 docs/CLUB_ART_BIBLE.md §3）。
 *
 * 座標：x 向右、z 向街上（南）為正、y 向上。建築 1F 室內是 x ∈ [-9, 9]、z ∈ [-12, 0]，
 * 正門在 z = 0 的中央。街口與室內是同一個場景，角色直接從門口走進去。
 *
 * 這個檔案只有資料與純函式（碰撞、尋路），不碰 three.js，方便測試。
 */

import { DISTRICT, DISTRICT_LAMPS, colliderOf, occluderOf } from './district';

export type Vec2 = readonly [x: number, z: number];

/** 樓層：1 = 街口與 1F 麻將館（同一個平面），2 = 2F 牌桌館 */
export type Floor = 1 | 2;
/** 每層樓高（地板到地板），2F 的地板在 y = FLOOR_HEIGHT */
export const FLOOR_HEIGHT = 3.6;
export const floorY = (floor: Floor): number => (floor - 1) * FLOOR_HEIGHT;

/** 地面上的軸對齊方塊碰撞體 */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const box = (minX: number, maxX: number, minZ: number, maxZ: number): Box => ({
  minX,
  maxX,
  minZ,
  maxZ,
});
const centered = (x: number, z: number, w: number, d: number): Box =>
  box(x - w / 2, x + w / 2, z - d / 2, z + d / 2);

/** 角色碰撞半徑 */
export const PLAYER_RADIUS = 0.3;
/** 走路速度（公尺／秒） */
export const WALK_SPEED = 3.6;
/** 按住 Shift 跑步的速度倍率 */
export const RUN_MULTIPLIER = 1.85;

export const HALL = { minX: -9, maxX: 9, minZ: -12, maxZ: 0, height: 3.6 } as const;
export const DOOR = { minX: -1, maxX: 1, height: 2.4 } as const;
export const WALL = 0.3;
/** 可走的範圍：整個樂町街區（主街、兩條側街、後巷、對面的廣場，見 district.ts） */
export const BOUNDS = box(-72, 72, -44, 46);

/** 開場時角色站的位置：正門前的騎樓 */
export const SPAWN: Vec2 = [0, 2.2];

// ── 1F 麻將館 ──────────────────────────────────────────

export const TABLE_SIZE = 1;
export const TABLE_HEIGHT = 0.75;
export const CHAIR_SIZE = 0.45;
export const CHAIR_OFFSET = 0.8;

/**
 * 六張麻將桌：前後錯開，不排成倉庫式的格子；中央 x = 0 仍留一條走道直通後面的樓梯與電梯。
 * 前排三張在玄關木隔間後面，後排三張靠窗。
 */
export const TABLES: readonly Vec2[] = [
  [-5.6, -4.6],
  [-2, -5.3],
  [1.9, -4.6],
  [-5, -8.9],
  [-1.4, -9.6],
  [2.4, -9],
];

/** 每張桌子的椅子：南（你坐的位置）、東、北、西 */
export function chairsOf([x, z]: Vec2): Vec2[] {
  return [
    [x, z + CHAIR_OFFSET],
    [x + CHAIR_OFFSET, z],
    [x, z - CHAIR_OFFSET],
    [x - CHAIR_OFFSET, z],
  ];
}

/** 離桌後站的地方：南邊椅子再往外一步 */
export function standPointOf([x, z]: Vec2): Vec2 {
  return [x, z + 1.55];
}

/** 茶櫃台（阿樂站在後面） */
export const COUNTER = box(6.3, 7.1, -6.6, -2.4);
export const TEA_CABINET = box(8.35, 9, -7, -2);
export const A_LE: Vec2 = [7.8, -4.5];
export const STAIRS = box(-8.85, -7.45, -11.85, -8.6);
export const ELEVATOR = box(6.2, 8.85, -11.85, -10.4);

/** 玄關：進門後先看到鞋櫃與展示櫃，木格隔間把玄關和牌桌區分開，中間留 4.8m 的開口 */
export const FOYER_DEPTH = 2.2;
export const PARTITIONS: readonly Box[] = [
  box(HALL.minX, -2.4, -FOYER_DEPTH - 0.15, -FOYER_DEPTH),
  box(2.4, 6, -FOYER_DEPTH - 0.15, -FOYER_DEPTH),
];
export const SHOE_CABINET = box(-4.2, -2.6, -0.7, -0.25);
export const DISPLAY_CASE = box(2.6, 4.6, -0.7, -0.25);
/** 室內大盆栽 */
export const INDOOR_PLANTS: readonly Vec2[] = [
  [-8.3, -0.8],
  [5.4, -0.8],
  [-8.3, -6.8],
  [5.6, -11.3],
];

// ── 街口 ───────────────────────────────────────────────

/** 門口兩側的花台與長椅 */
export const PLANTERS: readonly Box[] = [box(-5.2, -4, 0.2, 0.8), box(4, 5.2, 0.2, 0.8)];
export const BENCH = box(-7.6, -6.2, 0.35, 0.8);
export const STREET_LAMPS: readonly Vec2[] = [
  [-14, 3.6],
  [-5.5, 3.6],
  [5.5, 3.6],
  [14, 3.6],
];
export const VENDING = box(-3.4, -2.5, 0.2, 0.95);
/** 騎樓前停的機車（台灣街景的招牌元素） */
export const SCOOTERS: readonly Vec2[] = [
  [-7.2, 2.6],
  [6.6, 2.6],
  [7.6, 2.6],
];
/** 電線桿 */
export const POLES: readonly Vec2[] = [
  [-10.5, 3.6],
  [10.5, 3.6],
];
/** 紅綠兩個郵筒並排 */
export const MAILBOX: Vec2 = [3, 2.2];

/** 街口與 1F 所有擋路的方塊 */
export const COLLIDERS: readonly Box[] = [
  // 正面牆，中間留門
  box(HALL.minX - WALL, DOOR.minX, -WALL / 2, WALL / 2),
  box(DOOR.maxX, HALL.maxX + WALL, -WALL / 2, WALL / 2),
  // 兩側與後牆
  box(HALL.minX - WALL, HALL.minX, HALL.minZ - WALL, 0),
  box(HALL.maxX, HALL.maxX + WALL, HALL.minZ - WALL, 0),
  box(HALL.minX - WALL, HALL.maxX + WALL, HALL.minZ - WALL, HALL.minZ),
  // 左右鄰居的店面（進不去；Street.tsx 的店面 x ∈ ±[9.3, 26]、深 12m）
  box(-26, HALL.minX - WALL, -12.1, 0),
  box(HALL.maxX + WALL, 26, -12.1, 0),
  // 室內
  ...TABLES.flatMap((t) => [
    centered(t[0], t[1], TABLE_SIZE, TABLE_SIZE),
    ...chairsOf(t).map((c) => centered(c[0], c[1], CHAIR_SIZE, CHAIR_SIZE)),
  ]),
  COUNTER,
  TEA_CABINET,
  box(A_LE[0] - 0.3, A_LE[0] + 0.3, A_LE[1] - 0.3, A_LE[1] + 0.3),
  STAIRS,
  ELEVATOR,
  ...PARTITIONS,
  SHOE_CABINET,
  DISPLAY_CASE,
  ...INDOOR_PLANTS.map((p) => centered(p[0], p[1], 0.6, 0.6)),
  // 街上
  ...PLANTERS,
  BENCH,
  ...STREET_LAMPS.map((p) => centered(p[0], p[1], 0.3, 0.3)),
  VENDING,
  centered(MAILBOX[0], MAILBOX[1], 0.9, 0.45),
  ...SCOOTERS.map((p) => centered(p[0], p[1], 0.5, 1.6)),
  ...POLES.map((p) => centered(p[0], p[1], 0.35, 0.35)),
  // 樂町街區的大樓、樹、車、圍籬
  ...DISTRICT.flatMap((p) => colliderOf(p) ?? []),
  ...DISTRICT_LAMPS.map((p) => centered(p[0], p[1], 0.3, 0.3)),
];

/** 鏡頭不能穿過的方塊（top = 頂端高度，相對該樓層地板） */
export interface Occluder extends Box {
  top: number;
}

/** 在街上時：街區大樓、鄰居店面、俱樂部整棟 */
export const OCCLUDERS_OUTSIDE: readonly Occluder[] = [
  ...DISTRICT.flatMap((p) => occluderOf(p) ?? []),
  { ...box(-26, HALL.minX - WALL, -12.1, 0), top: 10.8 },
  { ...box(HALL.maxX + WALL, 26, -12.1, 0), top: 14.4 },
  { ...box(HALL.minX - WALL, HALL.maxX + WALL, HALL.minZ - WALL, 0.15), top: 14.4 },
];

/** 在室內時：只有四面牆（剖面娃娃屋沒有天花板，鏡頭高過牆就能往下看） */
export const OCCLUDERS_INSIDE: readonly Occluder[] = [
  { ...box(HALL.minX - WALL, HALL.maxX + WALL, -WALL / 2, WALL / 2), top: HALL.height },
  { ...box(HALL.minX - WALL, HALL.minX, HALL.minZ - WALL, 0), top: HALL.height },
  { ...box(HALL.maxX, HALL.maxX + WALL, HALL.minZ - WALL, 0), top: HALL.height },
  { ...box(HALL.minX - WALL, HALL.maxX + WALL, HALL.minZ - WALL, HALL.minZ), top: HALL.height },
];

// ── 2F 牌桌館 ──────────────────────────────────────────
//
// 和 1F 同一個樓板範圍（x ∈ [-9, 9]、z ∈ [-12, 0]），樓梯與電梯在同一個位置上下貫通。
// 左半邊是兩人對弈的木棋桌（象棋、暗棋），右半邊是四人撲克圓桌（大老二），
// 後牆中央是服務台，前牆一排窗看得到街上的霓虹。

/** 2F 的開場位置：樓梯口（上樓或出電梯後站的地方） */
export const STAIRS_LANDING_2F: Vec2 = [-8.15, -7.9];
export const ELEVATOR_LANDING: Vec2 = [7.5, -9.7];

/** 木棋桌：桌面 0.9m 見方，南北各一張椅子（你坐南邊） */
export const CHESS_TABLE_SIZE = 0.9;
export const CHESS_CHAIR_OFFSET = 0.72;
/** 棋桌：前排兩張大盤象棋、後排兩張暗棋 */
export const CHESS_TABLES: readonly { at: Vec2; mode: 'classic' | 'banqi' }[] = [
  { at: [-6, -3.3], mode: 'classic' },
  { at: [-2.9, -3.3], mode: 'classic' },
  { at: [-6, -6.9], mode: 'banqi' },
  { at: [-2.9, -6.9], mode: 'banqi' },
];
export function chessChairsOf([x, z]: Vec2): Vec2[] {
  return [
    [x, z + CHESS_CHAIR_OFFSET],
    [x, z - CHESS_CHAIR_OFFSET],
  ];
}

/** 撲克圓桌：直徑 1.4m（CLUB_ART_BIBLE §3.1），四張椅子 */
export const CARD_TABLE_RADIUS = 0.7;
export const CARD_CHAIR_OFFSET = 1.05;
export const CARD_TABLES: readonly Vec2[] = [
  [2.6, -3.5],
  [6, -3.5],
  [4.3, -7.3],
];
export function cardChairsOf([x, z]: Vec2): Vec2[] {
  return [
    [x, z + CARD_CHAIR_OFFSET],
    [x + CARD_CHAIR_OFFSET, z],
    [x, z - CARD_CHAIR_OFFSET],
    [x - CARD_CHAIR_OFFSET, z],
  ];
}

/** 服務台（小葵站在後面）、棋具櫃、窗邊沙發 */
export const HOST_DESK = box(-1.5, 1.5, -10.9, -10.3);
export const HOST: Vec2 = [0, -11.4];
export const GAME_SHELF = box(-6.4, -3.6, -11.95, -11.5);
export const SOFA_2F = box(-3, -0.6, -0.75, -0.25);
export const PLANTS_2F: readonly Vec2[] = [
  [-8.3, -0.8],
  [8.3, -0.8],
  [3, -11.3],
  [8.4, -6.6],
];

export const COLLIDERS_2F: readonly Box[] = [
  // 四面牆（2F 沒有門）
  box(HALL.minX - WALL, HALL.maxX + WALL, -WALL / 2, WALL / 2),
  box(HALL.minX - WALL, HALL.minX, HALL.minZ - WALL, 0),
  box(HALL.maxX, HALL.maxX + WALL, HALL.minZ - WALL, 0),
  box(HALL.minX - WALL, HALL.maxX + WALL, HALL.minZ - WALL, HALL.minZ),
  // 樓梯井與電梯
  STAIRS,
  ELEVATOR,
  ...CHESS_TABLES.flatMap(({ at }) => [
    centered(at[0], at[1], CHESS_TABLE_SIZE, CHESS_TABLE_SIZE),
    ...chessChairsOf(at).map((c) => centered(c[0], c[1], CHAIR_SIZE, CHAIR_SIZE)),
  ]),
  ...CARD_TABLES.flatMap((t) => [
    centered(t[0], t[1], CARD_TABLE_RADIUS * 2, CARD_TABLE_RADIUS * 2),
    ...cardChairsOf(t).map((c) => centered(c[0], c[1], CHAIR_SIZE, CHAIR_SIZE)),
  ]),
  HOST_DESK,
  box(HOST[0] - 0.3, HOST[0] + 0.3, HOST[1] - 0.3, HOST[1] + 0.3),
  GAME_SHELF,
  SOFA_2F,
  ...PLANTS_2F.map((p) => centered(p[0], p[1], 0.6, 0.6)),
];

export const collidersOf = (floor: Floor): readonly Box[] =>
  floor === 2 ? COLLIDERS_2F : COLLIDERS;

// ── 互動點 ─────────────────────────────────────────────

export type InteractableKind =
  'table' | 'chess' | 'cards' | 'npc' | 'host' | 'stairs' | 'stairsDown' | 'elevator';

export interface Interactable {
  id: string;
  kind: InteractableKind;
  /** 判定距離的中心 */
  at: Vec2;
  radius: number;
  /** 提示文字（「按 E」後面那段） */
  label: string;
  /** 走過去時要停的位置 */
  approach: Vec2;
  /** 棋桌的模式（大盤象棋／暗棋） */
  mode?: 'classic' | 'banqi';
}

export const INTERACTABLES: readonly Interactable[] = [
  ...TABLES.map((t, i): Interactable => ({
    id: `table-${i + 1}`,
    kind: 'table',
    at: t,
    radius: 1.9,
    label: `入座 ${i + 1} 號桌，四人打一將東風圈`,
    approach: standPointOf(t),
  })),
  {
    id: 'a-le',
    kind: 'npc',
    at: A_LE,
    radius: 2.2,
    label: '和阿樂聊天',
    approach: [5.7, -4.5],
  },
  {
    id: 'stairs',
    kind: 'stairs',
    at: [-8.15, -8.6],
    radius: 1.5,
    label: '上樓到 2F 牌桌館',
    approach: [-8.15, -7.9],
  },
  {
    id: 'elevator',
    kind: 'elevator',
    at: [7.5, -10.4],
    radius: 1.6,
    label: '搭電梯',
    approach: [7.5, -9.7],
  },
];

/** 2F 牌桌館的互動點；桌號接著 1F 往下編，id 不和 1F 重複 */
export const INTERACTABLES_2F: readonly Interactable[] = [
  ...CHESS_TABLES.map(({ at, mode }, i): Interactable => ({
    id: `chess-${i + 1}`,
    kind: 'chess',
    at,
    radius: 1.5,
    label: `入座 ${i + 1} 號棋桌，${mode === 'classic' ? '大盤象棋' : '暗棋'}雙人對弈`,
    approach: [at[0], at[1] + 1.35],
    mode,
  })),
  ...CARD_TABLES.map((t, i): Interactable => ({
    id: `cards-${i + 1}`,
    kind: 'cards',
    at: t,
    radius: 2,
    label: `入座 ${i + 1} 號牌桌，四人大老二`,
    approach: [t[0], t[1] + 1.75],
  })),
  {
    id: 'host',
    kind: 'host',
    at: HOST,
    radius: 2.2,
    label: '和小葵聊天',
    approach: [0, -9.6],
  },
  {
    id: 'stairs-down',
    kind: 'stairsDown',
    at: [-8.15, -8.6],
    radius: 1.5,
    label: '下樓到 1F 麻將館',
    approach: STAIRS_LANDING_2F,
  },
  {
    id: 'elevator-2f',
    kind: 'elevator',
    at: [7.5, -10.4],
    radius: 1.6,
    label: '搭電梯',
    approach: ELEVATOR_LANDING,
  },
];

export const interactablesOf = (floor: Floor): readonly Interactable[] =>
  floor === 2 ? INTERACTABLES_2F : INTERACTABLES;

/** 所有樓層的互動點（依 id 找桌子用） */
export const ALL_INTERACTABLES: readonly Interactable[] = [...INTERACTABLES, ...INTERACTABLES_2F];

/** 目前最近、在範圍內的互動點 */
export function nearestInteractable(p: Vec2, floor: Floor = 1): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of interactablesOf(floor)) {
    const d = Math.hypot(p[0] - it.at[0], p[1] - it.at[1]);
    if (d <= it.radius && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

// ── 碰撞 ───────────────────────────────────────────────

function circleHitsBox(x: number, z: number, r: number, b: Box): boolean {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function isFree(x: number, z: number, r = PLAYER_RADIUS, floor: Floor = 1): boolean {
  if (x - r < BOUNDS.minX || x + r > BOUNDS.maxX || z - r < BOUNDS.minZ || z + r > BOUNDS.maxZ) {
    return false;
  }
  for (const b of collidersOf(floor)) if (circleHitsBox(x, z, r, b)) return false;
  return true;
}

/** 往 (dx, dz) 移動；撞到就沿著牆滑（x、z 分開判定） */
export function slide(from: Vec2, dx: number, dz: number, floor: Floor = 1): Vec2 {
  let [x, z] = from;
  if (isFree(x + dx, z, PLAYER_RADIUS, floor)) x += dx;
  if (isFree(x, z + dz, PLAYER_RADIUS, floor)) z += dz;
  return [x, z];
}

/** 室內判定：1F 在館內（過了門口那條線）；2F 一律在室內 */
export const isInside = ([x, z]: Vec2, floor: Floor = 1): boolean =>
  floor === 2 || (z < 0.3 && z > HALL.minZ - WALL && x > HALL.minX - WALL && x < HALL.maxX + WALL);

// ── 點地面尋路（0.5m 格子上的 A*） ─────────────────────

const CELL = 0.5;
const COLS = Math.round((BOUNDS.maxX - BOUNDS.minX) / CELL);
const ROWS = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
const cellX = (c: number) => BOUNDS.minX + (c + 0.5) * CELL;
const cellZ = (r: number) => BOUNDS.minZ + (r + 0.5) * CELL;

const walkable = new Map<Floor, Uint8Array>();
function grid(floor: Floor): Uint8Array {
  const cached = walkable.get(floor);
  if (cached) return cached;
  const g = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      g[r * COLS + c] = isFree(cellX(c), cellZ(r), PLAYER_RADIUS, floor) ? 1 : 0;
    }
  }
  walkable.set(floor, g);
  return g;
}

function cellOf([x, z]: Vec2): number {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((x - BOUNDS.minX) / CELL)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((z - BOUNDS.minZ) / CELL)));
  return r * COLS + c;
}

/** 目標格走不到時，找最近的可走格 */
function nearestWalkable(target: number, floor: Floor): number {
  const g = grid(floor);
  if (g[target]) return target;
  const tc = target % COLS;
  const tr = Math.floor(target / COLS);
  for (let d = 1; d < Math.max(COLS, ROWS); d++) {
    let best = -1;
    let bestD = Infinity;
    for (let r = tr - d; r <= tr + d; r++) {
      for (let c = tc - d; c <= tc + d; c++) {
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        if (Math.max(Math.abs(r - tr), Math.abs(c - tc)) !== d) continue;
        const i = r * COLS + c;
        const dist = (r - tr) ** 2 + (c - tc) ** 2;
        if (g[i] && dist < bestD) {
          best = i;
          bestD = dist;
        }
      }
    }
    if (best >= 0) return best;
  }
  return target;
}

/** 兩點之間的直線是否整段可走（每 0.15m 取樣一次） */
export function clearLine(a: Vec2, b: Vec2, floor: Floor = 1): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / 0.15));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    if (!isFree(x, z, PLAYER_RADIUS, floor)) return false;
  }
  return true;
}

/** A* 用的最小堆積（值 = 格子編號、鍵 = f 分數） */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      ids[i] = ids[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const { ids, keys } = this;
    const top = ids[0]!;
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= lastKey) break;
        ids[i] = ids[c]!;
        keys[i] = keys[c]!;
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * 從 from 走到 to 的路徑（不含起點）。走不到目標時改走到最近的可走點；完全沒路回傳空陣列。
 */
export function findPath(from: Vec2, to: Vec2, floor: Floor = 1): Vec2[] {
  const g = grid(floor);
  const start = nearestWalkable(cellOf(from), floor);
  const goal = nearestWalkable(cellOf(to), floor);
  const goalPoint: Vec2 = isFree(to[0], to[1], PLAYER_RADIUS, floor)
    ? to
    : [cellX(goal % COLS), cellZ(Math.floor(goal / COLS))];
  if (clearLine(from, goalPoint, floor)) return [goalPoint];

  const size = COLS * ROWS;
  const gScore = new Float32Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const gc = goal % COLS;
  const gr = Math.floor(goal / COLS);
  const h = (i: number) => Math.hypot((i % COLS) - gc, Math.floor(i / COLS) - gr);
  // 街區變大後格子有五萬多格：open set 用二元堆積
  const open = new MinHeap();
  gScore[start] = 0;
  open.push(start, h(start));
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % COLS;
    const cr = Math.floor(cur / COLS);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const n = nr * COLS + nc;
        if (!g[n] || closed[n]) continue;
        // 斜走不能切牆角
        if (dr && dc && (!g[cr * COLS + nc] || !g[nr * COLS + cc])) continue;
        const cost = gScore[cur]! + (dr && dc ? Math.SQRT2 : 1);
        if (cost < gScore[n]!) {
          gScore[n] = cost;
          came[n] = cur;
          open.push(n, cost + h(n));
        }
      }
    }
  }
  if (goal !== start && came[goal] === -1) return [];

  const cells: Vec2[] = [];
  for (let i = goal; i !== start && i !== -1; i = came[i]!) {
    cells.push([cellX(i % COLS), cellZ(Math.floor(i / COLS))]);
  }
  cells.reverse();
  if (cells.length === 0) cells.push(goalPoint);
  else cells[cells.length - 1] = goalPoint;

  // 拉直：能直線到達的中間點都略過
  const out: Vec2[] = [];
  let anchor = from;
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearLine(anchor, cells[j]!, floor)) j--;
    out.push(cells[j]!);
    anchor = cells[j]!;
    i = j + 1;
  }
  return out;
}

// ── 鏡頭與方向鍵 ───────────────────────────────────────

/**
 * 3/4 斜俯視：鏡頭從右前方看過來。室外角度小一點，讓招牌正對畫面；進門後轉到斜角，
 * 看得到牌桌的兩個側面。
 */
export const CAMERA_YAW = { outside: 0.12, inside: 0.55 } as const;

/** 依鏡頭角度把方向鍵（右 mx、下 mz）轉成世界座標的單位向量；W 永遠是「畫面往上」 */
export function inputToWorld(mx: number, mz: number, yaw: number): Vec2 {
  const len = Math.hypot(mx, mz);
  if (len === 0) return [0, 0];
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const x = (mx * c + mz * s) / len;
  const z = (-mx * s + mz * c) / len;
  return [x, z];
}
