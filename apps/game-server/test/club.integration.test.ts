import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import {
  CLUB_MSG,
  CLUB_PROTOCOL_VERSION,
  CLUB_ROOM_NAME,
  type ClubChatMessage,
  type ClubDenied,
  type ClubPlayer,
  type ClubState,
  type ClubTableRoom,
  type ClubWelcome,
  MSG,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  type RoomSnapshot,
} from '@xiangqi-arena/game-protocol';
import { createGameServer } from '../src/server';

const PORT = 4500 + Math.floor(Math.random() * 400);
const URL = `ws://localhost:${PORT}`;
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer({ corsOrigins: ['*'], clubDeps: { reconnectSeconds: 1 } });
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

/** 收下所有大廳訊息，並可等待某個條件成立 */
function track(room: Room) {
  const log: { type: string; data: unknown }[] = [];
  const waiters: { pred: () => boolean; resolve: () => void }[] = [];
  const push = (type: string) => (data: unknown) => {
    log.push({ type, data });
    for (const w of [...waiters]) {
      if (w.pred()) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve();
      }
    }
  };
  for (const type of Object.values(CLUB_MSG)) room.onMessage(type, push(type));
  const of = <T>(type: string) => log.filter((x) => x.type === type).map((x) => x.data as T);
  return {
    of,
    until(pred: () => boolean, ms = 3000): Promise<void> {
      if (pred()) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        waiters.push({
          pred,
          resolve: () => {
            clearTimeout(t);
            resolve();
          },
        });
      });
    },
  };
}

const join = (c: Client, name?: string) =>
  c.joinOrCreate(CLUB_ROOM_NAME, { protocol: CLUB_PROTOCOL_VERSION, name });

describe('club lobby (integration)', () => {
  it('shares presence, seats and chat between windows', async () => {
    const ra = await join(new Client(URL), 'Alice');
    const ta = track(ra);
    await ta.until(() => ta.of(CLUB_MSG.welcome).length === 1);
    const rb = await join(new Client(URL), 'Bob');
    const tb = track(rb);
    await tb.until(() => tb.of(CLUB_MSG.welcome).length === 1);
    expect(rb.roomId).toBe(ra.roomId);

    const wb = tb.of<ClubWelcome>(CLUB_MSG.welcome)[0]!;
    expect(wb.players.map((p) => p.name).sort()).toEqual(['Alice', 'Bob']);
    const [alice, bob] = ['Alice', 'Bob'].map((n) => wb.players.find((p) => p.name === n)!);
    expect(alice!.color).not.toBe(bob!.color);
    await ta.until(() => ta.of<ClubPlayer>(CLUB_MSG.joined).some((p) => p.name === 'Bob'));

    // 位置同步
    rb.send(CLUB_MSG.move, { floor: 1, x: 1.5, z: -3, yaw: 0.5, moving: true });
    await ta.until(() =>
      ta
        .of<ClubState[]>(CLUB_MSG.states)
        .some((s) => s.some((p) => p.id === bob!.id && p.x === 1.5)),
    );
    // 亂送的位置被丟掉
    rb.send(CLUB_MSG.move, { floor: 1, x: 'nope', z: 0, yaw: 0, moving: false });

    // 入座：棋桌只能坐兩人
    ra.send(CLUB_MSG.seat, { tableId: 'chess-1' });
    rb.send(CLUB_MSG.seat, { tableId: 'chess-1' });
    await ta.until(
      () => ta.of<ClubPlayer>(CLUB_MSG.updated).filter((p) => p.tableId === 'chess-1').length === 2,
    );
    const seats = ta
      .of<ClubPlayer>(CLUB_MSG.updated)
      .map((p) => p.seat)
      .sort();
    expect(seats).toEqual([0, 1]);

    const rc = await join(new Client(URL));
    const tc = track(rc);
    await tc.until(() => tc.of(CLUB_MSG.welcome).length === 1);
    const wc = tc.of<ClubWelcome>(CLUB_MSG.welcome)[0]!;
    expect(wc.players.filter((p) => p.tableId === 'chess-1')).toHaveLength(2);
    expect(wc.players.find((p) => p.id === wc.you)!.name).toMatch(/^訪客\d+$/);
    rc.send(CLUB_MSG.seat, { tableId: 'chess-1' });
    await tc.until(() => tc.of<ClubDenied>(CLUB_MSG.denied).some((d) => d.reason === 'table-full'));

    // 公開聊天：大家都收到
    ra.send(CLUB_MSG.chat, { text: '  大家好 <b>  ' });
    await tc.until(() => tc.of(CLUB_MSG.chatMessage).length === 1);
    expect(tc.of<ClubChatMessage>(CLUB_MSG.chatMessage)[0]).toMatchObject({
      fromName: 'Alice',
      text: '大家好 <b>',
    });
    expect(tc.of<ClubChatMessage>(CLUB_MSG.chatMessage)[0]!.to).toBeUndefined();

    // 私聊：只有雙方收到
    rb.send(CLUB_MSG.chat, { text: '悄悄話', to: alice!.id });
    await ta.until(() => ta.of<ClubChatMessage>(CLUB_MSG.chatMessage).some((m) => m.to));
    await tb.until(() => tb.of<ClubChatMessage>(CLUB_MSG.chatMessage).some((m) => m.to));
    expect(ta.of<ClubChatMessage>(CLUB_MSG.chatMessage).find((m) => m.to)).toMatchObject({
      fromName: 'Bob',
      toName: 'Alice',
      text: '悄悄話',
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(tc.of<ClubChatMessage>(CLUB_MSG.chatMessage).some((m) => m.to)).toBe(false);

    // 新來的人看得到公開聊天紀錄，看不到私聊
    const rd = await join(new Client(URL), 'Dan');
    const td = track(rd);
    await td.until(() => td.of(CLUB_MSG.welcome).length === 1);
    const hist = td.of<ClubWelcome>(CLUB_MSG.welcome)[0]!.history;
    expect(hist.map((m) => m.text)).toEqual(['大家好 <b>']);

    // 離桌、離開
    ra.send(CLUB_MSG.seat, { tableId: null });
    await tb.until(() =>
      tb.of<ClubPlayer>(CLUB_MSG.updated).some((p) => p.id === alice!.id && p.tableId === null),
    );
    await rb.leave();
    await ta.until(() => ta.of<{ id: string }>(CLUB_MSG.left).some((l) => l.id === bob!.id));

    await Promise.all([ra.leave(), rc.leave(), rd.leave()]);
  });

  it('opens one game room per table: the first sitter creates it, the rest join it', async () => {
    const ra = await join(new Client(URL), 'Host');
    const ta = track(ra);
    await ta.until(() => ta.of(CLUB_MSG.welcome).length === 1);
    ra.send(CLUB_MSG.seat, { tableId: 'table-3' });
    await ta.until(() => ta.of<ClubTableRoom>(CLUB_MSG.table).some((t) => t.tableId === 'table-3'));
    const code = ta.of<ClubTableRoom>(CLUB_MSG.table).find((t) => t.tableId === 'table-3')!.code!;
    expect(code).toMatch(/^[A-Z0-9]{4,8}$/);

    // 後來的人：welcome 裡就有這張桌子的房間代碼
    const rb = await join(new Client(URL), 'Guest');
    const tb = track(rb);
    await tb.until(() => tb.of(CLUB_MSG.welcome).length === 1);
    expect(tb.of<ClubWelcome>(CLUB_MSG.welcome)[0]!.tables?.['table-3']).toBe(code);

    // 對局房間是麻將、還在等人（四人桌只有一人，不會開局）
    const game = await new Client(URL).joinById(code, {
      protocol: PROTOCOL_VERSION,
      playerToken: 'host-token-0123456789',
      name: 'Host',
    });
    const snaps: RoomSnapshot[] = [];
    game.onMessage(MSG.snapshot, (raw: unknown) => snaps.push(RoomSnapshotSchema.parse(raw)));
    game.onMessage('*', () => undefined);
    await new Promise<void>((resolve, reject) => {
      const t0 = Date.now();
      const tick = () =>
        snaps.length
          ? resolve()
          : Date.now() - t0 > 3000
            ? reject(new Error('timeout'))
            : setTimeout(tick, 20);
      tick();
    });
    expect(snaps.at(-1)!.config.gameId).toBe('mahjong');
    expect(snaps.at(-1)!.phase).toBe('lobby');
    expect(snaps.at(-1)!.seats).toHaveLength(4);
    await game.leave();

    // 大家都站起來：桌子收掉，下一個人重新開桌
    ra.send(CLUB_MSG.seat, { tableId: null });
    await tb.until(() =>
      tb.of<ClubTableRoom>(CLUB_MSG.table).some((t) => t.tableId === 'table-3' && t.code === null),
    );
    rb.send(CLUB_MSG.seat, { tableId: 'table-3' });
    await tb.until(() =>
      tb.of<ClubTableRoom>(CLUB_MSG.table).some((t) => t.tableId === 'table-3' && t.code !== null),
    );
    const next = tb
      .of<ClubTableRoom>(CLUB_MSG.table)
      .filter((t) => t.code)
      .at(-1)!.code;
    expect(next).not.toBe(code);
    await Promise.all([ra.leave(), rb.leave()]);
  });

  it('keeps a color the window picked itself', async () => {
    const r = await new Client(URL).joinOrCreate(CLUB_ROOM_NAME, {
      protocol: CLUB_PROTOCOL_VERSION,
      color: '#12AB34',
    });
    const t = track(r);
    await t.until(() => t.of(CLUB_MSG.welcome).length === 1);
    const w = t.of<ClubWelcome>(CLUB_MSG.welcome)[0]!;
    expect(w.players.find((p) => p.id === w.you)!.color).toBe('#12ab34');
    await r.leave();
  });

  it('rejects wrong protocol', async () => {
    await expect(new Client(URL).joinOrCreate(CLUB_ROOM_NAME, { protocol: 99 })).rejects.toThrow(
      /PROTOCOL_MISMATCH/,
    );
  });
});
