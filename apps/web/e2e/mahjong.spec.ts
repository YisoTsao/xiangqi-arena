import { expect, test } from '@playwright/test';

test('mahjong practice: deal, discard against bots, react to claims', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('xa:settings', JSON.stringify({ state: { sound: false }, version: 1 }));
  });
  await page.goto('/');
  await page.getByTestId('mahjong-practice').click();
  await expect(page).toHaveURL(/\/mahjong\/practice$/);

  const tiles = page.getByTestId('mj-hand-tile');
  await expect(tiles.first()).toBeVisible();
  const count = await tiles.count();
  expect([16, 17]).toContain(count);
  await expect(page.getByTestId('mj-seat-top')).toBeVisible();

  // 打幾手：輪到自己就打最右邊那張（剛摸的牌），有人打出可吃碰胡的牌時按「過」
  for (let turn = 0; turn < 3; turn++) {
    const status = page.getByTestId('mj-status');
    await expect(async () => {
      if (await page.getByTestId('mj-pass').isVisible()) await page.getByTestId('mj-pass').click();
      await expect(status).toContainText('輪到你', { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    if (await page.getByTestId('mj-result').isVisible()) break;
    const tile = page.locator('[data-testid="mj-hand-tile"]:not([disabled])').last();
    await tile.click();
    await expect(status).toContainText('再按一次');
    await tile.click();
    await expect(status).not.toContainText('輪到你');
  }
});
