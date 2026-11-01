import { expect, test } from '@playwright/test';

/**
 * 俱樂部大廳：兩個視窗就是兩個角色。互相看得到、看得到誰坐在哪桌（桌上人數即時更新），
 * 坐在牌桌上也能公開聊天與私聊。
 */
test('兩個視窗互相看得到，入座人數即時更新，可以公開聊天與私聊', async ({ browser }) => {
  test.setTimeout(240_000);
  const url = '/club?spawn=table&hour=20&q=low';
  // 同一台伺服器的公開聊天紀錄會留著，每次用不同的招呼語
  const hello = `大家好！${Date.now() % 100000}`;
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto(url);
  await b.goto(url);

  // 線上人數：兩人
  await expect(a.getByTestId('club-online')).toHaveAttribute('data-count', '2', {
    timeout: 60_000,
  });
  await expect(b.getByTestId('club-online')).toHaveAttribute('data-count', '2', {
    timeout: 60_000,
  });
  // 互相看得到名牌（自己 + 對方）
  await expect(b.getByTestId('club-nametag')).toHaveCount(2);

  // A 在 2 號桌坐下 → B 看到桌上顯示 1 人
  await expect(a.getByTestId('club-prompt')).toContainText('2 號桌', { timeout: 30_000 });
  await a.getByTestId('club-act').click();
  await expect(a.getByTestId('club-root')).toHaveAttribute('data-mode', 'seated');
  const badge = b.getByTestId('club-table-badge-table-2');
  await expect(badge).toHaveAttribute('data-count', '1', { timeout: 10_000 });
  await expect(b.getByTestId('club-prompt-seats')).toHaveText('1/4 人');

  // B 也坐下 → A 那邊的資料也是 2 人（B 的畫面被牌桌蓋住，看 A 的入座提示）
  await b.getByTestId('club-act').click();
  await expect(b.getByTestId('club-root')).toHaveAttribute('data-mode', 'seated');
  await b.getByTestId('mj-exit').click();
  await expect(badge).toHaveAttribute('data-count', '1', { timeout: 10_000 });

  // A 坐在牌桌上公開聊天，B 收到未讀
  await a.getByTestId('club-chat-toggle').click();
  await a.getByTestId('club-chat-input').fill(hello);
  await a.getByTestId('club-chat-input').press('Enter');
  await expect(b.getByTestId('club-chat-unread')).toHaveText('1', { timeout: 10_000 });

  // B 私聊 A
  await b.getByTestId('club-chat-toggle').click();
  await expect(b.getByTestId('club-chat-message').last()).toContainText(hello);
  await b.getByTestId('club-chat-player').first().click();
  await b.getByTestId('club-chat-input').fill('等等一起打');
  await b.getByTestId('club-chat-input').press('Enter');
  await expect(a.locator('[data-testid=club-chat-message][data-private]')).toContainText(
    '等等一起打',
    { timeout: 10_000 },
  );

  // A 離桌 → B 看到桌上沒人了
  await a.getByTestId('club-chat-close').click();
  await a.getByTestId('mj-exit').click();
  await expect(badge).toHaveCount(0, { timeout: 10_000 });

  // A 關掉視窗 → B 只剩自己
  await ctxA.close();
  await expect(b.getByTestId('club-online')).toHaveAttribute('data-count', '1', {
    timeout: 30_000,
  });
  await ctxB.close();
});
