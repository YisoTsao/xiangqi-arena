import { randomId } from './utils';
import { readStorage, writeStorage } from './storage';

const TOKEN_KEY = 'xa:playerToken';
const NAME_KEY = 'xa:name';

/**
 * 匿名訪客身分：token 是只有本機知道的祕密，用來在重新整理或斷線後取回座位。
 * 第三階段改用 Supabase Auth 後，token 可與帳號綁定。
 */
export function getPlayerToken(): string {
  let token = readStorage(TOKEN_KEY);
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    token = randomId(32);
    writeStorage(TOKEN_KEY, token);
  }
  return token;
}

export function getPlayerName(): string {
  const saved = readStorage(NAME_KEY);
  if (saved && saved.trim()) return saved.trim().slice(0, 16);
  const name = `棋士${Math.floor(1000 + Math.random() * 9000)}`;
  writeStorage(NAME_KEY, name);
  return name;
}

export function setPlayerName(name: string): void {
  const clean = name
    .replace(/[<>\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 16);
  if (clean) writeStorage(NAME_KEY, clean);
}
