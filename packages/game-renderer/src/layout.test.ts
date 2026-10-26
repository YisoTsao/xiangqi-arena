import { describe, expect, it } from 'vitest';
import { squareToWorld, worldToSquare } from './layout';

describe('board layout mapping', () => {
  it('round-trips every square in both orientations', () => {
    for (const layout of ['xiangqi', 'banqi'] as const) {
      const total = layout === 'xiangqi' ? 90 : 32;
      for (const flipped of [false, true]) {
        for (let s = 0; s < total; s++) {
          const [x, z] = squareToWorld(layout, s, flipped);
          expect(worldToSquare(layout, x + 0.1, z - 0.1, flipped)).toBe(s);
        }
      }
    }
  });

  it('red back rank is nearest to the camera unless flipped', () => {
    const [, zRed] = squareToWorld('xiangqi', 4, false);
    const [, zBlack] = squareToWorld('xiangqi', 85, false);
    expect(zRed).toBeGreaterThan(zBlack);
    expect(squareToWorld('xiangqi', 4, true)[1]).toBeLessThan(0);
  });

  it('ignores clicks far from any point', () => {
    expect(worldToSquare('xiangqi', 0.5, 0, false)).toBeNull();
    expect(worldToSquare('xiangqi', 50, 0, false)).toBeNull();
  });
});
