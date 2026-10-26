/**
 * 亂數來源抽象：回傳 [0, maxExclusive) 的整數。
 * 伺服器使用 crypto.randomInt；測試使用可重現的種子亂數。
 */
export type RandomInt = (maxExclusive: number) => number;

/** mulberry32：快速、可重現的種子亂數，只用於測試與本機練習，不用於正式洗牌。 */
export function seededRandom(seed: number): RandomInt {
  let a = seed >>> 0;
  return (maxExclusive: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * maxExclusive);
  };
}

/** Fisher–Yates 洗牌，回傳新陣列。 */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** 避免易混淆字元 (0/O, 1/I/L) 的房間代碼字母表。 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(randomInt: RandomInt, length = ROOM_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function isRoomCode(value: string): boolean {
  if (value.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of value) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}
