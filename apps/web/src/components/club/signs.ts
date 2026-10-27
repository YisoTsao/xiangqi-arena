'use client';

import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

/** 招牌配色，對應 CLUB_ART_BIBLE §2 */
export const CLUB = {
  wood: '#81583E',
  woodDark: '#5e3f2c',
  cream: '#F2DAB6',
  neonRed: '#E95B4B',
  navy: '#24344D',
  green: '#4E816F',
  purple: '#8552B8',
  amber: '#F2B552',
  cyan: '#5CC2C9',
  terrazzo: '#e6d3b3',
  asphalt: '#4a4650',
  sidewalk: '#b9a48a',
  ivory: '#f6efdc',
} as const;

interface SignOptions {
  text: string;
  /** 直式招牌一個字一行 */
  vertical?: boolean;
  bg: string;
  fg: string;
  border?: string;
  /** 畫布寬高（像素）；比例要和招牌網格一致 */
  width: number;
  height: number;
  font?: string;
}

/**
 * 用 2D canvas 畫招牌字，避免額外載入字型檔。字型用系統襯線字（和 UI 一致）。
 * 回傳的貼圖在元件卸載時釋放。
 */
export function useSignTexture({
  text,
  vertical,
  bg,
  fg,
  border,
  width,
  height,
  font = '"Noto Serif TC","Noto Serif CJK TC","Songti TC","PMingLiU",serif',
}: SignOptions): CanvasTexture | null {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    if (border) {
      const b = Math.round(Math.min(width, height) * 0.06);
      ctx.strokeStyle = border;
      ctx.lineWidth = b;
      ctx.strokeRect(b, b, width - 2 * b, height - 2 * b);
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...text];
    if (vertical) {
      const step = height / (chars.length + 0.6);
      ctx.font = `900 ${Math.round(Math.min(step * 0.82, width * 0.72))}px ${font}`;
      chars.forEach((c, i) => ctx.fillText(c, width / 2, step * (i + 0.8)));
    } else {
      const size = Math.min(height * 0.62, (width * 0.86) / Math.max(1, chars.length));
      ctx.font = `900 ${Math.round(size)}px ${font}`;
      ctx.fillText(text, width / 2, height / 2 + size * 0.04);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, vertical, bg, fg, border, width, height, font]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
