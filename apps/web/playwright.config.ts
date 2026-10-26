import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
const SERVER_PORT = 2567;

/**
 * E2E：同時啟動遊戲伺服器與 Next.js（production build），
 * 用兩個獨立 browser context 模擬兩位玩家。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `pnpm --filter @xiangqi-arena/game-server exec tsx src/index.ts`,
      env: { PORT: String(SERVER_PORT), CORS_ORIGINS: `http://localhost:${WEB_PORT}` },
      url: `http://localhost:${SERVER_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
