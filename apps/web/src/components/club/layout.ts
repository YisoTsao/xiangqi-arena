/**
 * 暮光遊樂館：街口與 1F 麻將館的精確配置（單位：公尺，見 docs/CLUB_ART_BIBLE.md §3）。
 *
 * 座標：x 向右、z 向街上（南）為正、y 向上。建築 1F 室內是 x ∈ [-9, 9]、z ∈ [-12, 0]，
 * 正門在 z = 0 的中央。街口與室內是同一個場景，角色直接從門口走進去。
 *
 * 這個檔案只有資料與純函式（碰撞、尋路），不碰 three.js，方便測試。
 */

export type Vec2 = readonly [x: number, z: number];

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

export const HALL = { minX: -9, maxX: 9, minZ: -12, maxZ: 0, height: 3.6 } as const;
export const DOOR = { minX: -1, maxX: 1, height: 2.4 } as const;
export const WALL = 0.3;
/** 可走的範圍（街道兩端與馬路對面） */
export const BOUNDS = box(-22, 22, -12, 9.5);

/** 開場時角色站的位置：正門前的騎樓 */
export const SPAWN: Vec2 = [0, 2.2];

// ── 1F 麻將館 ──────────────────────────────────────────

export const TABLE_SIZE = 1;
export const TABLE_HEIGHT = 0.75;
export const CHAIR_SIZE = 0.45;
export const CHAIR_OFFSET = 0.8;

/** 六張麻將桌：三欄兩排，中央 x = 0 留走道直通後面的樓梯與電梯 */
export const TABLES: readonly Vec2[] = [
  [-5.5, -4],
  [-2, -4],
  [1.5, -4],
  [-5.5, -8],
  [-2, -8],
  [1.5, -8],
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
/** 紅綠兩個郵筒並排 */
export const MAILBOX: Vec2 = [3, 2.2];

/** 所有擋路的方塊 */
export const COLLIDERS: readonly Box[] = [
  // 正面牆，中間留門
  box(HALL.minX - WALL, DOOR.minX, -WALL / 2, WALL / 2),
  box(DOOR.maxX, HALL.maxX + WALL, -WALL / 2, WALL / 2),
  // 兩側與後牆
  box(HALL.minX - WALL, HALL.minX, HALL.minZ - WALL, 0),
  box(HALL.maxX, HALL.maxX + WALL, HALL.minZ - WALL, 0),
  box(HALL.minX - WALL, HALL.maxX + WALL, HALL.minZ - WALL, HALL.minZ),
  // 左右鄰居的店面（進不去）
  box(-30, HALL.minX - WALL, -13, 0),
  box(HALL.maxX + WALL, 30, -13, 0),
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
  // 街上
  ...PLANTERS,
  BENCH,
  ...STREET_LAMPS.map((p) => centered(p[0], p[1], 0.3, 0.3)),
  VENDING,
  centered(MAILBOX[0], MAILBOX[1], 0.9, 0.45),
];

// ── 互動點 ─────────────────────────────────────────────

export type InteractableKind = 'table' | 'npc' | 'stairs' | 'elevator';

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
}

export const INTERACTABLES: readonly Interactable[] = [
  ...TABLES.map((t, i): Interactable => ({
    id: `table-${i + 1}`,
    kind: 'table',
    at: t,
    radius: 1.9,
    label: `入座 ${i + 1} 號桌，打一將東風圈`,
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
    label: '上樓',
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

/** 目前最近、在範圍內的互動點 */
export function nearestInteractable(p: Vec2): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of INTERACTABLES) {
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

export function isFree(x: number, z: number, r = PLAYER_RADIUS): boolean {
  if (x - r < BOUNDS.minX || x + r > BOUNDS.maxX || z - r < BOUNDS.minZ || z + r > BOUNDS.maxZ) {
    return false;
  }
  for (const b of COLLIDERS) if (circleHitsBox(x, z, r, b)) return false;
  return true;
}

/** 往 (dx, dz) 移動；撞到就沿著牆滑（x、z 分開判定） */
export function slide(from: Vec2, dx: number, dz: number): Vec2 {
  let [x, z] = from;
  if (isFree(x + dx, z)) x += dx;
  if (isFree(x, z + dz)) z += dz;
  return [x, z];
}

/** 室內判定：過了門口那條線 */
export const isInside = ([, z]: Vec2): boolean => z < 0.3;

// ── 點地面尋路（0.5m 格子上的 A*） ─────────────────────

const CELL = 0.5;
const COLS = Math.round((BOUNDS.maxX - BOUNDS.minX) / CELL);
const ROWS = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
const cellX = (c: number) => BOUNDS.minX + (c + 0.5) * CELL;
const cellZ = (r: number) => BOUNDS.minZ + (r + 0.5) * CELL;

let walkable: Uint8Array | null = null;
function grid(): Uint8Array {
  if (walkable) return walkable;
  walkable = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) walkable[r * COLS + c] = isFree(cellX(c), cellZ(r)) ? 1 : 0;
  }
  return walkable;
}

function cellOf([x, z]: Vec2): number {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((x - BOUNDS.minX) / CELL)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((z - BOUNDS.minZ) / CELL)));
  return r * COLS + c;
}

/** 目標格走不到時，找最近的可走格 */
function nearestWalkable(target: number): number {
  const g = grid();
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
export function clearLine(a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / 0.15));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!isFree(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

/**
 * 從 from 走到 to 的路徑（不含起點）。走不到目標時改走到最近的可走點；完全沒路回傳空陣列。
 */
export function findPath(from: Vec2, to: Vec2): Vec2[] {
  const g = grid();
  const start = nearestWalkable(cellOf(from));
  const goal = nearestWalkable(cellOf(to));
  const goalPoint: Vec2 = isFree(to[0], to[1])
    ? to
    : [cellX(goal % COLS), cellZ(Math.floor(goal / COLS))];
  if (clearLine(from, goalPoint)) return [goalPoint];

  const size = COLS * ROWS;
  const gScore = new Float32Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const gc = goal % COLS;
  const gr = Math.floor(goal / COLS);
  const h = (i: number) => Math.hypot((i % COLS) - gc, Math.floor(i / COLS) - gr);
  // 格子不多（約 4000 格），用簡單的陣列當 open set 就夠快
  const open: number[] = [start];
  gScore[start] = 0;
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (gScore[open[i]!]! + h(open[i]!) < gScore[open[bi]!]! + h(open[bi]!)) bi = i;
    }
    const cur = open.splice(bi, 1)[0]!;
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
          open.push(n);
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
    while (j > i && !clearLine(anchor, cells[j]!)) j--;
    out.push(cells[j]!);
    anchor = cells[j]!;
    i = j + 1;
  }
  return out;
}
