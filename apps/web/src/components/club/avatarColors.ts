/** 玩家角色的造型與顏色（純函式，伺服器端也能用） */

export const AVATAR_VARIANTS = [
  'mini_female_b',
  'mini_female_c',
  'mini_female_d',
  'mini_female_e',
  'mini_female_f',
  'mini_male_a',
  'mini_male_b',
  'mini_male_c',
  'mini_male_d',
  'mini_male_e',
  'mini_male_f',
] as const;
export type AvatarVariant = (typeof AVATAR_VARIANTS)[number] | 'mini_female_a';

/** 依顏色字串挑一個固定的基本造型（同一個顏色永遠是同一個人） */
export function variantForColor(color: string): (typeof AVATAR_VARIANTS)[number] {
  let h = 0;
  for (let i = 0; i < color.length; i++) h = (h * 31 + color.charCodeAt(i)) >>> 0;
  return AVATAR_VARIANTS[h % AVATAR_VARIANTS.length]!;
}

/** 好看、彼此分得開的玩家色（色相隨機，飽和度與亮度固定） */
export function randomAvatarColor(): string {
  const h = Math.floor(Math.random() * 360);
  return hslToHex(h, 62, 56);
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
