import { describe, expect, it } from 'vitest';
import { randomLook, rng } from './random-look';
import { sanitize } from './state';

const looks = Array.from({ length: 300 }, (_, seed) => randomLook(rng(seed)));

describe('randomLook', () => {
  it('gives the same look for the same seed', () => {
    expect(randomLook(rng(42))).toEqual(randomLook(rng(42)));
    expect(randomLook(rng(42))).not.toEqual(randomLook(rng(43)));
  });

  it('only uses valid values, inside the slider ranges', () => {
    for (const look of looks) expect(sanitize(look)).toEqual(look);
  });

  it('keeps tone moderate and uses at most two effects', () => {
    for (const look of looks) {
      expect(Math.abs(look.brightness!)).toBeLessThanOrEqual(8);
      expect(look.contrast!).toBeLessThanOrEqual(30);
      const effects = Object.keys(look).filter((k) => /^fx[A-Z][a-z]+$/.test(k) && look[k as keyof typeof look] === true);
      expect(effects.length).toBeLessThanOrEqual(2);
    }
  });

  it('covers both modes and many algorithms', () => {
    expect(new Set(looks.map((l) => l.mode))).toEqual(new Set(['dither', 'ascii']));
    expect(new Set(looks.map((l) => l.algorithm).filter(Boolean)).size).toBeGreaterThan(12);
  });
});

describe('rng', () => {
  it('stays in [0, 1)', () => {
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
