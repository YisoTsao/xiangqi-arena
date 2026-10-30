/**
 * 暮光遊樂館的日夜時鐘（docs/CLUB_ART_BIBLE.md §5）。
 * 現實 2 小時 = 遊戲 1 天，由 UTC 算出，所有玩家看到的時間一致。
 */

export const MS_PER_GAME_HOUR = 300_000;

export function gameHourAt(now: number): number {
  return (now / MS_PER_GAME_HOUR) % 24;
}

export type DayPhase = 'morning' | 'day' | 'dusk' | 'night';

export const DAY_PHASE_LABELS: Record<DayPhase, string> = {
  morning: '早晨',
  day: '白天',
  dusk: '傍晚',
  night: '夜晚',
};

export function dayPhaseOf(hour: number): DayPhase {
  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

export function formatGameTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

type RGB = readonly [number, number, number];

/** 某個時刻的室外光線 */
export interface Lighting {
  sky: RGB;
  /** 地平線附近的霧色 */
  fog: RGB;
  sun: RGB;
  sunIntensity: number;
  /** 太陽仰角（弧度）；夜晚是月亮 */
  sunElevation: number;
  /** 太陽方位（弧度，從 +x 往 -z 量） */
  sunAzimuth: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiIntensity: number;
  /** 霓虹與窗光亮度 0～1 */
  neon: number;
}

const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

const NIGHT: Lighting = {
  sky: hex(0x24344d),
  fog: hex(0x3a3460),
  sun: hex(0x8fa6d8),
  sunIntensity: 0.3,
  sunElevation: 0.9,
  sunAzimuth: 2.2,
  hemiSky: hex(0x4a5a8a),
  hemiGround: hex(0x241c2a),
  hemiIntensity: 0.4,
  neon: 1,
};
const MORNING: Lighting = {
  sky: hex(0xbcd6e8),
  fog: hex(0xf2cfa6),
  sun: hex(0xffe2bd),
  sunIntensity: 1.6,
  sunElevation: 0.35,
  sunAzimuth: 0.4,
  hemiSky: hex(0xd8e6f2),
  hemiGround: hex(0x8a7058),
  hemiIntensity: 0.9,
  neon: 0,
};
const DAY: Lighting = {
  sky: hex(0x8cc4ea),
  fog: hex(0xcfe4f2),
  sun: hex(0xfff6e6),
  sunIntensity: 2.2,
  sunElevation: 1.1,
  sunAzimuth: 1.4,
  hemiSky: hex(0xd6ecff),
  hemiGround: hex(0x9a8064),
  hemiIntensity: 1.05,
  neon: 0,
};
const DUSK: Lighting = {
  // 傍晚要和夜晚分得開：天頂偏紫、地平線橘，低角度橘紅主光斜打在立面上，霓虹才剛亮一半
  sky: hex(0x6a4f8e),
  fog: hex(0xf0905c),
  sun: hex(0xff7a3c),
  sunIntensity: 2.8,
  sunElevation: 0.2,
  sunAzimuth: 2.7,
  hemiSky: hex(0xc88aa0),
  hemiGround: hex(0x4a3236),
  hemiIntensity: 0.75,
  neon: 0.6,
};

/** 關鍵影格（遊戲小時 → 光線），之間線性內插 */
const KEYS: readonly [number, Lighting][] = [
  [0, NIGHT],
  [5.5, NIGHT],
  [7, MORNING],
  [9.5, DAY],
  [16.5, DAY],
  [18, DUSK],
  [19.5, NIGHT],
  [24, NIGHT],
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];

export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]![0] <= h) i++;
  const [h0, a] = KEYS[i]!;
  const [h1, b] = KEYS[i + 1]!;
  const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
  return {
    sky: mixRGB(a.sky, b.sky, t),
    fog: mixRGB(a.fog, b.fog, t),
    sun: mixRGB(a.sun, b.sun, t),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, t),
    sunElevation: mix(a.sunElevation, b.sunElevation, t),
    sunAzimuth: mix(a.sunAzimuth, b.sunAzimuth, t),
    hemiSky: mixRGB(a.hemiSky, b.hemiSky, t),
    hemiGround: mixRGB(a.hemiGround, b.hemiGround, t),
    hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity, t),
    neon: mix(a.neon, b.neon, t),
  };
}
