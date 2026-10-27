import { beforeEach, describe, expect, it } from 'vitest';
import { seededRandom } from '@xiangqi-arena/shared';
import {
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  type Ack,
  type RoomSnapshot,
} from '@xiangqi-arena/game-protocol';
import { BigTwoMatchViewSchema, hintsForView } from '@xiangqi-arena/games-big-two';
import { buildMatchRows } from '../src/persistence';
import {
  RoomController,
  UnknownGameError,
  type FinishedMatchInfo,
} from '../src/room/RoomController';

interface Sent {
  clientId: string;
  channel: string;
  payload: unknown;
}

const tokenA = 'token-aaaaaaaaaaaaaaaa';
const tokenB = 'token-bbbbbbbbbbbbbbbb';
const tokenC = 'token-cccccccccccccccc';
let n = 0;
const aid = () => `act-${++n}-zzzzzz`;

function setup() {
  let now = 1_000_000;
  const sent: Sent[] = [];
  const finished: FinishedMatchInfo[] = [];
  const ctl = new RoomController({
    roomCode: 'ABC234',
    now: () => now,
    random: seededRandom(4),
    send: (clientId, channel, payload) => sent.push({ clientId, channel, payload }),
    onMatchFinished: (info) => finished.push(info),
    timings: { abandonMs: 30_000, lobbySeatReleaseMs: 60_000 },
  });
  const lastSnapshot = (clientId: string): RoomSnapshot => {
    const s = [...sent].reverse().find((m) => m.clientId === clientId && m.channel === 'snapshot');
    if (!s) throw new Error('no snapshot');
    return RoomSnapshotSchema.parse(s.payload);
  };
  const lastAck = (clientId: string): Ack =>
    [...sent].reverse().find((m) => m.clientId === clientId && m.channel === 'ack')!.payload as Ack;
  return {
    ctl,
    sent,
    finished,
    advance: (ms: number) => {
      now += ms;
    },
    lastSnapshot,
    lastAck,
  };
}

const join = (ctl: RoomController, clientId: string, token: string, name = '玩家') =>
  ctl.join(clientId, { protocol: PROTOCOL_VERSION, playerToken: token, name });

function startXiangqi(t: ReturnType<typeof setup>) {
  join(t.ctl, 'ca', tokenA, '阿紅');
  join(t.ctl, 'cb', tokenB, '阿黑');
  t.ctl.handleMessage('ca', { type: 'setReady', ready: true });
  t.ctl.handleMessage('cb', { type: 'setReady', ready: true });
  t.ctl.handleMessage('ca', { type: 'start' });
  const snap = t.lastSnapshot('ca');
  const turnClient = snap.game!.turnSeat === 0 ? 'ca' : 'cb';
  const otherClient = turnClient === 'ca' ? 'cb' : 'ca';
  return { snap, turnClient, otherClient };
}

describe('RoomController seats', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('seats two players and rejects a third', () => {
    expect(join(t.ctl, 'ca', tokenA)).toMatchObject({ ok: true, seat: 0 });
    expect(join(t.ctl, 'cb', tokenB)).toMatchObject({ ok: true, seat: 1 });
    expect(t.ctl.canJoin(tokenC)).toBe(false);
    expect(join(t.ctl, 'cc', tokenC)).toEqual({ ok: false, error: 'ROOM_FULL' });
    const snap = t.lastSnapshot('cb');
    expect(snap.yourSeat).toBe(1);
    expect(snap.hostSeat).toBe(0);
  });

  it('the same token reclaims its seat and replaces the old connection', () => {
    join(t.ctl, 'ca', tokenA);
    join(t.ctl, 'cb', tokenB);
    const r = join(t.ctl, 'ca2', tokenA);
    expect(r).toEqual({ ok: true, seat: 0, replacedClientId: 'ca' });
    expect(t.ctl.seatOfClient('ca')).toBeNull();
    // 舊連線之後離開不影響座位
    t.ctl.leave('ca', false);
    expect(t.lastSnapshot('cb').seats[0]?.connected).toBe(true);
  });

  it('consented leave in lobby frees the seat and transfers host', () => {
    join(t.ctl, 'ca', tokenA);
    join(t.ctl, 'cb', tokenB);
    t.ctl.leave('ca', true);
    const snap = t.lastSnapshot('cb');
    expect(snap.seats[0]).toBeNull();
    expect(snap.hostSeat).toBe(1);
    expect(join(t.ctl, 'cc', tokenC)).toMatchObject({ ok: true, seat: 0 });
  });

  it('releases a disconnected lobby seat after the timeout', () => {
    join(t.ctl, 'ca', tokenA);
    join(t.ctl, 'cb', tokenB);
    t.ctl.leave('cb', false);
    t.advance(59_000);
    t.ctl.tick();
    expect(t.lastSnapshot('ca').seats[1]).not.toBeNull();
    t.advance(2_000);
    t.ctl.tick();
    expect(t.lastSnapshot('ca').seats[1]).toBeNull();
  });
});

describe('RoomController lobby', () => {
  it('only the host can configure and start, and only when both are ready', () => {
    const t = setup();
    join(t.ctl, 'ca', tokenA);
    join(t.ctl, 'cb', tokenB);
    t.ctl.handleMessage('cb', { type: 'configure', mode: 'banqi', timeControl: 'blitz-5-3' });
    expect(t.lastAck('cb')).toMatchObject({ ok: false, error: 'NOT_HOST' });
    t.ctl.handleMessage('ca', { type: 'configure', mode: 'banqi', timeControl: 'blitz-5-3' });
    expect(t.lastSnapshot('cb').config).toEqual({
      gameId: 'xiangqi',
      mode: 'banqi',
      timeControl: 'blitz-5-3',
    });
    // 遊戲沒有的模式（含舊名稱 xiangqi）一律拒絕
    t.ctl.handleMessage('ca', { type: 'configure', mode: 'xiangqi', timeControl: 'unlimited' });
    expect(t.lastAck('ca')).toMatchObject({ ok: false, error: 'INVALID_CONFIG' });
    expect(t.lastSnapshot('cb').config.mode).toBe('banqi');
    t.ctl.handleMessage('ca', { type: 'start' });
    expect(t.lastAck('ca')).toMatchObject({ ok: false, error: 'PLAYERS_NOT_READY' });
    t.ctl.handleMessage('ca', { type: 'setReady', ready: true });
    t.ctl.handleMessage('cb', { type: 'setReady', ready: true });
    t.ctl.handleMessage('cb', { type: 'start' });
    expect(t.lastAck('cb')).toMatchObject({ ok: false, error: 'NOT_HOST' });
    t.ctl.handleMessage('ca', { type: 'start' });
    const snap = t.lastSnapshot('cb');
    expect(snap.phase).toBe('playing');
    expect(snap.game?.mode).toBe('banqi');
    expect(snap.clock?.remainingMs).toEqual([300_000, 300_000]);
  });

  it('validates messages and rejects strangers', () => {
    const t = setup();
    join(t.ctl, 'ca', tokenA);
    t.ctl.handleMessage('ca', { type: 'hack', seat: 1 });
    expect(t.lastAck('ca')).toMatchObject({ ok: false, error: 'INVALID_MESSAGE' });
    t.ctl.handleMessage('stranger', { type: 'setReady', ready: true });
    expect(t.lastAck('stranger')).toMatchObject({ ok: false, error: 'NOT_SEATED' });
  });

  it('rate limits floods', () => {
    const t = setup();
    join(t.ctl, 'ca', tokenA);
    for (let i = 0; i < 40; i++)
      t.ctl.handleMessage('ca', { type: 'setReady', ready: i % 2 === 0 });
    const limited = t.sent.filter(
      (m) => m.channel === 'ack' && (m.payload as Ack).error === 'RATE_LIMITED',
    );
    expect(limited.length).toBeGreaterThan(0);
  });
});

describe('RoomController match flow', () => {
  it('validates turn, version, duplicates and broadcasts the result', () => {
    const t = setup();
    const { snap, turnClient, otherClient } = startXiangqi(t);
    expect(snap.game?.version).toBe(0);
    const red = snap.game!.turnSeat!;
    expect(snap.game!.seatSides[red]).toBe('red');

    const move = { kind: 'move', from: 7 + 2 * 9, to: 4 + 2 * 9 }; // 炮二平五
    t.ctl.handleMessage(otherClient, {
      type: 'action',
      actionId: aid(),
      expectedVersion: 0,
      action: move,
    });
    expect(t.lastAck(otherClient)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });

    const id = aid();
    t.ctl.handleMessage(turnClient, {
      type: 'action',
      actionId: id,
      expectedVersion: 0,
      action: move,
    });
    expect(t.lastAck(turnClient)).toMatchObject({ ok: true, actionId: id });
    const after = t.lastSnapshot(otherClient);
    expect(after.game?.version).toBe(1);
    expect(after.game?.lastAction).toMatchObject({ from: 25, to: 22 });
    expect(after.game?.legalActions.length).toBeGreaterThan(0);

    t.ctl.handleMessage(turnClient, {
      type: 'action',
      actionId: id,
      expectedVersion: 0,
      action: move,
    });
    expect(t.lastAck(turnClient)).toMatchObject({ ok: false, error: 'DUPLICATE' });
    t.ctl.handleMessage(otherClient, {
      type: 'action',
      actionId: aid(),
      expectedVersion: 0,
      action: { kind: 'move', from: 7 + 9 * 9, to: 6 + 7 * 9 },
    });
    expect(t.lastAck(otherClient)).toMatchObject({ ok: false, error: 'STALE_VERSION' });
  });

  it('forfeits a player who stays disconnected, but not one who comes back', () => {
    const t = setup();
    const { turnClient, otherClient } = startXiangqi(t);
    t.ctl.drop(otherClient);
    t.advance(20_000);
    t.ctl.tick();
    expect(t.lastSnapshot(turnClient).abandonDeadlineMs.some((d) => d !== null)).toBe(true);
    t.ctl.reconnect(otherClient);
    t.advance(20_000);
    t.ctl.tick();
    expect(t.lastSnapshot(turnClient).phase).toBe('playing');

    t.ctl.drop(otherClient);
    t.advance(31_000);
    t.ctl.tick();
    const snap = t.lastSnapshot(turnClient);
    expect(snap.phase).toBe('ended');
    expect(snap.game?.outcome).toMatchObject({ type: 'win', reason: 'abandon' });
    expect(t.finished).toHaveLength(1);
  });

  it('flags on timeout from the server tick', () => {
    const t = setup();
    join(t.ctl, 'ca', tokenA);
    join(t.ctl, 'cb', tokenB);
    t.ctl.handleMessage('ca', { type: 'configure', mode: 'classic', timeControl: 'blitz-5-3' });
    t.ctl.handleMessage('ca', { type: 'setReady', ready: true });
    t.ctl.handleMessage('cb', { type: 'setReady', ready: true });
    t.ctl.handleMessage('ca', { type: 'start' });
    const first = t.lastSnapshot('ca').game!.turnSeat!;
    t.advance(5 * 60_000 + 1);
    t.ctl.tick();
    const snap = t.lastSnapshot('ca');
    expect(snap.game?.outcome).toEqual({
      type: 'win',
      winner: first === 0 ? 1 : 0,
      reason: 'timeout',
    });
    expect(t.finished).toHaveLength(1);
  });

  it('resign, then rematch swaps colours', () => {
    const t = setup();
    const { snap } = startXiangqi(t);
    const redSeat = snap.game!.turnSeat!;
    t.ctl.handleMessage('ca', { type: 'resign', actionId: aid() });
    expect(t.lastSnapshot('cb').phase).toBe('ended');
    t.ctl.handleMessage('ca', { type: 'rematch', actionId: aid() });
    expect(t.lastSnapshot('ca').rematchVotes).toEqual([true, false]);
    t.ctl.handleMessage('cb', { type: 'rematch', actionId: aid() });
    const next = t.lastSnapshot('ca');
    expect(next.phase).toBe('playing');
    expect(next.matchNumber).toBe(2);
    expect(next.game?.seatSides[redSeat]).toBe('black');
  });

  it('draw offer and acceptance', () => {
    const t = setup();
    startXiangqi(t);
    t.ctl.handleMessage('ca', { type: 'offerDraw', actionId: aid() });
    expect(t.lastSnapshot('cb').drawOfferSeat).toBe(0);
    t.ctl.handleMessage('cb', { type: 'respondDraw', actionId: aid(), accept: true });
    expect(t.lastSnapshot('ca').game?.outcome).toEqual({ type: 'draw', reason: 'agreement' });
  });

  it('banqi snapshots never contain hidden identities', () => {
    const t = setup();
    join(t.ctl, 'ca', tokenA);
    join(t.ctl, 'cb', tokenB);
    t.ctl.handleMessage('ca', { type: 'configure', mode: 'banqi', timeControl: 'unlimited' });
    t.ctl.handleMessage('ca', { type: 'setReady', ready: true });
    t.ctl.handleMessage('cb', { type: 'setReady', ready: true });
    t.ctl.handleMessage('ca', { type: 'start' });
    const payloads = t.sent
      .filter((m) => m.channel === 'snapshot')
      .map((m) => JSON.stringify(m.payload));
    const last = payloads.at(-1)!;
    expect(last).not.toMatch(/"faceUp":false,"side"/);
    expect(last).not.toMatch(/"kind":"(king|pawn|chariot|horse|cannon|advisor|elephant)"/);
  });
});

describe('RoomController game binding', () => {
  const deps = {
    roomCode: 'XYZ234',
    now: () => 0,
    random: seededRandom(1),
    send: () => undefined,
  };

  it('defaults to xiangqi and sizes seats from the game', () => {
    const ctl = new RoomController(deps);
    expect(ctl.game.id).toBe('xiangqi');
    expect(ctl.seatCount).toBe(2);
    const snap = ctl.snapshotFor(null);
    expect(snap.config).toMatchObject({ gameId: 'xiangqi', mode: 'classic' });
    expect(snap.seats).toEqual([null, null]);
  });

  it('rejects unknown games', () => {
    expect(() => new RoomController({ ...deps, gameId: 'nope' })).toThrow(UnknownGameError);
  });

  it('ignores an unknown initial mode', () => {
    const ctl = new RoomController(deps);
    ctl.configureInitial('chess', 'unlimited');
    expect(ctl.snapshotFor(null).config).toMatchObject({
      mode: 'classic',
      timeControl: 'unlimited',
    });
  });
});

describe('RoomController with a four-player game', () => {
  it('runs a full Big Two match with four seats, hiding hands and recording placements', () => {
    let now = 0;
    const sent: Sent[] = [];
    const finished: FinishedMatchInfo[] = [];
    const ctl = new RoomController({
      roomCode: 'BIG234',
      gameId: 'big-two',
      now: () => now,
      random: seededRandom(9),
      send: (clientId, channel, payload) => sent.push({ clientId, channel, payload }),
      onMatchFinished: (info) => finished.push(info),
    });
    expect(ctl.seatCount).toBe(4);
    const clients = ['c0', 'c1', 'c2', 'c3'];
    clients.forEach((id, i) => join(ctl, id, `token-big-two-${i}-xxxxxxxx`, `P${i}`));
    expect(join(ctl, 'c4', tokenA)).toEqual({ ok: false, error: 'ROOM_FULL' });
    for (const id of clients) ctl.handleMessage(id, { type: 'setReady', ready: true });
    ctl.handleMessage('c0', { type: 'start' });
    expect(ctl.currentPhase).toBe('playing');

    const hands = clients.map((_, seat) => ctl.snapshotFor(seat).game!.hand as number[]);
    expect(new Set(hands.flat()).size).toBe(52);
    expect(ctl.snapshotFor(null).game!.hand).toEqual([]);

    for (let i = 0; i < 400 && ctl.currentPhase === 'playing'; i++) {
      const turn = ctl.snapshotFor(null).game!.turnSeat!;
      const view = BigTwoMatchViewSchema.parse(ctl.snapshotFor(turn).game);
      const best = hintsForView(view, turn)[0];
      now += 10;
      ctl.handleMessage(clients[turn]!, {
        type: 'action',
        actionId: aid(),
        expectedVersion: view.version,
        action: best ? { kind: 'play', cards: best.cards } : { kind: 'pass' },
      });
      const ack = [...sent]
        .reverse()
        .find((m) => m.clientId === clients[turn] && m.channel === 'ack');
      expect((ack!.payload as Ack).ok).toBe(true);
    }
    expect(ctl.currentPhase).toBe('ended');
    expect(finished).toHaveLength(1);
    const rows = buildMatchRows(finished[0]!, finished[0]!.match.summary())!;
    expect(rows.match).toMatchObject({ game_id: 'big-two', mode: 'standard', result: 'win' });
    expect(rows.players.map((p) => p.placement).sort()).toEqual([1, 2, 3, 4]);
    expect(rows.players.filter((p) => p.result === 'win')).toHaveLength(1);
  });
});
