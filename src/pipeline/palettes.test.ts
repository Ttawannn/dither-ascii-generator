import { describe, expect, it } from 'vitest';
import { baseSpread, hexToRgb, normalizeHex, PALETTES, parseColorList, resolvePalette, rgbToHex } from './palettes';

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

  it('uses the custom list as a nearest-colour set, or a dark → light ramp', () => {
    const custom = '#ffffff #ff0000 #000000';
    const set = resolvePalette('custom', { ...opts, custom });
    expect(set.kind).toBe('set');
    expect(set.colors.map(rgbToHex)).toEqual(['#ffffff', '#ff0000', '#000000']);
    const ramp = resolvePalette('custom', { ...opts, custom, customRamp: true });
    expect(ramp.kind).toBe('ramp');
    expect(ramp.colors.map(rgbToHex)).toEqual(['#000000', '#ff0000', '#ffffff']);
  });

  it('falls back to mono when the custom list has fewer than two colours', () => {
    expect(resolvePalette('custom', { ...opts, custom: '#ff0000' }).kind).toBe('ramp');
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

describe('colour lists', () => {
  it('normalizes hex codes', () => {
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef');
    expect(normalizeHex('abcdef')).toBe('#abcdef');
    expect(normalizeHex('#f0a')).toBe('#ff00aa');
    expect(normalizeHex('f0a')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });

  it('finds every hex code in a string, in order', () => {
    expect(parseColorList('#000, #FFFFFF;#12345 #abc')).toEqual(['#000000', '#ffffff', '#aabbcc']);
  });
});
