import { expect, test } from '@playwright/test';

/**
 * 暮光遊樂館：街口開場 → 進入遊戲 → 沿中央走道走進 1F → 在麻將桌入座開打 → 離桌回到桌邊。
 */
test('走進 1F 麻將館入座打牌，離桌後回到桌邊', async ({ page }) => {
  await page.goto('/club?hour=20');
  const root = page.getByTestId('club-root');
  await expect(root).toHaveAttribute('data-mode', 'title');
  await expect(page.getByTestId('club-clock')).toContainText('20:00 · 夜晚');

  await page.getByTestId('club-enter').click();
  await expect(root).toHaveAttribute('data-mode', 'walk', { timeout: 20_000 });

  // 一小段一小段按 W，從騎樓直走進門，直到出現麻將桌的入座提示（低幀率時也不會走過頭）
  const prompt = page.getByTestId('club-prompt');
  const seatPrompt = prompt.filter({ hasText: '入座' });
  for (let i = 0; i < 60 && (await seatPrompt.count()) === 0; i++) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(120);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(80);
  }
  await expect(prompt).toContainText('入座');

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
