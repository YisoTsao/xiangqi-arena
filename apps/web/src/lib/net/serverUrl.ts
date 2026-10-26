/** 遊戲伺服器位址：優先使用環境變數，否則以目前網址推算（方便區網用手機測試） */
export function gameServerUrl(): string {
  const env = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (env) return env;
  if (typeof window === 'undefined') return 'ws://localhost:2567';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname}:2567`;
}
