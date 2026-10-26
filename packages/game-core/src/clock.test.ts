import { describe, expect, it } from 'vitest';
import { createClock, flaggedSeat, pressClock, remainingAt, startClock, stopClock } from './clock';

describe('chess clock', () => {
  const tc = { initialMs: 60_000, incrementMs: 2_000 };

  it('counts down only the running seat', () => {
    let c = startClock(createClock(tc), 0, 1_000);
    expect(remainingAt(c, 0, 11_000)).toBe(50_000);
    expect(remainingAt(c, 1, 11_000)).toBe(60_000);
    c = pressClock(c, 0, 1, 11_000, tc.incrementMs);
    expect(c.remainingMs).toEqual([52_000, 60_000]);
    expect(c.running).toBe(1);
    expect(remainingAt(c, 1, 21_000)).toBe(50_000);
  });

  it('detects flag fall', () => {
    const c = startClock(createClock(tc), 1, 0);
    expect(flaggedSeat(c, 59_999)).toBeNull();
    expect(flaggedSeat(c, 60_000)).toBe(1);
  });

  it('stop freezes remaining time', () => {
    const c = stopClock(startClock(createClock(tc), 0, 0), 5_000);
    expect(c.running).toBeNull();
    expect(remainingAt(c, 0, 99_999)).toBe(55_000);
    expect(flaggedSeat(c, 999_999)).toBeNull();
  });
});
