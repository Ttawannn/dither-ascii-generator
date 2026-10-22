import { describe, expect, it } from 'vitest';
import { cleanLocks, protectLook } from './locks';
import { randomLook, rng } from './random-look';
import { resolvePreset } from './presets';
import { DEFAULTS } from './state';

describe('shuffle locks', () => {
  it('keeps locked values while allowing other settings to change across many seeds', () => {
    const current = { ...DEFAULTS, brightness: 34, customPalette: '#123456 #abcdef' };
    for (let seed = 1; seed < 100; seed++) {
      const patch = protectLook(current, resolvePreset({ name: 'random', params: randomLook(rng(seed)) }), { keys: ['brightness', 'algorithm'], colors: ['#123456'] });
      const result = { ...current, ...patch };
      expect(result.brightness).toBe(34); expect(result.algorithm).toBe(current.algorithm);
      expect(result.customPalette).toBe(current.customPalette); expect(result.palette).toBe(current.palette);
    }
  });
  it('does not create changes when every target is locked or already equal', () => {
    expect(protectLook(DEFAULTS, { brightness: 50, gamma: DEFAULTS.gamma }, { keys: ['brightness'], colors: [] })).toEqual({});
  });
  it('stale swatch locks do not lock unrelated palettes', () => {
    expect(protectLook(DEFAULTS, { palette: 'pico8' }, { keys: [], colors: ['#123456'] })).toEqual({ palette: 'pico8' });
  });
  it('validates persisted lock state', () => {
    expect(cleanLocks({ keys: ['brightness', 'brightness', 'nope'], colors: ['#AB12EF', 'bad'] })).toEqual({ keys: ['brightness'], colors: ['#ab12ef'] });
  });
});
