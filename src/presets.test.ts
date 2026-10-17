import { describe, expect, it } from 'vitest';
import { BUILT_IN, decodeShare, encodeShare, PRESET_KEYS, resolvePreset } from './presets';
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
