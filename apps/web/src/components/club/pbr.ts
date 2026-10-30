'use client';

import { useMemo } from 'react';
import { RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';

/**
 * 街口的 PBR 貼圖組（docs/ART_BIBLE_LOBBY.md §4）。每組三張，放在 public/club/textures/<name>/：
 * albedo（sRGB）、normal（OpenGL 切線空間）、orm（R = AO、G = roughness、B = metalness）。
 * 目前的檔案由 scripts/club-textures.py 產生；換成掃描或手繪貼圖時保持檔名與通道即可。
 *
 * 載入是非同步的：先回傳貼圖物件，圖片到了才上傳 GPU，不會擋住第一格畫面。
 * 同一組、同一個重複次數的貼圖共用同一個物件，Bake 才能把材質相同的 mesh 合併。
 */
export type PbrSet = 'asphalt' | 'arcade_tile' | 'facade_tile' | 'concrete';

export interface PbrMaps {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
  aoMap: Texture;
}

const loader = typeof window === 'undefined' ? null : new TextureLoader();
const base = new Map<string, Texture>();
/** 圖片還沒到就建立的重複版本，載入完成後再標記上傳 */
const waiting = new Map<Texture, Texture[]>();
const repeated = new Map<string, PbrMaps>();

function load(set: PbrSet, channel: 'albedo' | 'normal' | 'orm'): Texture | null {
  if (!loader) return null;
  const key = `${set}/${channel}`;
  let t = base.get(key);
  if (!t) {
    t = loader.load(`/club/textures/${key}.webp`, (loaded) => {
      for (const c of waiting.get(loaded) ?? []) c.needsUpdate = true;
      waiting.delete(loaded);
    });
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    if (channel === 'albedo') t.colorSpace = SRGBColorSpace;
    base.set(key, t);
  }
  return t;
}

/** 依重複次數（四捨五入到 0.25）取得一組貼圖；伺服器端回傳 null */
export function pbrMaps(set: PbrSet, rx: number, ry: number): PbrMaps | null {
  const qx = Math.max(0.25, Math.round(rx * 4) / 4);
  const qy = Math.max(0.25, Math.round(ry * 4) / 4);
  const key = `${set}:${qx}:${qy}`;
  const hit = repeated.get(key);
  if (hit) return hit;
  const albedo = load(set, 'albedo');
  const normal = load(set, 'normal');
  const orm = load(set, 'orm');
  if (!albedo || !normal || !orm) return null;
  // 共用同一張圖片（Source），只多一份 repeat 設定，不會重複上傳 GPU。
  // 不用 clone()：它會立刻標記需要上傳，圖片還沒到時每格都會警告
  const at = (t: Texture) => {
    const c = new Texture();
    c.source = t.source;
    c.wrapS = t.wrapS;
    c.wrapT = t.wrapT;
    c.anisotropy = t.anisotropy;
    c.colorSpace = t.colorSpace;
    c.repeat.set(qx, qy);
    if (t.image) c.needsUpdate = true;
    else waiting.set(t, [...(waiting.get(t) ?? []), c]);
    return c;
  };
  const ormRep = at(orm);
  const maps: PbrMaps = {
    map: at(albedo),
    normalMap: at(normal),
    roughnessMap: ormRep,
    aoMap: ormRep,
  };
  repeated.set(key, maps);
  return maps;
}

/** 以公尺為單位：size 是表面寬高、tile 是一張貼圖代表幾公尺 */
export function usePbr(set: PbrSet, size: [number, number], tile: number): PbrMaps | null {
  return useMemo(() => pbrMaps(set, size[0] / tile, size[1] / tile), [set, size[0], size[1], tile]);
}
