import { describe, expect, it } from 'vitest';
import { baseSpread, hexToRgb, PALETTES, resolvePalette, rgbToHex } from './palettes';

const opts = { levels: 2, ink: '#000000', paper: '#ffffff', extracted: null };

describe('colour conversion', () => {
  it('round-trips hex', () => {
    for (const hex of ['#000000', '#ffffff', '#33ff66', '#0b2a6b']) expect(rgbToHex(hexToRgb(hex))).toBe(hex);
  });
});

describe('resolvePalette', () => {
  it('builds an evenly spaced ink → paper ramp for mono', () => {
    const p = resolvePalette('mono', { ...opts, levels: 3 });
    expect(p.kind).toBe('ramp');
    expect(p.colors).toEqual([
      [0, 0, 0],
      [0.5, 0.5, 0.5],
      [1, 1, 1],
    ]);
  });

  it('caps RGB levels at 8 per channel', () => {
    const p = resolvePalette('rgb', { ...opts, levels: 16 });
    expect(p.kind).toBe('rgb');
    expect(p.levels).toBe(8);
    expect(p.colors).toHaveLength(8 ** 3);
  });

  it('falls back to mono when "From image" has no extracted colours yet', () => {
    expect(resolvePalette('image', opts).kind).toBe('ramp');
    const extracted: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    expect(resolvePalette('image', { ...opts, extracted }).colors).toEqual(extracted);
  });

  it('resolves every listed palette to at least two colours', () => {
    for (const def of PALETTES) expect(resolvePalette(def.id, opts).colors.length, def.id).toBeGreaterThanOrEqual(2);
  });
});

describe('baseSpread', () => {
  it('is the step between neighbouring levels', () => {
    expect(baseSpread(resolvePalette('mono', opts))).toBe(1);
    expect(baseSpread(resolvePalette('mono', { ...opts, levels: 5 }))).toBe(0.25);
    expect(baseSpread(resolvePalette('rgb', { ...opts, levels: 3 }))).toBe(0.5);
  });
});
