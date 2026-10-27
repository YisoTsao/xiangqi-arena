import { expect, test } from '@playwright/test';

/**
 * 暮光遊樂館：街口開場 → 進入遊戲 → 沿中央走道走進 1F → 在麻將桌入座開打 → 離桌回到桌邊。
 */
test('走進 1F 麻將館入座打牌，離桌後回到桌邊', async ({ page }) => {
  // CI 沒有 GPU，3D 場景用軟體渲染只有每秒幾格，放寬時間並用低畫質
  test.setTimeout(150_000);
  await page.goto('/club?hour=20&q=low');
  const root = page.getByTestId('club-root');
  await expect(root).toHaveAttribute('data-mode', 'title');
  await expect(page.getByTestId('club-clock')).toContainText('20:00 · 夜晚');

  await page.getByTestId('club-enter').click();
  await expect(root).toHaveAttribute('data-mode', 'walk', { timeout: 60_000 });

  // 「帶我去空桌」：沿尋路走到最近的麻將桌旁，出現入座提示
  // （方向鍵走路由單元測試涵蓋；這裡不依賴軟體渲染的幀率）
  await page.getByTestId('club-find-table').click();
  await expect(page.getByTestId('club-prompt')).toContainText('入座', { timeout: 90_000 });

  await page.keyboard.press('KeyE');
  await expect(root).toHaveAttribute('data-mode', 'seated');
  await expect(page.getByTestId('mj-hand')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('mj-exit').click();
  await expect(root).toHaveAttribute('data-mode', 'walk');
  // 回到桌邊，入座提示還在
  await expect(page.getByTestId('club-prompt')).toContainText('入座');
  await page.getByTestId('club-act').click();
  await expect(page.getByTestId('mj-hand')).toBeVisible({ timeout: 10_000 });
});

test('首頁可以走進麻將館', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('club-open').click();
  await expect(page).toHaveURL(/\/club$/);
  await expect(page.getByTestId('club-enter')).toBeVisible();
});
