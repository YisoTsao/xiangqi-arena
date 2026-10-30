'use client';

import {
  CanvasTexture,
  DataTexture,
  LinearMipmapLinearFilter,
  NearestFilter,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * 手繪風的程式貼圖（CLUB_ART_BIBLE §4：低噪點、大色塊、只有木頭與磨石子帶一層低對比筆觸）。
 * 在 Blender 的 TEX_palette_atlas／decal 完成前先用這些，避免場景看起來像單色方塊。
 * 每種貼圖只畫一次並快取；同一張貼圖可以在多個材質共用。
 */

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

const cache = new Map<string, CanvasTexture>();

/** 固定種子的亂數，讓每次載入的貼圖一樣 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function paint(key: string, size: number, painter: Painter, seed = 7): CanvasTexture | null {
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  painter(ctx, size, size, seeded(seed));
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 1;
  cache.set(key, t);
  return t;
}

const tiledCache = new Map<string, Texture>();

/**
 * 同一張畫布、不同重複次數的貼圖。相同 (貼圖, 次數) 共用同一個物件，
 * 這樣材質才能被 Bake 合併（重複次數四捨五入到 0.25）。
 */
export function tiled(tex: Texture | null, rx: number, ry: number): Texture | null {
  if (!tex) return null;
  const qx = Math.max(0.25, Math.round(rx * 4) / 4);
  const qy = Math.max(0.25, Math.round(ry * 4) / 4);
  const key = `${tex.uuid}:${qx}:${qy}`;
  const hit = tiledCache.get(key);
  if (hit) return hit;
  const t = tex.clone();
  t.repeat.set(qx, qy);
  t.needsUpdate = true;
  tiledCache.set(key, t);
  return t;
}

/** 木地板／木板：長條木板 + 低對比木紋 */
export const woodPlanks = () =>
  paint('wood-planks', 512, (ctx, w, h, rnd) => {
    const rows = 6;
    const rh = h / rows;
    const tones = ['#8a5c3f', '#80553a', '#936444', '#7a5036', '#8d6142'];
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * w * 0.5;
      while (x < w) {
        const len = w * (0.45 + rnd() * 0.5);
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)]!;
        ctx.fillRect(x, r * rh, len, rh);
        // 木紋：幾條淡淡的波浪線
        ctx.strokeStyle = 'rgba(60,35,20,0.18)';
        ctx.lineWidth = 1.5;
        for (let g = 0; g < 4; g++) {
          const y0 = r * rh + rh * (0.2 + g * 0.2 + rnd() * 0.05);
          ctx.beginPath();
          ctx.moveTo(x, y0);
          for (let sx = 0; sx <= len; sx += 16) {
            ctx.lineTo(x + sx, y0 + Math.sin((sx + g * 40) / 38) * 2.2);
          }
          ctx.stroke();
        }
        // 板與板之間的縫
        ctx.fillStyle = 'rgba(40,22,12,0.55)';
        ctx.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      ctx.fillStyle = 'rgba(40,22,12,0.5)';
      ctx.fillRect(0, r * rh, w, 2);
    }
  });

/** 家具用的木頭：直紋、顏色較深 */
export const woodGrain = () =>
  paint('wood-grain', 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#7a4e33';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '50,28,16' : '150,100,66'},${0.12 + rnd() * 0.12})`;
      ctx.lineWidth = 1 + rnd() * 2.5;
      const x0 = rnd() * w;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      for (let y = 0; y <= h; y += 12) ctx.lineTo(x0 + Math.sin(y / 30 + i) * 4, y);
      ctx.stroke();
    }
  });

/** 磨石子：米白底 + 細碎色點 */
export const terrazzo = () =>
  paint('terrazzo', 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#e4d2b2';
    ctx.fillRect(0, 0, w, h);
    const chips = ['#c9b08a', '#a98f6c', '#f4e8d2', '#8f9a86', '#c98a6e', '#6f7f7a'];
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = chips[Math.floor(rnd() * chips.length)]!;
      const r = 1 + rnd() * 4;
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 分割銅條
    ctx.fillStyle = 'rgba(160,110,60,0.55)';
    ctx.fillRect(0, 0, w, 3);
    ctx.fillRect(0, 0, 3, h);
  });

/** 復古小磁磚（牆裙）：淡綠方磚 + 白縫 */
export const retroTile = () =>
  paint('retro-tile', 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#e8e0cc';
    ctx.fillRect(0, 0, w, h);
    const n = 8;
    const s = w / n;
    const greens = ['#6f9a88', '#76a28f', '#6a9482', '#7aa592'];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = greens[Math.floor(rnd() * greens.length)]!;
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x * s + 3, y * s + 3, s - 6, 4);
      }
    }
  });

/** 牆紙：米白底 + 淡淡的直條與小花 */
export const wallpaper = () =>
  paint('wallpaper', 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#efd9b6';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(180,120,80,0.10)';
      ctx.fillRect(x, 0, 10, h);
    }
    ctx.fillStyle = 'rgba(190,90,70,0.22)';
    for (let i = 0; i < 18; i++) {
      const cx = (i % 4) * 64 + 26 + (Math.floor(i / 4) % 2) * 32;
      const cy = Math.floor(i / 4) * 64 + 30 + rnd() * 2;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

/** 麻將桌絨布：深綠 + 細微絨毛 */
export const felt = () =>
  paint('felt', 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#2f6b55';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(20,60,45,0.25)' : 'rgba(90,150,120,0.18)';
      ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    }
  });

/** 和紙格窗：米白紙 + 木格；透光用 emissive */
export const shoji = () =>
  paint('shoji', 256, (ctx, w, h) => {
    ctx.fillStyle = '#fbeed2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#6a4630';
    const n = 4;
    for (let i = 0; i <= n; i++) {
      ctx.fillRect((i * w) / n - 4, 0, 8, h);
      ctx.fillRect(0, (i * h) / n - 4, w, 8);
    }
  });

/** 磁磚外牆（建築正面）：小口磚 */
export const facadeTile = (base = '#e9cfa8', seed = 3) =>
  paint(
    `facade-${base}-${seed}`,
    256,
    (ctx, w, h, rnd) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const bw = 32;
      const bh = 12;
      for (let y = 0; y < h; y += bh) {
        const off = (y / bh) % 2 ? bw / 2 : 0;
        for (let x = -bw; x < w; x += bw) {
          ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,60,40'},${0.04 + rnd() * 0.07})`;
          ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
        }
        ctx.fillStyle = 'rgba(80,55,40,0.18)';
        ctx.fillRect(0, y, w, 1);
      }
    },
    seed,
  );

/** 柏油路：深灰 + 細點 */
export const asphalt = () =>
  paint('asphalt', 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#4b4752';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(30,28,36,0.35)' : 'rgba(120,115,128,0.25)';
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  });

/** 人行道地磚：紅磚與米色磚交錯 */
export const pavers = () =>
  paint('pavers', 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#8a6a58';
    ctx.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const warm = ((x + y) / s) % 2 === 0;
        ctx.fillStyle = warm ? '#b9826a' : '#cdb293';
        ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
        ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
        ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
      }
    }
  });

/** 鐵捲門：橫條金屬 */
export const shutter = () =>
  paint('shutter', 128, (ctx, w, h) => {
    ctx.fillStyle = '#a3a8b0';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = '#7d828b';
      ctx.fillRect(0, y, w, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, y + 3, w, 1);
    }
  });

/** 遠景樓房的窗格：白天暗、夜晚由 emissive 點亮 */
export const cityWindows = () =>
  paint('city-windows', 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 24) {
      for (let x = 6; x < w; x += 20) {
        if (rnd() < 0.45) continue;
        ctx.fillStyle = rnd() < 0.7 ? '#ffd890' : '#bfe8ff';
        ctx.fillRect(x, y, 10, 13);
      }
    }
  });

/** 柔和光圈（吊燈投在桌面與地板上的光），白色中心往外透明 */
export const lightPool = () =>
  paint('light-pool', 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

/** 角色用的三階卡通明暗（toon gradient map） */
let toonRamp: DataTexture | null = null;
export function toonGradient(): DataTexture {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 170, 255]);
  toonRamp = new DataTexture(data, data.length, 1, RedFormat);
  toonRamp.minFilter = NearestFilter;
  toonRamp.magFilter = NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

// ── 雨天街面 ───────────────────────────────────────────

/**
 * 街面一條帶狀貼圖：u 沿著街（每 STREET_U 公尺重複一次），v 從騎樓牆腳（z=0）
 * 到對街人行道（z=STREET_V）。人行道磚、路面、標線、排水溝都畫在同一張，
 * 這樣整條街只要一個平面、一次平面反射。
 */
export const STREET_U = 8;
export const STREET_V = 16;
/** 街面上各區的 z 範圍（公尺） */
export const STREET_ZONES = {
  walk: [0, 3.38],
  road: [3.62, 10.68],
  farWalk: [10.92, STREET_V],
  lane: 7.1,
} as const;

/** 沿 x 週期為 period 的值雜訊（格點雜訊 + 平滑內插），讓貼圖左右接得起來 */
function periodicNoise(seed: number, period: number) {
  const rnd = seeded(seed);
  const rows = 256;
  const grid = new Float32Array(period * rows).map(() => rnd());
  const at = (i: number, j: number) =>
    grid[(((i % period) + period) % period) + (((j % rows) + rows) % rows) * period]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = fade(x - i);
    const fy = fade(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

export interface StreetSurface {
  /** 顏色（sRGB） */
  map: Texture;
  /** R：積水程度、G：乾燥時的粗糙度（線性） */
  wet: Texture;
  /** 切線空間法線（磚縫、柏油顆粒） */
  normal: Texture;
}

let streetCache: StreetSurface | null = null;

export function streetSurface(): StreetSurface | null {
  if (streetCache) return streetCache;
  if (typeof document === 'undefined') return null;
  const W = 1024;
  const H = 2048;
  const pxU = W / STREET_U;
  const pxV = H / STREET_V;
  const rnd = seeded(41);

  // 1) 顏色：先用 canvas 畫
  const color = document.createElement('canvas');
  color.width = W;
  color.height = H;
  const ctx = color.getContext('2d');
  if (!ctx) return null;
  const zy = (z: number) => z * pxV;
  const { walk, road, farWalk, lane } = STREET_ZONES;

  // 人行道：台灣常見的紅磚 + 米色磚，0.4 公尺見方，偶爾一塊顏色深淺不同
  const paveRows = (z0: number, z1: number) => {
    const s = 0.4;
    for (let z = z0; z < z1; z += s) {
      for (let x = 0; x < STREET_U; x += s) {
        const warm = (Math.round(x / s) + Math.round(z / s)) % 2 === 0;
        const base = warm ? [176, 112, 88] : [196, 172, 144];
        const k = 0.86 + rnd() * 0.2;
        ctx.fillStyle = `rgb(${base.map((c) => Math.round(c * k)).join(',')})`;
        ctx.fillRect(x * pxU + 2, zy(z) + 2, s * pxU - 4, s * pxV - 4);
      }
    }
  };
  ctx.fillStyle = '#5c4a40';
  ctx.fillRect(0, zy(walk[0]), W, zy(walk[1]) - zy(walk[0]));
  ctx.fillRect(0, zy(farWalk[0]), W, zy(farWalk[1]) - zy(farWalk[0]));
  paveRows(walk[0], walk[1]);
  paveRows(farWalk[0], farWalk[1]);

  // 柏油：深灰底 + 粗細兩層顆粒 + 補丁
  ctx.fillStyle = '#3d3a40';
  ctx.fillRect(0, zy(road[0]) - 4, W, zy(road[1]) - zy(road[0]) + 8);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '20,20,24' : '90,86,92'},0.18)`;
    const pw = (0.8 + rnd() * 2) * pxU;
    const ph = (0.6 + rnd() * 1.4) * pxV;
    ctx.fillRect(
      rnd() * (W - pw),
      zy(road[0] + 0.6) + rnd() * (zy(road[1]) - zy(road[0] + 1.2) - ph),
      pw,
      ph,
    );
  }
  for (let i = 0; i < 60000; i++) {
    const g = rnd();
    ctx.fillStyle = g < 0.5 ? 'rgba(18,17,22,0.45)' : 'rgba(130,125,132,0.32)';
    ctx.fillRect(
      rnd() * W,
      zy(road[0]) + rnd() * (zy(road[1]) - zy(road[0])),
      1 + rnd() * 2,
      1 + rnd() * 2,
    );
  }
  // 標線：中央分隔虛線（2 公尺畫、2 公尺空）+ 兩側白色邊線 + 騎樓前紅線（禁停）
  ctx.fillStyle = '#e6dcb8';
  for (let x = 0; x < STREET_U; x += 4) ctx.fillRect(x * pxU, zy(lane - 0.07), 2 * pxU, 0.14 * pxV);
  ctx.fillStyle = '#d8d2c4';
  ctx.fillRect(0, zy(road[0] + 0.35), W, 0.1 * pxV);
  ctx.fillRect(0, zy(road[1] - 0.45), W, 0.1 * pxV);
  ctx.fillStyle = '#b8483e';
  ctx.fillRect(0, zy(road[0] + 0.05), W, 0.08 * pxV);
  // 排水溝蓋（每 8 公尺一個，在邊溝）
  for (const z of [road[0] + 0.12, road[1] - 0.42]) {
    ctx.fillStyle = '#26242a';
    ctx.fillRect(3 * pxU, zy(z), 0.9 * pxU, 0.3 * pxV);
    ctx.fillStyle = '#4a464e';
    for (let k = 0; k < 9; k++)
      ctx.fillRect(3 * pxU + (k * 0.1 + 0.02) * pxU, zy(z + 0.03), 0.05 * pxU, 0.24 * pxV);
  }
  // 標線、磚面一起再壓一層髒污
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(30,24,22,${rnd() * 0.08})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 2 + rnd() * 6);
  }

  // 2) 積水 / 粗糙度 / 高度：逐像素算
  const n1 = periodicNoise(5, 12);
  const n2 = periodicNoise(9, 28);
  const height = new Float32Array(W * H);
  const wetData = new Uint8Array(W * H * 4);
  const inRange = (z: number, [a, b]: readonly [number, number]) => z >= a && z <= b;
  for (let y = 0; y < H; y++) {
    const z = (y + 0.5) / pxV;
    const onRoad = inRange(z, road);
    // 邊溝最低、積水最多；路拱讓中央較乾
    const gutter = onRoad
      ? Math.max(Math.exp(-(((z - road[0]) / 0.45) ** 2)), Math.exp(-(((road[1] - z) / 0.45) ** 2)))
      : 0;
    const crown = onRoad ? Math.exp(-(((z - lane) / 2.2) ** 2)) : 0;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const i = y * W + x;
      // 大片窪地 + 小碎水窪
      const big = n1(u * 12, z * 1.4);
      const small = n2(u * 28, z * 3.5);
      let pool = big * 0.65 + small * 0.35 + gutter * 0.55 - crown * 0.25;
      let h: number;
      let rough: number;
      if (onRoad) {
        h = 0.5 - pool * 0.3 + (rnd() - 0.5) * 0.12;
        rough = 0.62 + rnd() * 0.2;
        pool = smooth(0.62, 0.72, pool);
      } else {
        // 磚縫：凹下去、會積水
        const s = 0.4;
        const fx = (((x / pxU) % s) + s) % s;
        const fz = ((z % s) + s) % s;
        const edge = Math.min(fx, s - fx, fz, s - fz);
        const joint = 1 - smooth(0.005, 0.03, edge);
        h = 0.6 - joint * 0.5 + (rnd() - 0.5) * 0.05;
        rough = 0.55 + joint * 0.3 + rnd() * 0.1;
        pool = Math.max(smooth(0.68, 0.78, pool), joint * 0.55);
      }
      height[i] = h;
      wetData[i * 4] = Math.round(pool * 255);
      wetData[i * 4 + 1] = Math.round(Math.min(1, rough) * 255);
      wetData[i * 4 + 2] = 0;
      wetData[i * 4 + 3] = 255;
    }
  }

  // 3) 高度 → 法線（Sobel，左右週期銜接）
  const nData = new Uint8Array(W * H * 4);
  const strength = 2.2;
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(H - 1, y + 1);
    for (let x = 0; x < W; x++) {
      const x0 = (x - 1 + W) % W;
      const x1 = (x + 1) % W;
      const dx = (height[y * W + x1]! - height[y * W + x0]!) * strength;
      const dy = (height[y1 * W + x]! - height[y0 * W + x]!) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      nData[i] = Math.round((-dx / len) * 127.5 + 127.5);
      nData[i + 1] = Math.round((-dy / len) * 127.5 + 127.5);
      nData[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      nData[i + 3] = 255;
    }
  }

  const map = new CanvasTexture(color);
  map.colorSpace = SRGBColorSpace;
  // DataTexture 的第 0 列在下方，canvas 的第 0 列在上方：顏色貼圖翻過來對齊
  map.flipY = false;
  const wet = new DataTexture(wetData, W, H);
  const normal = new DataTexture(nData, W, H);
  for (const t of [map, wet, normal]) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.needsUpdate = true;
  }
  streetCache = { map, wet, normal };
  return streetCache;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
