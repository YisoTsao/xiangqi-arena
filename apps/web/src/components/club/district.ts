/**
 * 樂町街區：俱樂部周邊的街廓（純資料，不碰 three.js，碰撞與尋路直接讀這裡）。
 *
 * 模型都是 CC0 的免費 GLB（來源與授權見 public/club/assets/CREDITS.md）：
 * - Kenney City Kit (Commercial) 的大樓、樹、車、圍籬（經 @netforge/asset-library-files 最佳化）
 * - Kenney Starter Kit City Builder 的小店屋、噴水池、樹叢
 *
 * 座標同 layout.ts：x 向右、z 向南（街上）為正，單位公尺。
 *
 * ```
 *  z=-44 ┌──────────┬────┬──────────────────────────────┬────┬──────────┐
 *        │ 西北街廓 │    │ 後街廓：店屋、擴建預定地 A   │    │ 東北街廓 │
 *  z=-19 │          │ 西 ├──────── 後巷 ────────────────┤ 東 │          │
 *  z=-13 │          │ 側 │ 鄰居店面 │ 俱樂部 │ 鄰居店面  │ 側 │          │
 *  z=0   │          │ 街 │══════════ 騎樓 ══════════════│ 街 │          │
 *        │          │    │══════════ 主街 ══════════════│    │          │
 *  z=13  │ 西南小公園│   │       樂町廣場（噴水池）     │    │ 擴建預定地 B │
 *  z=46  └──────────┴────┴──────────────────────────────┴────┴──────────┘
 *       x=-72     -39.5 -32.5                         32.5 39.5          72
 * ```
 *
 * 之後要蓋新館（例如 3F 網咖搬到對街、新的遊戲館），把建築放在 EXPANSION_LOTS 的範圍裡、
 * 從 DISTRICT 拿掉那塊地的圍籬，再加上互動點即可。
 */

export type DistrictModelId = keyof typeof DISTRICT_MODELS;

interface ModelSpec {
  url: string;
  /** 模型原始大小（scale = 1）的 xz 範圍與高度，正面朝 +z */
  min: readonly [number, number];
  max: readonly [number, number];
  h: number;
  /** 有沒有夜晚會亮的藍色窗戶（Kenney 商業大樓） */
  windows?: boolean;
}

const D = '/club/assets/models/district';
const K = '/club/assets/models/kenney-city';

/** 量測自 GLB 的包圍盒（scripts 不需要；換模型時重新量一次） */
export const DISTRICT_MODELS = {
  building_a: {
    url: `${D}/building_a.glb`,
    min: [-0.44, -0.47],
    max: [0.44, 0.47],
    h: 1.29,
    windows: true,
  },
  building_b: {
    url: `${D}/building_b.glb`,
    min: [-0.49, -0.47],
    max: [0.49, 0.47],
    h: 1.29,
    windows: true,
  },
  building_c: {
    url: `${D}/building_c.glb`,
    min: [-0.44, -0.55],
    max: [0.44, 0.55],
    h: 0.89,
    windows: true,
  },
  building_d: {
    url: `${D}/building_d.glb`,
    min: [-0.42, -0.45],
    max: [0.42, 0.45],
    h: 1.29,
    windows: true,
  },
  building_e: {
    url: `${D}/building_e.glb`,
    min: [-0.82, -0.5],
    max: [0.82, 0.5],
    h: 0.89,
    windows: true,
  },
  building_f: {
    url: `${D}/building_f.glb`,
    min: [-0.42, -0.51],
    max: [0.42, 0.51],
    h: 1.69,
    windows: true,
  },
  building_g: {
    url: `${D}/building_g.glb`,
    min: [-0.49, -0.46],
    max: [0.49, 0.46],
    h: 1.69,
    windows: true,
  },
  building_h: {
    url: `${D}/building_h.glb`,
    min: [-0.44, -0.5],
    max: [0.44, 0.5],
    h: 1.29,
    windows: true,
  },
  skyscraper_a: {
    url: `${D}/skyscraper_a.glb`,
    min: [-0.68, -0.68],
    max: [0.68, 0.68],
    h: 2.88,
    windows: true,
  },
  skyscraper_b: {
    url: `${D}/skyscraper_b.glb`,
    min: [-0.68, -0.68],
    max: [0.68, 0.68],
    h: 4.48,
    windows: true,
  },
  skyscraper_c: {
    url: `${D}/skyscraper_c.glb`,
    min: [-0.64, -0.69],
    max: [0.64, 0.69],
    h: 4.08,
    windows: true,
  },
  shop_a: { url: `${K}/building-small-a.glb`, min: [-0.5, -0.5], max: [0.5, 0.5], h: 0.95 },
  shop_b: { url: `${K}/building-small-b.glb`, min: [-0.5, -0.5], max: [0.5, 0.5], h: 1.63 },
  shop_c: { url: `${K}/building-small-c.glb`, min: [-0.5, -0.5], max: [0.5, 0.5], h: 1.75 },
  shop_d: { url: `${K}/building-small-d.glb`, min: [-0.5, -0.5], max: [0.5, 0.55], h: 1 },
  garage: { url: `${K}/building-garage.glb`, min: [-0.5, -0.5], max: [0.5, 0.5], h: 0.55 },
  fountain: { url: `${K}/pavement-fountain.glb`, min: [-0.5, -0.5], max: [0.5, 0.5], h: 0.54 },
  grove: { url: `${K}/grass-trees.glb`, min: [-0.5, -0.5], max: [0.5, 0.5], h: 0.64 },
  grove_tall: { url: `${K}/grass-trees-tall.glb`, min: [-0.5, -0.5], max: [0.57, 0.51], h: 0.76 },
  tree_oak: { url: `${D}/tree_oak.glb`, min: [-0.32, -0.37], max: [0.32, 0.37], h: 1.18 },
  tree_fat: { url: `${D}/tree_fat.glb`, min: [-0.38, -0.33], max: [0.38, 0.33], h: 1.1 },
  tree_pine: { url: `${D}/tree_pine.glb`, min: [-0.27, -0.27], max: [0.27, 0.27], h: 1.5 },
  bush: { url: `${D}/bush.glb`, min: [-0.2, -0.2], max: [0.2, 0.2], h: 0.19 },
  bush_large: { url: `${D}/bush_large.glb`, min: [-0.19, -0.17], max: [0.19, 0.17], h: 0.19 },
  flower: { url: `${D}/flower_red.glb`, min: [-0.1, -0.09], max: [0.05, 0.09], h: 0.24 },
  sedan: { url: `${D}/sedan.glb`, min: [-0.75, -1.3], max: [0.75, 1.25], h: 1.3 },
  taxi: { url: `${D}/taxi.glb`, min: [-0.75, -1.4], max: [0.75, 1.35], h: 1.5 },
  van: { url: `${D}/van.glb`, min: [-0.75, -1.4], max: [0.75, 1.35], h: 1.35 },
  suv: { url: `${D}/suv.glb`, min: [-0.75, -1.35], max: [0.75, 1.35], h: 1.3 },
  /** 一段 1 單位長的木圍籬，貼在模型 z = -0.465 那一邊；放置時已經位移到中心線 */
  fence: { url: `${D}/fence.glb`, min: [-0.5, -0.5], max: [0.5, -0.43], h: 0.3 },
} as const satisfies Record<string, ModelSpec>;

export interface Placement {
  model: DistrictModelId;
  x: number;
  z: number;
  /** 0、±π/2、π：模型正面（+z）轉向哪邊 */
  ry?: number;
  /** 等比縮放 */
  s: number;
  /** 乘在貼圖上的顏色（讓灰白大樓帶一點老街的暖色） */
  tint?: string;
  /** 不擋路（草叢、花） */
  walkThrough?: boolean;
}

/** 擴建預定地：目前圍起來、立牌標示，之後蓋新館用 */
export interface Lot {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 圍籬留的入口在哪一邊 */
  gate: 'n' | 's' | 'e' | 'w';
}

export const EXPANSION_LOTS: readonly Lot[] = [
  { id: 'lot-a', label: '擴建預定地 A', minX: -8, maxX: 8, minZ: -36, maxZ: -21, gate: 's' },
  { id: 'lot-b', label: '擴建預定地 B', minX: 44, maxX: 58, minZ: 17, maxZ: 33, gate: 'w' },
];

/** 東西兩條側街：路面中心 x = ±36、寬 7m，兩側各 2.5m 人行道 */
export const SIDE_STREET_X = 36;
export const SIDE_STREET_HALF = 3.5;
/** 後巷：z ∈ [-19, -13] */
export const ALLEY = { minZ: -19, maxZ: -13 } as const;
/** 樂町廣場 */
export const PLAZA = { minX: -30, maxX: 30, minZ: 13.3, maxZ: 34.5 } as const;
export const FOUNTAIN: readonly [number, number] = [0, 26.5];

const E = Math.PI / 2;
const WARM = ['#f4e2c8', '#ead2bb', '#e3d9c6', '#f1d9c4', '#dfe0cf', '#f0dccc'];
const warm = (i: number) => WARM[i % WARM.length]!;

const BUILDINGS: Placement[] = [
  // 後街廓：面向後巷（+z）
  { model: 'shop_b', x: -26, z: -24.5, s: 10 },
  { model: 'building_b', x: -15, z: -24.8, s: 11, tint: warm(0) },
  { model: 'shop_c', x: 15, z: -24.5, s: 10 },
  { model: 'building_g', x: 26, z: -24.8, s: 10.6, tint: warm(1) },
  { model: 'skyscraper_a', x: -20, z: -38, s: 9, tint: warm(2) },
  { model: 'skyscraper_c', x: 22, z: -38, s: 9, tint: warm(3) },
  // 東北街廓：面向東側街（-x）
  { model: 'building_d', x: 47.5, z: -6.5, ry: -E, s: 11, tint: warm(4) },
  { model: 'building_a', x: 47.5, z: -18.5, ry: -E, s: 11, tint: warm(5) },
  { model: 'shop_a', x: 47.5, z: -30.5, ry: -E, s: 10 },
  { model: 'skyscraper_a', x: 63, z: -10, s: 12, tint: warm(0) },
  { model: 'skyscraper_c', x: 63, z: -32, s: 12, tint: warm(1) },
  // 西北街廓：面向西側街（+x）
  { model: 'building_h', x: -47.5, z: -6.5, ry: E, s: 11, tint: warm(2) },
  { model: 'shop_d', x: -47.5, z: -18.5, ry: E, s: 10 },
  { model: 'building_f', x: -47.5, z: -31, ry: E, s: 11, tint: warm(3) },
  { model: 'skyscraper_b', x: -63, z: -12, s: 11, tint: warm(4) },
  { model: 'building_e', x: -63, z: -33, ry: E, s: 11, tint: warm(5) },
  // 廣場南側：面向廣場（-z）
  { model: 'shop_c', x: -24, z: 40, ry: Math.PI, s: 10 },
  { model: 'building_e', x: -8, z: 40, ry: Math.PI, s: 9.6, tint: warm(0) },
  { model: 'building_c', x: 8.5, z: 40, ry: Math.PI, s: 10, tint: warm(1) },
  { model: 'shop_b', x: 24, z: 40, ry: Math.PI, s: 10 },
  // 東南街廓（擴建預定地 B 的東邊與南邊）
  { model: 'building_a', x: 66, z: 20, ry: -E, s: 11, tint: warm(2) },
  { model: 'shop_a', x: 66, z: 36, ry: -E, s: 10 },
  { model: 'building_b', x: 50, z: 40, ry: Math.PI, s: 10, tint: warm(3) },
  // 西南街廓：小公園後面的店屋
  { model: 'building_g', x: -66, z: 20, ry: E, s: 10.6, tint: warm(4) },
  { model: 'shop_d', x: -66, z: 36, ry: E, s: 10 },
  { model: 'garage', x: -50, z: 40, ry: Math.PI, s: 10 },
  // 邊界外的遠景高樓（走不到，只擋天際線）
  { model: 'skyscraper_a', x: 86, z: 0, s: 13, tint: warm(2) },
  { model: 'skyscraper_c', x: -86, z: 6, s: 13, tint: warm(3) },
  { model: 'skyscraper_a', x: 0, z: 58, s: 13, tint: warm(4) },
];

const trees: Placement[] = [];
// 廣場：兩側成排的樹，中間留給開場鏡頭看向俱樂部的視線
for (const x of [-26, -20, 20, 26]) {
  for (const z of [17.5, 24, 30.5]) {
    trees.push({ model: (x + z) % 2 ? 'tree_oak' : 'tree_fat', x, z, s: 4.2 });
  }
}
for (const x of [-12, 12]) trees.push({ model: 'tree_oak', x, z: 32, s: 4 });
// 對面人行道的行道樹
for (const x of [-64, -54, -46, 46, 54, 64]) trees.push({ model: 'tree_pine', x, z: 12.2, s: 3.4 });
// 側街行道樹
for (const z of [-36, -26, 20, 30, 40]) {
  trees.push({ model: 'tree_oak', x: SIDE_STREET_X + 5, z, s: 3.6 });
  trees.push({ model: 'tree_oak', x: -SIDE_STREET_X - 5, z, s: 3.6 });
}
// 後巷兩頭
trees.push(
  { model: 'tree_fat', x: -30.5, z: -17, s: 3.4 },
  { model: 'tree_fat', x: 30.5, z: -17, s: 3.4 },
);

const shrubs: Placement[] = [];
// 噴水池周圍的花圃
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  shrubs.push({
    model: i % 2 ? 'bush_large' : 'flower',
    x: FOUNTAIN[0] + Math.cos(a) * 5.4,
    z: FOUNTAIN[1] + Math.sin(a) * 5.4,
    s: i % 2 ? 3 : 3.4,
    walkThrough: true,
  });
}
for (const x of [-23, -17, 17, 23]) {
  shrubs.push({ model: 'bush', x, z: 14.6, s: 3, walkThrough: true });
}

const parks: Placement[] = [
  // 西南小公園：樹叢地塊（樹的部分擋路）
  { model: 'grove_tall', x: -51, z: 21, s: 9 },
  { model: 'grove', x: -51, z: 31, s: 9 },
  { model: 'fountain', x: FOUNTAIN[0], z: FOUNTAIN[1], s: 7 },
];

const cars: Placement[] = [
  // 主街兩側路邊停車（車頭沿 x）
  { model: 'taxi', x: -46, z: 4.8, ry: E, s: 1.25 },
  { model: 'sedan', x: -56, z: 4.8, ry: E, s: 1.25 },
  { model: 'van', x: 48, z: 4.8, ry: E, s: 1.25 },
  { model: 'suv', x: 22, z: 9.5, ry: -E, s: 1.25 },
  { model: 'sedan', x: -24, z: 9.5, ry: -E, s: 1.25 },
  { model: 'taxi', x: 60, z: 9.5, ry: -E, s: 1.25 },
  // 側街
  { model: 'sedan', x: SIDE_STREET_X - 2.3, z: -24, s: 1.25 },
  { model: 'van', x: -SIDE_STREET_X + 2.3, z: 24, ry: Math.PI, s: 1.25 },
  { model: 'suv', x: SIDE_STREET_X + 2.3, z: 30, ry: Math.PI, s: 1.25 },
];

/** 擴建預定地的圍籬：每段 2m，入口那一邊中間留 8m（大門） */
function lotFences(lot: Lot): Placement[] {
  const out: Placement[] = [];
  const seg = 2;
  const edge = (side: Lot['gate'], x0: number, z0: number, x1: number, z1: number, ry: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / seg);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const mid = Math.abs(t - 0.5) * len;
      if (side === lot.gate && mid < 3.5) continue;
      out.push({ model: 'fence', x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, ry, s: seg });
    }
  };
  edge('n', lot.minX, lot.minZ, lot.maxX, lot.minZ, 0);
  edge('s', lot.minX, lot.maxZ, lot.maxX, lot.maxZ, 0);
  edge('w', lot.minX, lot.minZ, lot.minX, lot.maxZ, E);
  edge('e', lot.maxX, lot.minZ, lot.maxX, lot.maxZ, E);
  return out;
}

export const DISTRICT: readonly Placement[] = [
  ...BUILDINGS,
  ...trees,
  ...shrubs,
  ...parks,
  ...cars,
  ...EXPANSION_LOTS.flatMap(lotFences),
];

/** 街區的路燈（俱樂部門口那四盞在 layout.ts 的 STREET_LAMPS） */
export const DISTRICT_LAMPS: readonly (readonly [number, number])[] = [
  // 主街延伸段
  ...[-58, -46, -28, 28, 46, 58].map((x) => [x, 3.6] as const),
  ...[-58, -44, 44, 58].map((x) => [x, 11.4] as const),
  // 兩條側街（路面西側的人行道）
  ...[-38, -26, 22, 34, 44].flatMap((z) => [
    [SIDE_STREET_X - SIDE_STREET_HALF - 1, z] as const,
    [-SIDE_STREET_X + SIDE_STREET_HALF + 1, z] as const,
  ]),
  // 後巷
  [-20, -14.2],
  [0, -14.2],
  [20, -14.2],
  // 廣場四角
  [-15, 16.2],
  [15, 16.2],
  [-15, 33],
  [15, 33],
];

/** 擺放後在地面上的範圍（只處理 90° 的倍數） */
export function footprintOf(p: Placement): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const m: ModelSpec = DISTRICT_MODELS[p.model];
  // 圍籬的模型貼在格子邊上：放置時會位移到中心線，所以範圍以中心線為準
  const fence = p.model === 'fence';
  let [x0, z0] = m.min;
  let [x1, z1] = m.max;
  if (fence) {
    z0 = -0.04;
    z1 = 0.04;
  }
  const q = Math.round((((p.ry ?? 0) / E) % 4) + 4) % 4;
  // 旋轉 q × 90°：(x, z) → (x cos + z sin, -x sin + z cos)
  const corners: [number, number][] = [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ];
  const pts = corners.map(([x, z]): [number, number] => {
    const c = [1, 0, -1, 0][q]!;
    const s = [0, 1, 0, -1][q]!;
    return [x * c + z * s, -x * s + z * c];
  });
  const xs = pts.map((v) => v[0] * p.s);
  const zs = pts.map((v) => v[1] * p.s);
  return {
    minX: p.x + Math.min(...xs),
    maxX: p.x + Math.max(...xs),
    minZ: p.z + Math.min(...zs),
    maxZ: p.z + Math.max(...zs),
  };
}

/** 擋路的範圍：樹只擋樹幹、車擋車身、大樓擋整棟 */
export function colliderOf(
  p: Placement,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (p.walkThrough) return null;
  const f = footprintOf(p);
  const id = p.model;
  if (id.startsWith('tree_')) {
    const cx = p.x;
    const cz = p.z;
    return { minX: cx - 0.3, maxX: cx + 0.3, minZ: cz - 0.3, maxZ: cz + 0.3 };
  }
  if (id === 'fountain') {
    // 水池約佔地塊中央 60%
    const r = p.s * 0.3;
    return { minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r };
  }
  if (id === 'grove' || id === 'grove_tall') {
    const r = p.s * 0.38;
    return { minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r };
  }
  return f;
}

/** 鏡頭不能穿過的東西（大樓），top 是屋頂高度 */
export function occluderOf(
  p: Placement,
): { minX: number; maxX: number; minZ: number; maxZ: number; top: number } | null {
  const id = p.model;
  if (!(
    id.startsWith('building') ||
    id.startsWith('skyscraper') ||
    id.startsWith('shop') ||
    id === 'garage'
  )) {
    return null;
  }
  return { ...footprintOf(p), top: DISTRICT_MODELS[id].h * p.s };
}
