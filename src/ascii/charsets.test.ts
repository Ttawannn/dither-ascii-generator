import { describe, expect, it } from 'vitest';
import { CHARSET_GROUPS, CHARSETS, MAX_INJECT, MAX_RAMP, pickLevels, rampFor } from './charsets';
import { lfo, modulatedDepth, modulatedOffset } from './lfo';

describe('character library', () => {
  it('has 48 sets in 11 categories, each set in a known category', () => {
    expect(CHARSETS).toHaveLength(48);
    expect(CHARSET_GROUPS).toHaveLength(11);
    const groups = new Set(CHARSET_GROUPS.map((g) => g.id));
    for (const c of CHARSETS) expect(groups.has(c.group), c.id).toBe(true);
    for (const g of groups) expect(CHARSETS.some((c) => c.group === g), g).toBe(true);
  });

  it('has unique ids and keeps the ids saved presets rely on', () => {
    const ids = CHARSETS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['standard', 'detailed', 'blocks', 'braille', 'binary', 'custom']) expect(ids).toContain(id);
  });

  it('fits every set in the 8-bit glyph id space', () => {
    for (const c of CHARSETS) expect([...c.chars].length, c.id).toBeLessThanOrEqual(MAX_RAMP);
  });
});

describe('rampFor', () => {
  it('returns null for braille', () => {
    expect(rampFor('braille', '')).toBeNull();
  });

  it('adds a space, or removes it when told not to, and dedupes', () => {
    expect(rampFor('binary', '')).toEqual([' ', '1', '0']);
    expect(rampFor('binary', '', '', false)).toEqual(['1', '0']);
    expect(rampFor('standard', '', '', false)![0]).toBe('.');
    expect(rampFor('custom', 'aab', '', false)).toEqual(['a', 'b']);
  });

  it(`injects at most ${MAX_INJECT} extra characters`, () => {
    const ramp = rampFor('minimal', '', 'XYZXYZ0123456789', false)!;
    expect(ramp).toEqual(['.', ':', '#', 'X', 'Y', 'Z', '0', '1', '2', '3']);
  });

  it('handles characters outside the BMP as single glyphs', () => {
    expect(rampFor('custom', '𝔄𝔅', '', false)).toEqual(['𝔄', '𝔅']);
  });

  it('never returns fewer than two glyphs', () => {
    expect(rampFor('custom', '', '', false)).toEqual([' ', '#']);
    expect(rampFor('custom', 'x', '', false)).toEqual([' ', 'x']);
  });
});

describe('pickLevels', () => {
  it('uses every glyph when depth covers the ramp', () => {
    expect(pickLevels(5, 64)).toEqual([0, 1, 2, 3, 4]);
  });

  it('spreads fewer levels evenly from sparsest to densest', () => {
    expect(pickLevels(10, 4)).toEqual([0, 3, 6, 9]);
    expect(pickLevels(70, 2)).toEqual([0, 69]);
  });

  it('never goes below two levels', () => {
    expect(pickLevels(10, 1)).toEqual([0, 9]);
  });
});

describe('LFO', () => {
  it('produces the expected shapes', () => {
    expect(lfo('sine', 0.25, 1)).toBeCloseTo(1);
    expect(lfo('triangle', 0, 1)).toBe(-1);
    expect(lfo('triangle', 0.5, 1)).toBe(1);
    expect(lfo('saw', 0.75, 1)).toBeCloseTo(0.5);
    expect(lfo('off', 0.3, 1)).toBe(0);
  });

  it('modulates offset around the base value', () => {
    expect(modulatedOffset(0.1, 'off', 1, 1, 1)).toBe(0.1);
    expect(modulatedOffset(0, 'sine', 0.25, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('swings depth between the base and two levels', () => {
    expect(modulatedDepth(16, 'off', 0, 1, 1)).toBe(16);
    expect(modulatedDepth(16, 'triangle', 0, 1, 1)).toBe(16); // LFO at -1
    expect(modulatedDepth(16, 'triangle', 0.5, 1, 1)).toBe(2); // LFO at +1
    expect(modulatedDepth(16, 'triangle', 0.5, 1, 0.5)).toBe(9);
  });
});
