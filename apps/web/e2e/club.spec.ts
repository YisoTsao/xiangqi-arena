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

  // 空桌：坐下就是開桌，四人到齊才開打，先顯示等人的畫面
  await expect(page.getByTestId('club-prompt-seats')).toHaveText('空桌，坐下就開桌');
  await page.keyboard.press('KeyE');
  await expect(root).toHaveAttribute('data-mode', 'seated');
  await expect(page.getByTestId('club-table-waiting')).toBeVisible();
  await expect(page.getByTestId('club-table-count')).toHaveText('1/4 人', { timeout: 20_000 });
  await expect(page.getByTestId('club-table-note')).toContainText('你開了這一桌');
  await expect(page.getByTestId('mj-hand')).toHaveCount(0);

  await page.getByTestId('club-table-leave').click();
  await expect(root).toHaveAttribute('data-mode', 'walk');
  // 回到桌邊，入座提示還在
  await expect(page.getByTestId('club-prompt')).toContainText('入座');
  await page.getByTestId('club-act').click();
  await expect(page.getByTestId('club-table-waiting')).toBeVisible();
});

test('重新整理後留在原地', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/club?hour=20&q=low&spawn=2f');
  const root = page.getByTestId('club-root');
  await expect(root).toHaveAttribute('data-mode', 'walk', { timeout: 60_000 });
  await expect(page.getByTestId('club-floor')).toContainText('2F 牌桌館');
  // 位置每秒存一次
  await page.waitForTimeout(1500);
  await page.goto('/club?hour=20&q=low');
  await expect(root).toHaveAttribute('data-mode', 'walk', { timeout: 60_000 });
  await expect(page.getByTestId('club-floor')).toContainText('2F 牌桌館');
  // 按「離開」就不再記得位置，下次從街口開始
  await page.getByTestId('club-exit').click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/club?hour=20&q=low');
  await expect(root).toHaveAttribute('data-mode', 'title');
});

test('首頁可以走進麻將館', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('club-open').click();
  await expect(page).toHaveURL(/\/club$/);
  await expect(page.getByTestId('club-enter')).toBeVisible();
});

/**
 * 2F 牌桌館：1F 樓梯口上樓 → 帶我去空桌（最近的是暗棋桌）→ 入座 → 返回桌邊。
 */
test('走樓梯上 2F 牌桌館入座下棋，離桌後回到 2F', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/club?hour=20&q=low&spawn=stairs');
  const root = page.getByTestId('club-root');
  await expect(root).toHaveAttribute('data-mode', 'walk', { timeout: 60_000 });
  await expect(page.getByTestId('club-prompt')).toContainText('上樓到 2F 牌桌館', {
    timeout: 60_000,
  });

  await page.getByTestId('club-act').click();
  await expect(page.getByTestId('club-floor')).toContainText('2F 牌桌館', { timeout: 30_000 });
  await expect(root).toHaveAttribute('data-mode', 'walk', { timeout: 30_000 });
  await expect(page.getByTestId('club-prompt')).toContainText('下樓到 1F 麻將館', {
    timeout: 60_000,
  });

  // 站在樓梯口（有下樓提示）也能直接「帶我去空桌」，不靠方向鍵（CI 軟體渲染的幀率不穩）
  await page.getByTestId('club-find-table').click({ timeout: 60_000 });
  await expect(page.getByTestId('club-prompt')).toContainText('棋桌', { timeout: 90_000 });

  await page.getByTestId('club-act').click();
  await expect(root).toHaveAttribute('data-mode', 'seated');
  await expect(page.getByTestId('club-table')).toHaveAttribute('data-game', 'chess');
  await expect(page.getByTestId('club-table-count')).toHaveText('1/2 人', { timeout: 20_000 });
  await page.getByTestId('club-table-leave').click();
  await expect(root).toHaveAttribute('data-mode', 'walk');
  await expect(page.getByTestId('club-floor')).toContainText('2F 牌桌館');
});
