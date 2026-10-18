import { describe, expect, it } from 'vitest';
import { nearestIndex, oklabInto, paletteLab } from './oklab';

const lab = (r: number, g: number, b: number) => {
  const out = [0, 0, 0];
  oklabInto(r, g, b, out);
  return out;
};

describe('oklabInto', () => {
  it('maps black and white to the ends of the lightness axis with no chroma', () => {
    expect(lab(0, 0, 0).map((v) => Math.abs(v))).toEqual([0, 0, 0]);
    const [l, a, b] = lab(1, 1, 1);
    expect(l).toBeCloseTo(1, 5);
    expect(a).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it('matches the reference value for sRGB red', () => {
    const [l, a, b] = lab(1, 0, 0);
    expect(l).toBeCloseTo(0.62796, 4);
    expect(a).toBeCloseTo(0.22486, 4);
    expect(b).toBeCloseTo(0.12585, 4);
  });
});

describe('nearestIndex', () => {
  const greys = new Float32Array([0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1]);

  it('uses weighted RGB without a lab palette', () => {
    expect(nearestIndex(greys, null, 0.22, 0.22, 0.22)).toBe(0);
    expect(nearestIndex(greys, null, 0.9, 0.9, 0.9)).toBe(2);
  });

  it('matches by perceived lightness with one: a dark grey goes to mid grey', () => {
    expect(nearestIndex(greys, paletteLab(greys), 0.22, 0.22, 0.22)).toBe(1);
  });

  it('always finds an exact palette colour', () => {
    const pal = new Float32Array([0.1, 0.2, 0.3, 0.9, 0.1, 0.4, 0.2, 0.8, 0.2]);
    const labPal = paletteLab(pal);
    for (let i = 0; i < 3; i++) {
      expect(nearestIndex(pal, labPal, pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2])).toBe(i);
      expect(nearestIndex(pal, null, pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2])).toBe(i);
    }
  });
});
