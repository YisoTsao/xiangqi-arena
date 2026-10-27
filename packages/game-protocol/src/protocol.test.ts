import { describe, expect, it } from 'vitest';
import { ClientIntentSchema, JoinOptionsSchema } from './client';
import { PROTOCOL_VERSION } from './common';
import { MatchViewBaseSchema, RoomSnapshotSchema } from './server';

describe('protocol validation', () => {
  it('accepts well formed intents; action payload is left to the game', () => {
    expect(
      ClientIntentSchema.safeParse({
        type: 'action',
        actionId: 'abcdefgh1234',
        expectedVersion: 3,
        action: { kind: 'move', from: 1, to: 19 },
      }).success,
    ).toBe(true);
    expect(ClientIntentSchema.safeParse({ type: 'setReady', ready: true }).success).toBe(true);
    expect(
      ClientIntentSchema.safeParse({ type: 'configure', mode: 'banqi', timeControl: 'unlimited' })
        .success,
    ).toBe(true);
  });

  it('rejects malformed or malicious intents', () => {
    const bad = [
      null,
      'move',
      { type: 'action', actionId: 'x', expectedVersion: 0, action: {} },
      { type: 'action', actionId: 'abcdefgh', expectedVersion: -1, action: {} },
      { type: 'setReady', ready: 'yes' },
      { type: 'setReady', ready: true, seat: 1 }, // 多餘欄位（例如企圖指定座位）
      { type: 'configure', mode: 'Banqi!', timeControl: 'unlimited' },
      { type: 'win' },
    ];
    for (const b of bad) expect(ClientIntentSchema.safeParse(b).success).toBe(false);
  });

  it('validates join options', () => {
    const base = { protocol: PROTOCOL_VERSION, playerToken: 'a'.repeat(24), name: '小明' };
    expect(JoinOptionsSchema.safeParse(base).success).toBe(true);
    expect(
      JoinOptionsSchema.safeParse({ ...base, gameId: 'xiangqi', mode: 'classic' }).success,
    ).toBe(true);
    expect(JoinOptionsSchema.safeParse({ ...base, protocol: 1 }).success).toBe(false);
    expect(JoinOptionsSchema.safeParse({ ...base, playerToken: 'short' }).success).toBe(false);
    expect(JoinOptionsSchema.safeParse({ ...base, name: '<script>' }).success).toBe(false);
    expect(JoinOptionsSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
    expect(JoinOptionsSchema.safeParse({ ...base, gameId: '../etc' }).success).toBe(false);
  });

  it('match views keep game-specific fields', () => {
    const view = {
      gameId: 'xiangqi',
      mode: 'classic',
      version: 0,
      activeSeats: [0],
      turnSeat: 0,
      outcome: null,
      board: [null],
    };
    const parsed = MatchViewBaseSchema.parse(view);
    expect(parsed.board).toEqual([null]);
  });

  it('room snapshots support more than two seats', () => {
    const snapshot = {
      roomCode: 'ABCD',
      roomVersion: 1,
      phase: 'lobby',
      hostSeat: 0,
      yourSeat: 3,
      seats: [null, null, null, { name: '小明', connected: true, ready: false }],
      config: { gameId: 'big-two', mode: 'standard', timeControl: 'unlimited' },
      matchNumber: 0,
      clock: null,
      drawOfferSeat: null,
      rematchVotes: [false, false, false, false],
      game: null,
      abandonDeadlineMs: [null, null, null, null],
    };
    expect(RoomSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});
