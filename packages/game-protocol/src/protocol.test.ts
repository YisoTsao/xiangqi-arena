import { describe, expect, it } from 'vitest';
import { ClientIntentSchema, JoinOptionsSchema } from './client';
import { CellViewSchema } from './server';

describe('protocol validation', () => {
  it('accepts well formed intents', () => {
    expect(
      ClientIntentSchema.safeParse({
        type: 'action',
        actionId: 'abcdefgh1234',
        expectedVersion: 3,
        action: { kind: 'move', from: 1, to: 19 },
      }).success,
    ).toBe(true);
    expect(ClientIntentSchema.safeParse({ type: 'setReady', ready: true }).success).toBe(true);
  });

  it('rejects malformed or malicious intents', () => {
    const bad = [
      null,
      'move',
      {
        type: 'action',
        actionId: 'x',
        expectedVersion: 0,
        action: { kind: 'move', from: 0, to: 1 },
      },
      {
        type: 'action',
        actionId: 'abcdefgh',
        expectedVersion: -1,
        action: { kind: 'move', from: 0, to: 1 },
      },
      {
        type: 'action',
        actionId: 'abcdefgh',
        expectedVersion: 0,
        action: { kind: 'move', from: 0, to: 999 },
      },
      {
        type: 'action',
        actionId: 'abcdefgh',
        expectedVersion: 0,
        action: { kind: 'teleport', to: 1 },
      },
      { type: 'setReady', ready: 'yes' },
      { type: 'setReady', ready: true, seat: 1 }, // 多餘欄位（例如企圖指定座位）
      { type: 'win' },
    ];
    for (const b of bad) expect(ClientIntentSchema.safeParse(b).success).toBe(false);
  });

  it('validates join options', () => {
    expect(
      JoinOptionsSchema.safeParse({ protocol: 1, playerToken: 'a'.repeat(24), name: '小明' })
        .success,
    ).toBe(true);
    expect(
      JoinOptionsSchema.safeParse({ protocol: 1, playerToken: 'short', name: '小明' }).success,
    ).toBe(false);
    expect(
      JoinOptionsSchema.safeParse({ protocol: 1, playerToken: 'a'.repeat(24), name: '<script>' })
        .success,
    ).toBe(false);
    expect(
      JoinOptionsSchema.safeParse({ protocol: 1, playerToken: 'a'.repeat(24), name: '   ' })
        .success,
    ).toBe(false);
  });

  it('hidden cells cannot carry identity', () => {
    expect(CellViewSchema.safeParse({ id: 'p1', faceUp: false }).success).toBe(true);
    expect(
      CellViewSchema.safeParse({ id: 'p1', faceUp: false, side: 'red', kind: 'king' }).success,
    ).toBe(false);
  });
});
