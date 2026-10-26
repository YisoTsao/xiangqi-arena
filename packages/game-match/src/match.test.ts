import { describe, expect, it } from 'vitest';
import { seededRandom } from '@xiangqi-arena/shared';
import { parseSquare } from '@xiangqi-arena/game-xiangqi';
import { GameViewSchema } from '@xiangqi-arena/game-protocol';
import { Match } from './match';

const S = (n: string): number => parseSquare(n)!;
let idCounter = 0;
const aid = (): string => `action-${++idCounter}-xxxx`;

function xiangqi(now = 0, timeControl: { initialMs: number; incrementMs: number } | null = null) {
  return new Match({ mode: 'xiangqi', timeControl, random: seededRandom(1), firstSeat: 0, now });
}

describe('Match (xiangqi)', () => {
  it('seat 0 plays red and moves first; version increments', () => {
    const m = xiangqi();
    expect(m.turnSeat).toBe(0);
    expect(m.seatSide(0)).toBe('red');
    const r = m.submitAction(
      0,
      { actionId: aid(), expectedVersion: 0, action: { kind: 'move', from: S('h2'), to: S('e2') } },
      10,
    );
    expect(r.ok).toBe(true);
    expect(m.version).toBe(1);
    expect(m.turnSeat).toBe(1);
    expect(m.view(1).moveList[0]?.notation).toBe('炮二平五');
  });

  it('rejects out-of-turn, stale, duplicate and foreign-piece actions', () => {
    const m = xiangqi();
    const move = { kind: 'move' as const, from: S('h2'), to: S('e2') };
    expect(m.submitAction(1, { actionId: aid(), expectedVersion: 0, action: move }, 0)).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(
      m.submitAction(
        0,
        {
          actionId: aid(),
          expectedVersion: 0,
          action: { kind: 'move', from: S('b9'), to: S('c7') },
        },
        0,
      ),
    ).toEqual({ ok: false, error: 'NOT_YOUR_PIECE' });
    expect(m.submitAction(0, { actionId: aid(), expectedVersion: 5, action: move }, 0)).toEqual({
      ok: false,
      error: 'STALE_VERSION',
    });
    const id = aid();
    expect(m.submitAction(0, { actionId: id, expectedVersion: 0, action: move }, 0).ok).toBe(true);
    // 同一封包重送
    expect(m.submitAction(0, { actionId: id, expectedVersion: 0, action: move }, 0)).toEqual({
      ok: false,
      error: 'DUPLICATE',
    });
    expect(
      m.submitAction(
        0,
        { actionId: aid(), expectedVersion: 1, action: { kind: 'flip', square: 0 } },
        0,
      ),
    ).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(m.version).toBe(1);
  });

  it('simultaneous submissions: only the first one with the current version wins', () => {
    const m = xiangqi();
    const a = m.submitAction(
      0,
      { actionId: aid(), expectedVersion: 0, action: { kind: 'move', from: S('h2'), to: S('e2') } },
      0,
    );
    const b = m.submitAction(
      0,
      { actionId: aid(), expectedVersion: 0, action: { kind: 'move', from: S('b2'), to: S('e2') } },
      0,
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });

  it('runs the clock with increment and flags on timeout', () => {
    const m = xiangqi(0, { initialMs: 10_000, incrementMs: 1_000 });
    m.submitAction(
      0,
      { actionId: aid(), expectedVersion: 0, action: { kind: 'move', from: S('h2'), to: S('e2') } },
      4_000,
    );
    expect(m.clockView(4_000)?.remainingMs).toEqual([7_000, 10_000]);
    expect(m.clockView(4_000)?.running).toBe(1);
    expect(m.tick(13_999)).toBe(false);
    expect(m.tick(14_000)).toBe(true);
    expect(m.outcome).toEqual({ type: 'win', winner: 0, reason: 'timeout' });
    expect(m.turnSeat).toBeNull();
    // 超時後再送行動
    expect(
      m.submitAction(
        1,
        {
          actionId: aid(),
          expectedVersion: m.version,
          action: { kind: 'move', from: S('h9'), to: S('g7') },
        },
        15_000,
      ),
    ).toEqual({ ok: false, error: 'GAME_NOT_ACTIVE' });
  });

  it('a late move after the flag fell is rejected', () => {
    const m = xiangqi(0, { initialMs: 1_000, incrementMs: 0 });
    const r = m.submitAction(
      0,
      { actionId: aid(), expectedVersion: 0, action: { kind: 'move', from: S('h2'), to: S('e2') } },
      5_000,
    );
    expect(r).toEqual({ ok: false, error: 'GAME_NOT_ACTIVE' });
    expect(m.outcome?.type).toBe('win');
  });

  it('handles resign', () => {
    const m = xiangqi();
    expect(m.resign(1, aid(), 0).ok).toBe(true);
    expect(m.outcome).toEqual({ type: 'win', winner: 0, reason: 'resign' });
    expect(m.resign(0, aid(), 0)).toEqual({ ok: false, error: 'GAME_NOT_ACTIVE' });
  });

  it('handles draw offers', () => {
    const m = xiangqi();
    expect(m.respondDraw(1, aid(), true, 0)).toEqual({ ok: false, error: 'NO_DRAW_OFFER' });
    expect(m.offerDraw(0, aid(), 0).ok).toBe(true);
    expect(m.offerDraw(0, aid(), 0)).toEqual({ ok: false, error: 'DRAW_OFFER_LIMIT' });
    expect(m.respondDraw(0, aid(), true, 0)).toEqual({ ok: false, error: 'NO_DRAW_OFFER' });
    expect(m.respondDraw(1, aid(), false, 0).ok).toBe(true);
    expect(m.drawOffer).toBeNull();
    expect(m.outcome).toBeNull();
    // 對手走棋 = 拒絕
    m.offerDraw(1, aid(), 0);
    m.submitAction(
      0,
      {
        actionId: aid(),
        expectedVersion: m.version,
        action: { kind: 'move', from: S('h2'), to: S('e2') },
      },
      0,
    );
    expect(m.drawOffer).toBeNull();
    m.offerDraw(0, aid(), 0);
    expect(m.respondDraw(1, aid(), true, 0).ok).toBe(true);
    expect(m.outcome).toEqual({ type: 'draw', reason: 'agreement' });
  });

  it('only gives legal actions to the seat on turn', () => {
    const m = xiangqi();
    expect(m.view(0).legalActions).toHaveLength(44);
    expect(m.view(1).legalActions).toHaveLength(0);
    expect(m.view(null).legalActions).toHaveLength(0);
    expect(GameViewSchema.safeParse(m.view(0)).success).toBe(true);
  });
});

describe('Match (banqi) hidden information', () => {
  const banqi = () =>
    new Match({ mode: 'banqi', timeControl: null, random: seededRandom(77), firstSeat: 0, now: 0 });

  it('never sends identities of face-down pieces', () => {
    const m = banqi();
    for (const viewer of [0, 1, null] as const) {
      const v = m.view(viewer);
      expect(GameViewSchema.safeParse(v).success).toBe(true);
      for (const c of v.board) expect(c && Object.keys(c).sort()).toEqual(['faceUp', 'id']);
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/"kind":"(king|advisor|elephant|chariot|horse|cannon|pawn)"/);
    }
  });

  it('reveals only the flipped piece', () => {
    const m = banqi();
    const r = m.submitAction(
      0,
      { actionId: aid(), expectedVersion: 0, action: { kind: 'flip', square: 10 } },
      0,
    );
    expect(r.ok).toBe(true);
    const v = m.view(1);
    const up = v.board.filter((c) => c?.faceUp);
    expect(up).toHaveLength(1);
    expect(v.lastAction?.revealed).toEqual({
      side: (up[0] as { side: string }).side,
      kind: (up[0] as { kind: string }).kind,
    });
    expect(v.seatSides[0]).toBe((up[0] as { side: string }).side);
    expect(v.legalActions.length).toBeGreaterThan(0);
    expect(m.view(0).legalActions).toHaveLength(0);
  });

  it('rejects flipping a face-up piece and moving opponent pieces', () => {
    const m = banqi();
    m.submitAction(
      0,
      { actionId: aid(), expectedVersion: 0, action: { kind: 'flip', square: 10 } },
      0,
    );
    expect(
      m.submitAction(
        1,
        { actionId: aid(), expectedVersion: 1, action: { kind: 'flip', square: 10 } },
        0,
      ),
    ).toEqual({ ok: false, error: 'CANNOT_FLIP' });
    expect(
      m.submitAction(
        1,
        { actionId: aid(), expectedVersion: 1, action: { kind: 'move', from: 10, to: 11 } },
        0,
      ),
    ).toEqual({ ok: false, error: 'NOT_YOUR_PIECE' });
  });
});
