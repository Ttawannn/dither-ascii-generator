import { describe, expect, it } from 'vitest';
import { parsePaletteFile } from './palette-file';

describe('parsePaletteFile', () => {
  it('reads JSON with an r/g/b colour list and a name', () => {
    const text = JSON.stringify({
      category: 'Medieval',
      name: 'Raven',
      color_count: 3,
      colors: [
        { r: 12, g: 12, b: 16, percentage: 33.3 },
        { r: 46, g: 44, b: 72, percentage: 33.3 },
        { r: 140, g: 138, b: 160, percentage: 33.3 },
      ],
    });
    expect(parsePaletteFile(text)).toEqual({ name: 'Raven', colors: ['#0c0c10', '#2e2c48', '#8c8aa0'], dropped: 0 });
  });

  it('finds a hex list nested anywhere in JSON', () => {
    const text = JSON.stringify({ look: { name: 'x', colorPalette: { colorDepth: 2, customColors: ['#000000', '#0055FF'] } } });
    expect(parsePaletteFile(text)?.colors).toEqual(['#000000', '#0055ff']);
    expect(parsePaletteFile('["#fff", "#000"]')?.colors).toEqual(['#ffffff', '#000000']);
  });

  it('skips arrays that are not all colours', () => {
    const text = JSON.stringify({ order: ['a', 'b'], palette: ['#111111', '#222222'] });
    expect(parsePaletteFile(text)?.colors).toEqual(['#111111', '#222222']);
  });

  it('reads .hex files (one bare colour per line)', () => {
    expect(parsePaletteFile('1a1c2c\r\n5d275d\nb13e53\n')?.colors).toEqual(['#1a1c2c', '#5d275d', '#b13e53']);
  });

  it('reads GIMP palettes', () => {
    const text = 'GIMP Palette\nName: Dusk\nColumns: 4\n#\n  0   0   0\tBlack\n255 128   0\tOrange\n';
    expect(parsePaletteFile(text)).toEqual({ name: 'Dusk', colors: ['#000000', '#ff8000'], dropped: 0 });
  });

  it('falls back to hex codes found in any text', () => {
    expect(parsePaletteFile('bg: #000; fg: #33FF66')?.colors).toEqual(['#000000', '#33ff66']);
  });

  it('caps the list at 32 colours and reports the rest', () => {
    const many = Array.from({ length: 40 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`);
    const result = parsePaletteFile(JSON.stringify(many));
    expect(result?.colors).toHaveLength(32);
    expect(result?.dropped).toBe(8);
  });

  it('returns null without at least two colours', () => {
    expect(parsePaletteFile('{"colors": ["#fff"]}')).toBeNull();
    expect(parsePaletteFile('hello')).toBeNull();
    expect(parsePaletteFile('{broken')).toBeNull();
  });
});
