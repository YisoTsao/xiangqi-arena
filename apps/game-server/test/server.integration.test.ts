import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { RoomSnapshotSchema, type Ack, type RoomSnapshot } from '@xiangqi-arena/game-protocol';
import { createGameServer, ROOM_NAME } from '../src/server';

const PORT = 3900 + Math.floor(Math.random() * 500);
const URL = `ws://localhost:${PORT}`;
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer({ corsOrigins: ['*'], deps: { reconnectSeconds: 5 } });
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const opts = (token: string, name: string) => ({ protocol: 1, playerToken: token, name });

/** 收集房間訊息，並可等待符合條件的快照 */
function track(room: Room) {
  const snapshots: RoomSnapshot[] = [];
  const acks: Ack[] = [];
  const waiters: { pred: (s: RoomSnapshot) => boolean; resolve: (s: RoomSnapshot) => void }[] = [];
  room.onMessage('snapshot', (raw: unknown) => {
    const s = RoomSnapshotSchema.parse(raw);
    snapshots.push(s);
    for (const w of [...waiters]) {
      if (w.pred(s)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(s);
      }
    }
  });
  room.onMessage('ack', (a: Ack) => acks.push(a));
  room.onMessage('notice', () => undefined);
  return {
    snapshots,
    acks,
    waitFor(pred: (s: RoomSnapshot) => boolean, ms = 5000): Promise<RoomSnapshot> {
      const existing = snapshots.find(pred);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout waiting for snapshot')), ms);
        waiters.push({
          pred,
          resolve: (s) => {
            clearTimeout(timer);
            resolve(s);
          },
        });
      });
    },
  };
}

describe('game server (integration)', () => {
  it('runs a full private-room flow over WebSocket', async () => {
    const a = new Client(URL);
    const b = new Client(URL);
    const c = new Client(URL);

    const roomA = await a.create(ROOM_NAME, {
      ...opts('alice-token-000000001', 'Alice'),
      mode: 'xiangqi',
    });
    const ta = track(roomA);
    expect(roomA.roomId).toMatch(/^[23456789A-Z]{6}$/);

    const roomB = await b.joinById(roomA.roomId, opts('bobby-token-000000002', 'Bob'));
    const tb = track(roomB);
    await ta.waitFor((s) => s.seats[1]?.name === 'Bob');

    // 第三名玩家不能占用座位
    await expect(c.joinById(roomA.roomId, opts('carol-token-000000003', 'Carol'))).rejects.toThrow(
      /ROOM_FULL/,
    );
    // 錯誤的加入參數
    await expect(
      c.joinById(roomA.roomId, { protocol: 1, playerToken: 'x', name: 'C' }),
    ).rejects.toThrow();

    roomA.send('intent', { type: 'setReady', ready: true });
    roomB.send('intent', { type: 'setReady', ready: true });
    await ta.waitFor((s) => s.seats[0]?.ready === true && s.seats[1]?.ready === true);
    roomA.send('intent', { type: 'start' });
    const started = await tb.waitFor((s) => s.phase === 'playing');
    expect(started.game?.mode).toBe('xiangqi');

    const redIsA = started.game!.turnSeat === 0;
    const [mover, waiter, tMover, tWaiter] = redIsA
      ? [roomA, roomB, ta, tb]
      : [roomB, roomA, tb, ta];

    // 非本人回合
    waiter.send('intent', {
      type: 'action',
      actionId: 'early-move-0001',
      expectedVersion: 0,
      action: { kind: 'move', from: 25, to: 22 },
    });
    // 合法走棋
    mover.send('intent', {
      type: 'action',
      actionId: 'first-move-0001',
      expectedVersion: 0,
      action: { kind: 'move', from: 25, to: 22 },
    });
    const afterMove = await tWaiter.waitFor((s) => s.game?.version === 1);
    expect(afterMove.game?.moveList[0]?.notation).toBe('炮二平五');
    await new Promise((r) => setTimeout(r, 100));
    expect(tWaiter.acks.find((x) => x.actionId === 'early-move-0001')).toMatchObject({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(tMover.acks.find((x) => x.actionId === 'first-move-0001')).toMatchObject({ ok: true });

    // 模擬重新整理頁面：用同一個 token 重新加入，取回座位與棋局
    const waiterSeat = afterMove.yourSeat;
    const waiterToken = redIsA ? 'bobby-token-000000002' : 'alice-token-000000001';
    const waiterName = redIsA ? 'Bob' : 'Alice';
    const fresh = new Client(URL);
    const rejoined = await fresh.joinById(roomA.roomId, opts(waiterToken, waiterName));
    const tr = track(rejoined);
    const restored = await tr.waitFor((s) => s.game?.version === 1);
    expect(restored.yourSeat).toBe(waiterSeat);
    expect(restored.game?.legalActions.length).toBeGreaterThan(0);

    await rejoined.leave(true);
    await mover.leave(true);
  });
});
