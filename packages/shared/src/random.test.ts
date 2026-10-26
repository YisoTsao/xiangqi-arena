import { describe, expect, it } from 'vitest';
import { generateRoomCode, isRoomCode, seededRandom, shuffle } from './random';

describe('random utilities', () => {
  it('seededRandom is reproducible', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 10 }, () => a(1000));
    const ys = Array.from({ length: 10 }, () => b(1000));
    expect(xs).toEqual(ys);
    expect(xs.every((x) => x >= 0 && x < 1000)).toBe(true);
  });

  it('shuffle keeps all items and does not mutate input', () => {
    const input = Array.from({ length: 32 }, (_, i) => i);
    const out = shuffle(input, seededRandom(7));
    expect(out).not.toBe(input);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(input[0]).toBe(0);
  });

  it('room codes are valid', () => {
    const rnd = seededRandom(1);
    for (let i = 0; i < 100; i++) expect(isRoomCode(generateRoomCode(rnd))).toBe(true);
    expect(isRoomCode('ABC10O')).toBe(false);
    expect(isRoomCode('abc')).toBe(false);
  });
});
