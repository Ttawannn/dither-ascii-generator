import { describe, expect, it } from 'vitest';
import { shapeGlyph, SHAPE_SAMPLES } from './shape';
import { buildGrid, type GridOptions } from './grid';
const masks = new Float32Array(4 * SHAPE_SAMPLES);
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 4; x++) {
    masks[SHAPE_SAMPLES + y * 4 + x] = x === 1 ? 1 : 0;
    masks[2 * SHAPE_SAMPLES + y * 4 + x] = y === 3 ? 1 : 0;
    masks[3 * SHAPE_SAMPLES + y * 4 + x] = 1;
  }
describe('shape matching', () => {
  it('distinguishes horizontal and vertical strokes without forced edge glyphs', () => {
    for (const id of [1, 2])
      expect(shapeGlyph(masks.slice(id * 32, (id + 1) * 32), masks, [0, 1, 2, 3], 0, 1)).toBe(id);
  });
  it('keeps density mapping for flat cells or when the amount is zero', () => {
    expect(shapeGlyph(new Float32Array(32).fill(0.5), masks, [0, 1, 2, 3], 2, 1)).toBe(2);
    expect(shapeGlyph(masks.slice(32, 64), masks, [0, 1, 2, 3], 2, 0)).toBe(2);
  });
  it('keeps the density glyph in a smooth gradient, but follows a strong stroke', () => {
    // A faint top-to-bottom ramp (±3%) looks like a horizontal stroke once normalised.
    const ramp = Float32Array.from({ length: 32 }, (_, i) => 0.5 + (Math.floor(i / 4) - 3.5) * 0.008);
    expect(shapeGlyph(ramp, masks, [0, 1, 2, 3], 3, 1)).toBe(3);
    expect(shapeGlyph(masks.slice(64, 96), masks, [0, 1, 2, 3], 3, 1)).toBe(2);
  });

  it('uses bottom-up sub-cell pixels for glyphs but top-down cells for exports', () => {
    const data = new Uint8Array(4 * 16 * 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 4; x++) {
        const v = (y < 8 ? x === 1 : y % 8 === 3) ? 255 : 0;
        data.set([v, v, v, 255], ((15 - y) * 4 + x) * 4);
      }
    const opts: GridOptions = {
      levels: [0, 1, 2, 3],
      edgeBase: 4,
      offset: 0,
      palette: null,
      edges: false,
      edgeThreshold: 0.5,
      dither: false,
      lightOnDark: true,
      seed: 0,
      shape: { amount: 1, masks },
    };
    const grid = buildGrid(data, 1, 2, opts);
    expect([...grid.glyphIds]).toEqual([1, 2]);
    expect(grid.cells[0]).toBeCloseTo(64, 0);
  });
});
