'use client';

import { create } from 'zustand';
import { randomAvatarColor } from './avatarColors';
import {
  CAMERA_YAW,
  SPAWN,
  findPath,
  interactablesOf,
  type ArcadeGame,
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
 * arcade：站在 1F 的遊樂機台前玩，遊戲畫面蓋在場景上
 */
export type ClubMode = 'title' | 'intro' | 'walk' | 'seated' | 'travel' | 'arcade';

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

/**
 * 自由視角的跟隨鏡頭：拖曳畫面轉 yaw／pitch，滾輪或雙指縮放改 dist。
 * 方向鍵依 yaw 轉換（W 永遠是「往畫面裡面走」）。
 */
export const orbit = {
  yaw: CAMERA_YAW.outside as number,
  pitch: 0.55,
  dist: 8.5,
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
  /** 正在玩的遊樂機台 */
  arcade: ArcadeGame | null;
  weather: Weather;
  setWeather: (weather: Weather) => void;
  setMode: (mode: ClubMode) => void;
  setInside: (inside: boolean) => void;
  setNearby: (it: Interactable | null) => void;
  /** 換樓層：淡出 → 換到 to 樓的 arrive 位置 → 淡入 */
  travel: (to: Floor, arrive: Vec2, yaw?: number) => void;
  sit: (tableId: string) => void;
  stand: (to: Vec2) => void;
  /** 開始玩機台／玩完離開（角色留在機台前） */
  playArcade: (game: ArcadeGame) => void;
  quitArcade: () => void;
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
  arcade: null,
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
  playArcade: (game) => {
    if (get().mode !== 'walk') return;
    player.path = [];
    set({ mode: 'arcade', arcade: game, bubble: null });
  },
  quitArcade: () => {
    if (get().mode !== 'arcade') return;
    set({ mode: 'walk', arcade: null });
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
      arcade: null,
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

/**
 * 重新整理後留在原地：目前位置、樓層、面向（和坐著的桌子）存在 sessionStorage。
 * 只在同一個分頁有效：另開視窗是另一個角色，從街口開始。
 */
const SPOT_KEY = 'xa:clubSpot';

export interface SavedSpot {
  floor: Floor;
  pos: Vec2;
  yaw: number;
  inside: boolean;
  seatedAt: string | null;
  /** 鏡頭角度，重新整理後視角也一樣 */
  cam?: [number, number, number];
}

/** 按「離開」後到換頁之前不要再存回去 */
let spotCleared = false;

export function saveSpot(): void {
  if (spotCleared) return;
  const s = useClub.getState();
  // 標題與推鏡途中不算「在場內」；換樓層途中位置還沒換好，等淡入完成再存
  if (s.mode === 'title' || s.mode === 'intro' || s.mode === 'travel') return;
  const spot: SavedSpot = {
    floor: s.floor,
    pos: [Math.round(player.pos[0] * 100) / 100, Math.round(player.pos[1] * 100) / 100],
    yaw: Math.round(player.yaw * 100) / 100,
    inside: s.inside,
    seatedAt: s.mode === 'seated' ? s.seatedAt : null,
    cam: [orbit.yaw, orbit.pitch, orbit.dist].map((x) => Math.round(x * 1000) / 1000) as [
      number,
      number,
      number,
    ],
  };
  try {
    window.sessionStorage.setItem(SPOT_KEY, JSON.stringify(spot));
  } catch {
    /* 無痕或停用儲存空間：重新整理就回到街口 */
  }
}

export function clearSpot(): void {
  spotCleared = true;
  try {
    window.sessionStorage.removeItem(SPOT_KEY);
  } catch {
    /* 同上 */
  }
}

export function loadSpot(): SavedSpot | null {
  spotCleared = false;
  try {
    const raw = window.sessionStorage.getItem(SPOT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedSpot>;
    const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
    if (v.floor !== 1 && v.floor !== 2) return null;
    if (!Array.isArray(v.pos) || !num(v.pos[0]) || !num(v.pos[1]) || !num(v.yaw)) return null;
    if (Math.abs(v.pos[0]!) > 200 || Math.abs(v.pos[1]!) > 200) return null;
    return {
      floor: v.floor,
      pos: [v.pos[0]!, v.pos[1]!],
      yaw: v.yaw!,
      inside: v.inside === true,
      seatedAt: typeof v.seatedAt === 'string' ? v.seatedAt : null,
      cam:
        Array.isArray(v.cam) && v.cam.length === 3 && v.cam.every(num)
          ? (v.cam as [number, number, number])
          : undefined,
    };
  } catch {
    return null;
  }
}
