'use client';

import { create } from 'zustand';
import { INTERACTABLES, SPAWN, findPath, type Interactable, type Vec2 } from './layout';

/**
 * title：開場的街口全景 + 選單
 * intro：按下「進入遊戲」後鏡頭推向門口
 * walk：自由走動
 * seated：坐在麻將桌，牌局畫面蓋在場景上
 */
export type ClubMode = 'title' | 'intro' | 'walk' | 'seated';

/** 街口天氣：下雨時地面濕亮、會倒映招牌與路燈 */
export type Weather = 'rain' | 'clear';

/** 每一格畫面都會改的角色狀態放在這裡，不進 React state */
export const player = {
  pos: [...SPAWN] as [number, number],
  /** 面向（弧度，atan2(dx, dz)；π = 朝 -z 走進建築） */
  yaw: Math.PI,
  path: [] as Vec2[],
  moving: false,
};

interface ClubState {
  mode: ClubMode;
  /** 角色在 1F 室內（外觀與樓上會藏起來） */
  inside: boolean;
  nearby: Interactable | null;
  /** 坐下的桌子 id */
  seatedAt: string | null;
  /** NPC 或系統的對白 */
  bubble: { who: string; text: string } | null;
  weather: Weather;
  setWeather: (weather: Weather) => void;
  setMode: (mode: ClubMode) => void;
  setInside: (inside: boolean) => void;
  setNearby: (it: Interactable | null) => void;
  sit: (tableId: string) => void;
  stand: (to: Vec2) => void;
  say: (who: string, text: string) => void;
  reset: () => void;
}

export const useClub = create<ClubState>((set) => ({
  mode: 'title',
  inside: false,
  nearby: null,
  seatedAt: null,
  bubble: null,
  weather: 'rain',
  setWeather: (weather) => set({ weather }),
  setMode: (mode) => set({ mode }),
  setInside: (inside) => set((s) => (s.inside === inside ? s : { inside })),
  setNearby: (nearby) => set((s) => (s.nearby?.id === nearby?.id ? s : { nearby })),
  sit: (tableId) => {
    player.path = [];
    set({ mode: 'seated', seatedAt: tableId, bubble: null });
  },
  stand: (to) => {
    player.pos = [to[0], to[1]];
    player.yaw = Math.PI;
    player.path = [];
    set({ mode: 'walk', seatedAt: null });
  },
  say: (who, text) => set({ bubble: { who, text } }),
  reset: () => {
    player.pos = [...SPAWN];
    player.yaw = Math.PI;
    player.path = [];
    set({ mode: 'title', inside: false, nearby: null, seatedAt: null, bubble: null });
  },
}));

/** 點地面或點物件：沿著尋路結果走過去 */
export function walkTo(target: Vec2): void {
  if (useClub.getState().mode !== 'walk') return;
  player.path = findPath(player.pos, target);
}

/** 「帶我去空桌」：走到離角色最近的麻將桌旁 */
export function walkToNearestTable(): void {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of INTERACTABLES) {
    if (it.kind !== 'table') continue;
    const d = Math.hypot(it.approach[0] - player.pos[0], it.approach[1] - player.pos[1]);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  if (best) walkTo(best.approach);
}
