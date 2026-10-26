import * as THREE from 'three';
import { pieceLabel, type PieceKind, type Side } from '@xiangqi-arena/game-core';
import { LAYOUTS } from '../layout';
import type { BoardLayout } from '../model';
import { PALETTE, PIECE_FONT } from '../theme';

const cache = new Map<string, THREE.Texture>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** 以確定性亂數產生木紋，避免下載貼圖 */
function paintWood(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: string,
  dark: string,
  seed: number,
): void {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(255,240,210,0.10)');
  grad.addColorStop(1, 'rgba(60,30,10,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = dark;
  for (let i = 0; i < 140; i++) {
    const y0 = rnd() * h;
    const amp = 4 + rnd() * 18;
    const freq = 0.002 + rnd() * 0.006;
    const phase = rnd() * Math.PI * 2;
    ctx.globalAlpha = 0.04 + rnd() * 0.1;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 木節
  for (let i = 0; i < 3; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    for (let r = 4; r < 30; r += 4) {
      ctx.globalAlpha = 0.05;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 2.2, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** 棋盤面：木紋 + 線條 + 楚河漢界 + 九宮 */
export function boardTexture(layout: BoardLayout, resolution: number): THREE.Texture {
  const key = `board:${layout}:${resolution}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = LAYOUTS[layout];
  const pxPerUnit = resolution / spec.boardWidth;
  const w = resolution;
  const h = Math.round(spec.boardDepth * pxPerUnit);
  const [canvas, ctx] = makeCanvas(w, h);
  paintWood(ctx, w, h, PALETTE.woodLight, PALETTE.woodDark, layout === 'xiangqi' ? 11 : 23);

  // 世界座標 (x, z) → 畫布座標
  const px = (x: number) => w / 2 + x * pxPerUnit;
  const pz = (z: number) => h / 2 - z * pxPerUnit;
  const S = spec.spacing;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineCap = 'round';

  if (layout === 'xiangqi') {
    const left = -4 * S;
    const right = 4 * S;
    const bottom = -4.5 * S;
    const top = 4.5 * S;
    // 外框雙線
    ctx.lineWidth = pxPerUnit * 0.05;
    ctx.strokeRect(
      px(left) - pxPerUnit * 0.14,
      pz(top) - pxPerUnit * 0.14,
      (right - left) * pxPerUnit + pxPerUnit * 0.28,
      (top - bottom) * pxPerUnit + pxPerUnit * 0.28,
    );
    ctx.lineWidth = pxPerUnit * 0.028;
    // 橫線
    for (let r = 0; r < 10; r++) {
      const z = bottom + r * S;
      ctx.beginPath();
      ctx.moveTo(px(left), pz(z));
      ctx.lineTo(px(right), pz(z));
      ctx.stroke();
    }
    // 縱線：邊線貫穿，內線在河界斷開
    for (let f = 0; f < 9; f++) {
      const x = left + f * S;
      ctx.beginPath();
      if (f === 0 || f === 8) {
        ctx.moveTo(px(x), pz(bottom));
        ctx.lineTo(px(x), pz(top));
      } else {
        ctx.moveTo(px(x), pz(bottom));
        ctx.lineTo(px(x), pz(bottom + 4 * S));
        ctx.moveTo(px(x), pz(bottom + 5 * S));
        ctx.lineTo(px(x), pz(top));
      }
      ctx.stroke();
    }
    // 九宮斜線
    for (const [r0, r2] of [
      [0, 2],
      [7, 9],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(px(-S), pz(bottom + r0 * S));
      ctx.lineTo(px(S), pz(bottom + r2 * S));
      ctx.moveTo(px(S), pz(bottom + r0 * S));
      ctx.lineTo(px(-S), pz(bottom + r2 * S));
      ctx.stroke();
    }
    // 炮位、兵位標記
    const mark = (f: number, r: number) => {
      const x = px(left + f * S);
      const y = pz(bottom + r * S);
      const g = pxPerUnit * 0.08;
      const l = pxPerUnit * 0.2;
      ctx.lineWidth = pxPerUnit * 0.022;
      for (const [sx, sy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        if ((f === 0 && sx < 0) || (f === 8 && sx > 0)) continue;
        ctx.beginPath();
        ctx.moveTo(x + sx * g, y + sy * (g + l));
        ctx.lineTo(x + sx * g, y + sy * g);
        ctx.lineTo(x + sx * (g + l), y + sy * g);
        ctx.stroke();
      }
    };
    for (const [f, r] of [
      [1, 2],
      [7, 2],
      [1, 7],
      [7, 7],
      [0, 3],
      [2, 3],
      [4, 3],
      [6, 3],
      [8, 3],
      [0, 6],
      [2, 6],
      [4, 6],
      [6, 6],
      [8, 6],
    ] as const) {
      mark(f, r);
    }
    // 楚河 漢界
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.85;
    ctx.font = `${Math.round(pxPerUnit * 0.62)}px ${PIECE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = pz(0);
    ctx.save();
    ctx.translate(px(-2 * S), riverY);
    ctx.fillText('楚　河', 0, 0);
    ctx.restore();
    ctx.fillText('漢　界', px(2 * S), riverY);
    ctx.globalAlpha = 1;
  } else {
    // 暗棋：8×4 方格
    const halfW = (spec.cols * S) / 2;
    const halfD = (spec.rows * S) / 2;
    ctx.lineWidth = pxPerUnit * 0.05;
    ctx.strokeRect(
      px(-halfW) - pxPerUnit * 0.12,
      pz(halfD) - pxPerUnit * 0.12,
      spec.cols * S * pxPerUnit + pxPerUnit * 0.24,
      spec.rows * S * pxPerUnit + pxPerUnit * 0.24,
    );
    ctx.lineWidth = pxPerUnit * 0.03;
    for (let c = 0; c <= spec.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(px(-halfW + c * S), pz(-halfD));
      ctx.lineTo(px(-halfW + c * S), pz(halfD));
      ctx.stroke();
    }
    for (let r = 0; r <= spec.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(px(-halfW), pz(-halfD + r * S));
      ctx.lineTo(px(halfW), pz(-halfD + r * S));
      ctx.stroke();
    }
    // 格子內淡淡的菱形紋
    ctx.globalAlpha = 0.12;
    for (let c = 0; c < spec.cols; c++) {
      for (let r = 0; r < spec.rows; r++) {
        const cx = px(-halfW + (c + 0.5) * S);
        const cy = pz(-halfD + (r + 0.5) * S);
        const d = pxPerUnit * S * 0.18;
        ctx.beginPath();
        ctx.moveTo(cx, cy - d);
        ctx.lineTo(cx + d, cy);
        ctx.lineTo(cx, cy + d);
        ctx.lineTo(cx - d, cy);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  const tex = toTexture(canvas);
  cache.set(key, tex);
  return tex;
}

export function frameTexture(): THREE.Texture {
  const key = 'frame';
  const hit = cache.get(key);
  if (hit) return hit;
  const [canvas, ctx] = makeCanvas(512, 512);
  paintWood(ctx, 512, 512, PALETTE.frame, '#1d0f06', 5);
  const tex = toTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

export interface FaceTextures {
  map: THREE.Texture;
  bump: THREE.Texture;
}

/**
 * 棋子正面：象牙色底 + 凹刻外環 + 雕刻文字。
 * 另產生灰階 bump map 讓文字呈現凹刻立體感。
 */
export function pieceFaceTextures(side: Side, kind: PieceKind, size: number): FaceTextures {
  const key = `face:${side}:${kind}:${size}`;
  const hitMap = cache.get(key);
  const hitBump = cache.get(`${key}:bump`);
  if (hitMap && hitBump) return { map: hitMap, bump: hitBump };

  const label = pieceLabel(side, kind);
  const color = side === 'red' ? PALETTE.red : PALETTE.black;
  const c = size / 2;

  const [canvas, ctx] = makeCanvas(size, size);
  const bg = ctx.createRadialGradient(c * 0.8, c * 0.7, size * 0.05, c, c, c);
  bg.addColorStop(0, '#f7ecd2');
  bg.addColorStop(0.75, PALETTE.ivory);
  bg.addColorStop(1, PALETTE.ivoryEdge);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // 細緻木紋
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#7a5530';
  for (let i = 0; i < 26; i++) {
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.ellipse(
      c * 1.3,
      c * 1.8,
      size * (0.2 + i * 0.03),
      size * (0.08 + i * 0.02),
      0.3,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 凹刻外環
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.028;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.405, 0, Math.PI * 2);
  ctx.stroke();
  // 文字：先淡色高光再主色，模擬刻痕
  ctx.font = `bold ${Math.round(size * 0.52)}px ${PIECE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(label, c + size * 0.008, c + size * 0.035);
  ctx.fillStyle = color;
  ctx.fillText(label, c, c + size * 0.025);

  const [bumpCanvas, b] = makeCanvas(size, size);
  b.fillStyle = '#ffffff';
  b.fillRect(0, 0, size, size);
  b.strokeStyle = '#000000';
  b.lineWidth = size * 0.03;
  b.beginPath();
  b.arc(c, c, size * 0.405, 0, Math.PI * 2);
  b.stroke();
  b.font = ctx.font;
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  b.fillStyle = '#202020';
  b.fillText(label, c, c + size * 0.025);
  // 外緣倒角
  const edge = b.createRadialGradient(c, c, size * 0.44, c, c, size * 0.5);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.6)');
  b.fillStyle = edge;
  b.fillRect(0, 0, size, size);

  const map = toTexture(canvas);
  const bump = toTexture(bumpCanvas, false);
  cache.set(key, map);
  cache.set(`${key}:bump`, bump);
  return { map, bump };
}

/** 暗棋蓋牌背面：玉石色 + 回紋 */
export function pieceBackTexture(size: number): THREE.Texture {
  const key = `back:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  const bg = ctx.createRadialGradient(c * 0.7, c * 0.6, size * 0.05, c, c, c);
  bg.addColorStop(0, '#4f9a7d');
  bg.addColorStop(0.7, PALETTE.jade);
  bg.addColorStop(1, PALETTE.jadeDark);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(227,181,91,0.85)';
  ctx.lineWidth = size * 0.02;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.33, 0, Math.PI * 2);
  ctx.stroke();
  // 八角回紋
  ctx.save();
  ctx.translate(c, c);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.1);
    ctx.lineTo(size * 0.05, -size * 0.2);
    ctx.lineTo(0, -size * 0.28);
    ctx.lineTo(-size * 0.05, -size * 0.2);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(227,181,91,0.9)';
  ctx.beginPath();
  ctx.arc(c, c, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
  const tex = toTexture(canvas);
  cache.set(key, tex);
  return tex;
}
