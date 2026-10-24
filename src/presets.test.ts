import { describe, expect, it } from 'vitest';
import { blendLook, BUILT_IN, decodeShare, encodeShare, PRESET_KEYS, presetCategory, resolvePreset } from './presets';
import { DEFAULTS, sanitize, type Params } from './state';

describe('share links', () => {
  it('round-trips the preset-controlled settings', () => {
    const params: Params = { ...DEFAULTS, mode: 'ascii', asciiCharset: 'braille', asciiFg: '#33ff66', contrast: 25 };
    const decoded = decodeShare(`#s=${encodeShare(params)}`)!;
    for (const key of PRESET_KEYS) expect(decoded[key]).toEqual(params[key]);
  });

  it('only encodes values that differ from the defaults', () => {
    const empty = encodeShare(DEFAULTS);
    expect(JSON.parse(atob(empty.replace(/-/g, '+').replace(/_/g, '/')))).toEqual({});
  });

  it('fills unspecified keys with defaults', () => {
    const decoded = decodeShare(`#s=${encodeShare({ ...DEFAULTS, pixelSize: 5 })}`)!;
    expect(decoded.pixelSize).toBe(5);
    expect(decoded.algorithm).toBe(DEFAULTS.algorithm);
  });

  it('returns null for anything that is not a valid link', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#other')).toBeNull();
    expect(decodeShare('#s=%%%')).toBeNull();
    expect(decodeShare('#s=bm90IGpzb24')).toBeNull(); // "not json"
  });

  it('sanitizes hostile values', () => {
    const evil = btoa(JSON.stringify({ asciiColumns: 1e9, asciiFg: 'red;}', extra: 1 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const decoded = decodeShare(`#s=${evil}`)!;
    expect(decoded.asciiColumns).toBe(300);
    expect(decoded.asciiFg).toBe(DEFAULTS.asciiFg);
    expect(decoded).not.toHaveProperty('extra');
  });
});

describe('built-in presets', () => {
  it('only use valid values', () => {
    for (const preset of BUILT_IN) expect(sanitize(preset.params), preset.name).toEqual(preset.params);
  });

  it('resolve to a complete set of preset keys', () => {
    const resolved = resolvePreset(BUILT_IN[0]);
    expect(Object.keys(resolved).sort()).toEqual([...new Set(PRESET_KEYS)].sort());
  });
});

describe('preset filters and strength', () => {
  it('sorts looks into animated, ASCII and dither', () => {
    const cat = (name: string) => presetCategory(resolvePreset(BUILT_IN.find((p) => p.name === name)!));
    expect(cat('Game Boy')).toBe('dither');
    expect(cat('Terminal')).toBe('ascii');
    expect(cat('Riso boil')).toBe('animated');
    expect(cat('Moving signal')).toBe('animated');
  });

  it('gives the preset exactly at full strength and the default numbers at none', () => {
    const preset = resolvePreset(BUILT_IN.find((p) => p.name === 'PICO-8')!);
    expect(blendLook(preset, 1)).toEqual(preset);
    const none = blendLook(preset, 0);
    expect(none.saturation).toBe(DEFAULTS.saturation);
    expect(none.pixelSize).toBe(DEFAULTS.pixelSize);
    // Names and switches are the preset's at any strength.
    expect(none.algorithm).toBe('floyd-steinberg');
    expect(none.palette).toBe('pico8');
  });

  it('moves numbers part of the way, whole numbers staying whole', () => {
    const preset = { saturation: 130, pixelSize: 3, gamma: 1.6 };
    const half = blendLook(preset, 0.5);
    expect(half.saturation).toBe(115);
    expect(half.pixelSize).toBe(Math.round((DEFAULTS.pixelSize + 3) / 2));
    expect(half.gamma).toBeCloseTo((DEFAULTS.gamma + 1.6) / 2, 3);
  });
});
