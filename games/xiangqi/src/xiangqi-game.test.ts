import { describe, expect, it } from 'vitest';
import { CellViewSchema, XiangqiActionSchema, parseXiangqiMode } from './schema';

describe('xiangqi game schemas', () => {
  it('validates actions', () => {
    expect(XiangqiActionSchema.safeParse({ kind: 'move', from: 1, to: 19 }).success).toBe(true);
    expect(XiangqiActionSchema.safeParse({ kind: 'flip', square: 3 }).success).toBe(true);
    for (const bad of [
      { kind: 'move', from: 0, to: 999 },
      { kind: 'teleport', to: 1 },
      { kind: 'move', from: 0, to: 1, seat: 1 },
    ]) {
      expect(XiangqiActionSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('hidden cells cannot carry identity', () => {
    expect(CellViewSchema.safeParse({ id: 'p1', faceUp: false }).success).toBe(true);
    expect(
      CellViewSchema.safeParse({ id: 'p1', faceUp: false, side: 'red', kind: 'king' }).success,
    ).toBe(false);
  });

  it('maps the legacy mode name', () => {
    expect(parseXiangqiMode('xiangqi')).toBe('classic');
    expect(parseXiangqiMode('banqi')).toBe('banqi');
    expect(parseXiangqiMode('chess')).toBeNull();
  });
});
