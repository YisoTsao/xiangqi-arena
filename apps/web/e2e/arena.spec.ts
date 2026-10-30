import { expect, test, type Browser, type Page } from '@playwright/test';

// 使用 2D 棋盤讓點擊位置可預測（data-square 對應棋盤索引）
const SETTINGS_2D = JSON.stringify({
  state: { sound: false, quality: '2d', animation: 'off' },
  version: 1,
});
const sq = (file: number, rank: number) => rank * 9 + file;

async function newPlayer(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([settings, playerName]) => {
      localStorage.setItem('xa:settings', settings!);
      localStorage.setItem('xa:name', playerName!);
    },
    [SETTINGS_2D, name],
  );
  return context.newPage();
}

const clickSquare = (page: Page, square: number) =>
  page.locator(`[data-square="${square}"]`).click();

/** 桌面與手機各有一組操作按鈕，只點當前可見的那一個 */
const tap = (page: Page, testId: string) =>
  page.locator(`[data-testid="${testId}"]:visible`).first().click();

test('home page shows the main actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('quick-start')).toBeVisible();
  await expect(page.getByTestId('create-room')).toBeVisible();
  await expect(page.getByTestId('join-room')).toBeVisible();
  await expect(page.getByTestId('mode-banqi')).toBeVisible();
});

test('local hot-seat xiangqi: move and resign', async ({ browser }) => {
  const page = await newPlayer(browser, '本機');
  await page.goto('/local');
  await page.getByTestId('local-start').click();
  await expect(page.getByTestId('turn-status')).toContainText('紅方');
  await clickSquare(page, sq(7, 2));
  await clickSquare(page, sq(4, 2));
  await expect(page.getByTestId('turn-status')).toContainText('黑方');
  await tap(page, 'resign');
  await tap(page, 'confirm-resign');
  await expect(page.getByTestId('end-title')).toContainText('紅方');
});

test('leaving a room goes straight home even when the server is slow to answer', async ({
  browser,
}) => {
  const page = await newPlayer(browser, 'Dana');
  // 按離開前開始吞掉玩家送出的 WebSocket 訊息，模擬伺服器遲遲不回應離開請求
  await page.addInitScript(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (this: WebSocket, data) {
      if (!(window as unknown as { __stall?: boolean }).__stall) send.call(this, data);
    };
  });
  await page.goto('/');
  await page.getByTestId('create-room').click();
  await page.getByTestId('create-submit').click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __stall?: boolean }).__stall = true;
  });
  await page.getByRole('button', { name: '離開' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 5_000 });
  await expect(page.getByTestId('quick-start')).toBeVisible();
});

test('online room: two players, third rejected, move sync, reconnect, resign, rematch', async ({
  browser,
}) => {
  const alice = await newPlayer(browser, 'Alice');
  const bob = await newPlayer(browser, 'Bob');
  const carol = await newPlayer(browser, 'Carol');

  await alice.goto('/');
  await alice.getByTestId('create-room').click();
  await alice.getByTestId('create-submit').click();
  const code = (await alice.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await bob.goto('/');
  await bob.getByTestId('join-room').click();
  await bob.getByTestId('join-code').fill(code.toLowerCase());
  await bob.getByTestId('join-submit').click();
  await expect(bob.getByTestId('room-code')).toHaveText(code);
  await expect(alice.getByTestId('seat-1')).toContainText('Bob');

  // 第三位玩家無法占用座位
  await carol.goto(`/room/${code}`);
  await expect(carol.getByTestId('room-error')).toContainText('房間已滿');

  await alice.getByTestId('ready-toggle').click();
  await bob.getByTestId('ready-toggle').click();
  await expect(alice.getByTestId('start-game')).toBeEnabled();
  await alice.getByTestId('start-game').click();
  await expect(alice.getByTestId('board')).toBeVisible();
  await expect(bob.getByTestId('board')).toBeVisible();

  const aliceFirst = (await alice.getByTestId('turn-status').textContent())!.includes('輪到你');
  const [red, black] = aliceFirst ? [alice, bob] : [bob, alice];
  await expect(black.getByTestId('turn-status')).toContainText('對手');

  // 非本人回合點擊不會送出
  await clickSquare(black, sq(7, 7));
  await clickSquare(red, sq(7, 2));
  await clickSquare(red, sq(4, 2));
  await expect(black.getByTestId('turn-status')).toContainText('輪到你');
  await expect(black.getByText('炮二平五').first()).toBeAttached();

  // 重新整理頁面：用同一個 token 回到座位並還原棋局
  await black.reload();
  await expect(black.getByTestId('turn-status')).toContainText('輪到你');
  await expect(black.getByText('炮二平五').first()).toBeAttached();

  await clickSquare(black, sq(7, 9));
  await clickSquare(black, sq(6, 7));
  await expect(red.getByTestId('turn-status')).toContainText('輪到你');

  await tap(red, 'resign');
  await tap(red, 'confirm-resign');
  await expect(red.getByTestId('end-title')).toHaveText('落敗');
  await expect(black.getByTestId('end-title')).toHaveText('勝利！');

  await tap(red, 'rematch');
  await tap(black, 'rematch');
  // 再來一局交換紅黑：原本的黑方先走
  await expect(black.getByTestId('turn-status')).toContainText('輪到你');
});

test('leave goes straight home, even when the server never answers', async ({ browser }) => {
  const alice = await newPlayer(browser, 'Alice');
  // 開關打開後丟掉送往伺服器的訊息：伺服器收不到離開通知，模擬連線卡住
  await alice.addInitScript(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (this: WebSocket, data) {
      if (!(window as { __stall?: boolean }).__stall) send.call(this, data);
    };
  });

  await alice.goto('/');
  await alice.getByTestId('create-room').click();
  await alice.getByTestId('create-submit').click();
  await expect(alice.getByTestId('room-code')).toBeVisible();

  await alice.evaluate(() => ((window as { __stall?: boolean }).__stall = true));
  await alice.getByTestId('room-leave').click();
  await expect(alice).toHaveURL(/\/$/);
  await expect(alice.getByTestId('quick-start')).toBeVisible();
  await expect(alice.getByText('連線中…')).toHaveCount(0);
});

test('error screen home button returns to the home page', async ({ browser }) => {
  const alice = await newPlayer(browser, 'Alice');
  await alice.goto('/room/ZZZZZZ');
  await expect(alice.getByTestId('room-error')).toBeVisible();
  await alice.getByTestId('room-home').click();
  await expect(alice).toHaveURL(/\/$/);
  await expect(alice.getByTestId('quick-start')).toBeVisible();
});
