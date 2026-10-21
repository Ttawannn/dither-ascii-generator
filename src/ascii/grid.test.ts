import { describe, expect, it } from 'vitest';
import { ansi256, buildGrid, gridToAnsi, gridToHtml, gridToText, type AsciiGrid, type GridOptions } from './grid';

/** RGBA image (row order does not matter for these patterns) from a per-pixel grey function. */
function image(w: number, h: number, value: (x: number, y: number) => number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = value(x, y);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return data;
}

const opts: GridOptions = {
  levels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  edgeBase: 10,
  offset: 0,
  palette: null,
  edges: false,
  edgeThreshold: 0.5,
  dither: false,
  lightOnDark: true,
  seed: 0,
};
const ramp = [...' .:-=+*#%@', '-', '/', '|', '\\'];

describe('buildGrid', () => {
  const cols = 10;
  const gradient = image(cols, 1, (x) => Math.round((x / (cols - 1)) * 255));

  it('maps brightness to denser glyphs when glyphs are light on dark', () => {
    expect([...buildGrid(gradient, cols, 1, opts).glyphIds]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('inverts the mapping for dark glyphs on a light background', () => {
    expect([...buildGrid(gradient, cols, 1, { ...opts, lightOnDark: false }).glyphIds]).toEqual([
      9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    ]);
  });

  it('packs the glyph id into alpha and keeps the cell colour', () => {
    const grid = buildGrid(image(1, 1, () => 200), 1, 1, opts);
    expect([...grid.cells]).toEqual([200, 200, 200, grid.glyphIds[0]]);
  });

  it('places a vertical edge glyph on a hard left/right boundary', () => {
    const w = 8;
    const h = 6;
    const half = image(w, h, (x) => (x < w / 2 ? 0 : 255));
    const grid = buildGrid(half, w, h, { ...opts, edges: true, edgeThreshold: 0.2 });
    const edgeCol = [...Array(h).keys()].map((row) => ramp[grid.glyphIds[row * w + w / 2]]);
    expect(edgeCol.every((g) => g === '|')).toBe(true);
  });

  it('uses only the chosen levels, mapping to their atlas ids', () => {
    const ids = [...buildGrid(gradient, cols, 1, { ...opts, levels: [2, 5, 9] }).glyphIds];
    expect(new Set(ids)).toEqual(new Set([2, 5, 9]));
    expect(ids[0]).toBe(2);
    expect(ids[cols - 1]).toBe(9);
  });

  it('shifts levels by the offset and wraps around', () => {
    const shifted = [...buildGrid(gradient, cols, 1, { ...opts, offset: 0.2 }).glyphIds];
    expect(shifted).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 0, 1]);
    const back = [...buildGrid(gradient, cols, 1, { ...opts, offset: -0.1 }).glyphIds];
    expect(back[0]).toBe(9);
  });

  it('snaps cell colours to the palette', () => {
    const palette = new Float32Array([1, 0, 0, 0, 0, 1]); // red, blue
    const reddish = image(1, 1, () => 0);
    reddish.set([220, 40, 60, 255]);
    const grid = buildGrid(reddish, 1, 1, { ...opts, palette });
    expect([...grid.cells.slice(0, 3)]).toEqual([255, 0, 0]);
  });

  it('turns all eight braille dots on for white and off for black', () => {
    const braille = { ...opts, levels: null };
    expect(buildGrid(image(2, 4, () => 255), 1, 1, braille).glyphIds[0]).toBe(0xff);
    expect(buildGrid(image(2, 4, () => 0), 1, 1, braille).glyphIds[0]).toBe(0);
  });
});

describe('text export', () => {
  const grid = buildGrid(image(3, 1, (x) => [255, 0, 0][x]), 3, 1, opts);

  it('trims trailing spaces from each line', () => {
    expect(gridToText(grid, ramp)).toBe('@');
  });

  it('escapes HTML in glyphs', () => {
    const lt = ['<', ...ramp.slice(1)];
    const html = gridToHtml(buildGrid(image(1, 1, () => 0), 1, 1, opts), lt, {
      title: 'a<b',
      fontCss: '12px monospace',
      lineHeight: 1,
      mode: 'mono',
      fg: '#ffffff',
      bg: '#000000',
    });
    expect(html).toContain('<pre>&lt;</pre>');
    expect(html).toContain('<title>a&lt;b</title>');
  });
});

describe('ANSI export', () => {
  // 2×2 cells: red, green / blue, white, glyphs a b / c d
  const grid: AsciiGrid = {
    cols: 2,
    rows: 2,
    cells: Uint8Array.from([255, 0, 0, 0, 0, 255, 0, 1, 0, 0, 255, 2, 255, 255, 255, 3]),
    glyphIds: Uint16Array.from([0, 1, 2, 3]),
  };
  const glyphs = ['a', 'b', 'c', 'd'];
  const base = { fg: '#e8e8e8', bg: '#000000', transparent: false };
  const ESC = '\x1b';

  it('colours each character in truecolor, one code per change, reset per line', () => {
    const out = gridToAnsi(grid, glyphs, { ...base, mode: 'color', depth: 'truecolor' });
    expect(out.split('\n')).toEqual([
      `${ESC}[48;2;0;0;0m${ESC}[38;2;255;0;0ma${ESC}[38;2;0;255;0mb${ESC}[0m`,
      `${ESC}[48;2;0;0;0m${ESC}[38;2;0;0;255mc${ESC}[38;2;255;255;255md${ESC}[0m`,
    ]);
  });

  it('uses the cell colour as background for "colour background"', () => {
    const out = gridToAnsi(grid, glyphs, { ...base, mode: 'colorBg', depth: 'truecolor' });
    expect(out.startsWith(`${ESC}[38;2;232;232;232m${ESC}[48;2;255;0;0ma`)).toBe(true);
  });

  it('writes fixed colours once per line in mono mode, and no background when transparent', () => {
    const out = gridToAnsi(grid, glyphs, { ...base, mode: 'mono', transparent: true, depth: 'truecolor' });
    expect(out).toBe(`${ESC}[38;2;232;232;232mab${ESC}[0m\n${ESC}[38;2;232;232;232mcd${ESC}[0m`);
  });

  it('maps to the 256-colour palette', () => {
    expect(ansi256(255, 0, 0)).toBe(196);
    expect(ansi256(0, 0, 0)).toBe(16);
    expect(ansi256(255, 255, 255)).toBe(231);
    expect(ansi256(128, 128, 128)).toBe(244); // grey ramp beats the cube's 102
    const out = gridToAnsi(grid, glyphs, { ...base, mode: 'color', depth: '256' });
    expect(out).toContain(`${ESC}[38;5;196ma`);
    expect(out).toContain(`${ESC}[48;5;16m`);
  });
});
