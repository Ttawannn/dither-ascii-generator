import { describe, expect, it } from 'vitest';
import { sanitize } from '../state';
import { getPaletteDef, resolvePalette } from './palettes';
import { PALETTE_CATEGORIES, PALETTE_SETS, rampThrough } from './palette-sets';

const luma = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

describe('built-in palettes', () => {
  it('have unique ids and names, 2–32 valid colours and a known category', () => {
    const ids = PALETTE_SETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PALETTE_SETS.map((p) => p.name)).size).toBe(ids.length);
    const categories = PALETTE_CATEGORIES.map((c) => c.id);
    for (const p of PALETTE_SETS) {
      expect(categories, p.id).toContain(p.category);
      expect(p.colors.length, p.id).toBeGreaterThanOrEqual(2);
      expect(p.colors.length, p.id).toBeLessThanOrEqual(32);
      for (const c of p.colors) expect(c, p.id).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(PALETTE_SETS.length).toBeGreaterThanOrEqual(70);
  });

  it('ramps run dark to light, with no repeated colour', () => {
    for (const p of PALETTE_SETS.filter((x) => x.ramp)) {
      const l = p.colors.map(luma);
      for (let i = 1; i < l.length; i++) expect(l[i], `${p.id} step ${i}`).toBeGreaterThan(l[i - 1]);
    }
  });

  it('spread anchors evenly: the ends are the anchors, steps in between', () => {
    expect(rampThrough(2, '#000000', '#ffffff')).toEqual(['#000000', '#ffffff']);
    const grey = rampThrough(5, '#000000', '#ffffff');
    expect(grey[0]).toBe('#000000');
    expect(grey[4]).toBe('#ffffff');
    expect(new Set(grey).size).toBe(5);
  });

  it('resolve as set:<id>, by brightness for ramps and nearest colour otherwise', () => {
    const opts = { levels: 4, ink: '#000000', paper: '#ffffff', extracted: null };
    const ramp = PALETTE_SETS.find((p) => p.ramp)!;
    const set = PALETTE_SETS.find((p) => !p.ramp)!;
    expect(resolvePalette(`set:${ramp.id}`, opts)).toMatchObject({ kind: 'ramp', levels: ramp.colors.length });
    expect(resolvePalette(`set:${set.id}`, opts)).toMatchObject({ kind: 'set', levels: set.colors.length });
    expect(getPaletteDef(`set:${set.id}`)).toMatchObject({ label: set.name, uses: { nearest: true } });
  });

  it('are accepted by sanitize, and unknown set ids are dropped', () => {
    expect(sanitize({ palette: `set:${PALETTE_SETS[0].id}` }).palette).toBe(`set:${PALETTE_SETS[0].id}`);
    expect(sanitize({ palette: 'set:nope' }).palette).toBeUndefined();
    expect(sanitize({ asciiPalette: 'set:ega' }).asciiPalette).toBe('set:ega');
    expect(sanitize({ palette: 'gameboy' }).palette).toBe('gameboy');
  });
});
