'use client';

import { create } from 'zustand';
import { randomAvatarColor } from './avatarColors';
import {
  SPAWN,
  findPath,
  interactablesOf,
  type Floor,
  type Interactable,
  type Vec2,
} from './layout';

/**
 * title：開場的街口全景 + 選單
 * intro：按下「進入遊戲」後鏡頭推向門口
 * walk：自由走動
 * seated：坐在牌桌或棋桌，對局畫面蓋在場景上
 * travel：走樓梯或搭電梯換樓層（畫面淡出再淡入，期間不能操作）
 */
export type ClubMode = 'title' | 'intro' | 'walk' | 'seated' | 'travel';

/** 街口天氣：下雨時地面濕亮、會倒映招牌與路燈 */
export type Weather = 'rain' | 'clear';

/** 每一格畫面都會改的角色狀態放在這裡，不進 React state */
export const player = {
  pos: [...SPAWN] as [number, number],
  /** 面向（弧度，atan2(dx, dz)；π = 朝 -z 走進建築） */
  yaw: Math.PI,
  path: [] as Vec2[],
  moving: false,
  /** 按住 Shift 或點很遠的地方時用跑的 */
  running: false,
  /** 角色衣服的顏色（每開一個視窗隨機一個；多人連線時同步給別人） */
  color: sessionColor(),
};

/** 同一個分頁重新整理後保持同一個顏色；新開視窗就是新的角色 */
function sessionColor(): string {
  if (typeof window === 'undefined') return '#5cc2c9';
  try {
    const saved = window.sessionStorage.getItem('club-avatar-color');
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) return saved;
    const c = randomAvatarColor();
    window.sessionStorage.setItem('club-avatar-color', c);
    return c;
  } catch {
    return randomAvatarColor();
  }
}

/**
 * 室內外過渡：0 = 街上、1 = 室內，進出門時約 0.6 秒內平滑變化（DayNight 每格更新）。
 * 太陽、天光、霧與室內燈都依它內插，進門不會一格之內突然變暗或變亮。
 */
export const transition = { inside: 0 };

interface ClubState {
  mode: ClubMode;
  /** 角色所在樓層（1 = 街口與 1F、2 = 2F 牌桌館） */
  floor: Floor;
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
  /** 換樓層：淡出 → 換到 to 樓的 arrive 位置 → 淡入 */
  travel: (to: Floor, arrive: Vec2, yaw?: number) => void;
  sit: (tableId: string) => void;
  stand: (to: Vec2) => void;
  say: (who: string, text: string) => void;
  reset: () => void;
}

/** 換樓層淡出、淡入各用的時間（毫秒）；畫面上的黑幕依 mode === 'travel' 做 CSS 過渡 */
export const TRAVEL_FADE_MS = 380;

let travelTimer: ReturnType<typeof setTimeout> | null = null;

export const useClub = create<ClubState>((set, get) => ({
  mode: 'title',
  floor: 1,
  inside: false,
  nearby: null,
  seatedAt: null,
  bubble: null,
  weather: 'rain',
  setWeather: (weather) => set({ weather }),
  setMode: (mode) => set({ mode }),
  setInside: (inside) => set((s) => (s.inside === inside ? s : { inside })),
  setNearby: (nearby) => set((s) => (s.nearby?.id === nearby?.id ? s : { nearby })),
  travel: (to, arrive, yaw = Math.PI / 2) => {
    if (get().mode !== 'walk') return;
    player.path = [];
    set({ mode: 'travel', nearby: null, bubble: null });
    if (travelTimer) clearTimeout(travelTimer);
    travelTimer = setTimeout(() => {
      player.pos = [arrive[0], arrive[1]];
      player.yaw = yaw;
      // 換到 2F 一律算室內；回到 1F 時樓梯與電梯都在室內
      set({ floor: to, inside: true });
      travelTimer = setTimeout(() => {
        travelTimer = null;
        if (get().mode === 'travel') set({ mode: 'walk' });
      }, TRAVEL_FADE_MS);
    }, TRAVEL_FADE_MS);
  },
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
    if (travelTimer) clearTimeout(travelTimer);
    travelTimer = null;
    player.pos = [...SPAWN];
    player.yaw = Math.PI;
    player.path = [];
    set({
      mode: 'title',
      floor: 1,
      inside: false,
      nearby: null,
      seatedAt: null,
      bubble: null,
    });
  },
}));

/**
 * 拖曳畫面轉視角時，放開滑鼠那一下不算「點地面走過去」。
 * 拖曳超過幾個像素就設成 true，下一次按下時清掉。
 */
export const pointerGuard = { dragged: false };

/** 點地面或點物件：沿著尋路結果走過去 */
export function walkTo(target: Vec2): void {
  const { mode, floor } = useClub.getState();
  if (mode !== 'walk') return;
  player.path = findPath(player.pos, target, floor);
}

const SEAT_KINDS = new Set(['table', 'chess', 'cards']);

/** 「帶我去空桌」：走到離角色最近、這層樓的牌桌或棋桌旁 */
export function walkToNearestTable(): void {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of interactablesOf(useClub.getState().floor)) {
    if (!SEAT_KINDS.has(it.kind)) continue;
    const d = Math.hypot(it.approach[0] - player.pos[0], it.approach[1] - player.pos[1]);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  if (best) walkTo(best.approach);
}
