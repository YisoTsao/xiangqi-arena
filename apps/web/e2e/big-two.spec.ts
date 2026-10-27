import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPlayer(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((playerName) => {
    localStorage.setItem('xa:settings', JSON.stringify({ state: { sound: false }, version: 1 }));
    localStorage.setItem('xa:name', playerName);
  }, name);
  return context.newPage();
}

const tap = (page: Page, testId: string) =>
  page.locator(`[data-testid="${testId}"]:visible`).first().click();

const handSize = (page: Page) => page.locator('[data-testid="hand"] [data-card]').count();

/** 用「提示」選牌並出牌；沒有能出的牌就過 */
async function playHint(page: Page) {
  await tap(page, 'hint');
  const play = page.getByTestId('play');
  if (await play.isEnabled()) await play.click();
  else await tap(page, 'pass');
}

test('big two practice: deal, play with hints against bots, resign', async ({ browser }) => {
  const page = await newPlayer(browser, '練習者');
  await page.goto('/big-two/practice');
  await expect(page.getByTestId('hand')).toBeVisible();
  expect(await handSize(page)).toBe(13);

  // 電腦玩家輪流出牌，等到輪到自己
  await expect(page.getByTestId('turn-status')).toContainText('輪到你', { timeout: 15_000 });
  const before = await handSize(page);
  await playHint(page);
  await expect(page.getByTestId('turn-status')).not.toContainText('輪到你');
  expect(await handSize(page)).toBeLessThanOrEqual(before);

  await tap(page, 'resign');
  await tap(page, 'confirm-resign');
  await expect(page.getByTestId('end-title')).toContainText('第四名');
});

test('big two online: four players, hidden hands, turn order, resign', async ({ browser }) => {
  const names = ['東', '南', '西', '北'];
  const pages = await Promise.all(names.map((n) => newPlayer(browser, n)));
  const [host, ...guests] = pages as [Page, Page, Page, Page];

  await host.goto('/');
  await host.getByTestId('big-two-room').click();
  const code = (await host.getByTestId('room-code').textContent())!.trim();
  for (const g of guests) {
    await g.goto(`/room/${code}`);
    await expect(g.getByTestId('room-code')).toHaveText(code);
  }
  for (const p of pages) await p.getByTestId('ready-toggle').click();
  await expect(host.getByTestId('start-game')).toBeEnabled();
  await host.getByTestId('start-game').click();

  for (const p of pages) {
    await expect(p.getByTestId('hand')).toBeVisible();
    expect(await handSize(p)).toBe(13);
  }
  // 四家手牌不重複
  const hands = await Promise.all(
    pages.map((p) =>
      p
        .locator('[data-testid="hand"] [data-card]')
        .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-card')))),
    ),
  );
  expect(new Set(hands.flat()).size).toBe(52);

  const turnPage = async () => {
    for (const p of pages) {
      if ((await p.getByTestId('turn-status').textContent())?.includes('輪到你')) return p;
    }
    return null;
  };
  // 持有梅花 3 的人先出
  const first = (await turnPage())!;
  expect(hands[pages.indexOf(first)]).toContain(0);
  await expect(first.getByTestId('turn-status')).toContainText('梅花 3');
  await playHint(first);
  const next = pages[(pages.indexOf(first) + 1) % 4]!;
  await expect(next.getByTestId('turn-status')).toContainText('輪到你');
  await playHint(next);

  await tap(host, 'resign');
  await tap(host, 'confirm-resign');
  for (const p of pages) await expect(p.getByTestId('end-title')).toBeVisible();
  await expect(host.getByTestId('end-title')).toContainText('第四名');
});
