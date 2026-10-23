import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../state';
import { ALGORITHMS, bayer, lookUniform } from './algorithms';

describe('bayer', () => {
  it('gives every rank once per tile, for 2×2 up to 16×16', () => {
    for (const n of [1, 2, 3, 4]) {
      const size = 1 << n;
      const values = new Set<number>();
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) values.add(bayer(x, y, n));
      expect(values.size).toBe(size * size);
      expect(Math.min(...values)).toBeCloseTo(0.5 / (size * size));
      expect(Math.max(...values)).toBeCloseTo(1 - 0.5 / (size * size));
    }
  });

  it('builds each size from the one below (M₂ₙ = 4·Mₙ + [0 2; 3 1])', () => {
    const rank = (x: number, y: number, n: number) => bayer(x, y, n) * (1 << (2 * n)) - 0.5;
    expect([rank(0, 0, 1), rank(1, 0, 1), rank(0, 1, 1), rank(1, 1, 1)]).toEqual([0, 2, 3, 1]);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        expect(rank(x, y, 4)).toBe(4 * rank(x & 7, y & 7, 3) + rank(x >> 3, y >> 3, 1));
      }
    }
  });
});

describe('lookUniform', () => {
  it('packs the contour, moiré and radial settings', () => {
    expect(lookUniform({ ...DEFAULTS, algorithm: 'contour', contourLevels: 10, modulationWidth: 40, modulationPhase: 25 }, 100, 50))
      .toEqual([10, 0, 0.25, 0]);
    const moire = lookUniform({ ...DEFAULTS, algorithm: 'moire', moireRatio: 120, moireAngle: 90 }, 100, 50);
    expect(moire[0]).toBe(1.2);
    expect(moire[1]).toBeCloseTo(Math.PI / 2);
    // The centre is in output pixels with y up, so 25% from the top is 75% from the bottom.
    expect(lookUniform({ ...DEFAULTS, algorithm: 'radial', radialX: 50, radialY: 25, radialArms: -3 }, 200, 100))
      .toEqual([100, 75, -3, 0]);
    expect(lookUniform({ ...DEFAULTS, algorithm: 'bayer4' }, 10, 10)).toEqual([0, 0, 0, 0]);
  });

  it('gives each shader look its own index', () => {
    const indices = ALGORITHMS.filter((a) => a.shader !== undefined).map((a) => a.shader);
    expect(new Set(indices).size).toBe(indices.length);
  });
});
