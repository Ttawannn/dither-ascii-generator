import { describe, expect, it } from 'vitest';
import { DEFAULTS, DITHER_KEYS, layerParams, readLayer, sanitize } from '../state';
import { decodeShare, encodeShare } from '../presets';
import {
  BAND_IMAGE_BYTES, DEFAULT_SHAPE_BANDS, MAX_SHAPE_BANDS, MAX_SHAPE_JSON, SHAPE_SETS, decodeBandImage,
  distributeShapeBands, encodeBandImage, moveShapeBoundary, parseShapeBands, resizeShapeBand,
  reverseShapeBands, shapeBandWidthLimit, shapeSet, splitShapeBand,
} from './shape-bands';

describe('Luma Shapes bands', () => {
  it('splits the default set into the rounded ranges 0–42, 43–84, 85–127, 128–170, 171–212, 213–255', () => {
    expect(shapeSet().map((b) => b.end)).toEqual([42, 84, 127, 170, 212, 255]);
  });

  it('covers all 256 brightness values with each supplied set', () => {
    for (const set of SHAPE_SETS) {
      const bands = shapeSet(set.id);
      expect(parseShapeBands(JSON.stringify(bands))).toEqual(bands);
      expect(bands.at(-1)?.end).toBe(255);
      for (let value = 0; value <= 255; value++) {
        expect(bands.filter((b, i) => value > (bands[i - 1]?.end ?? -1) && value <= b.end)).toHaveLength(1);
      }
    }
  });

  it('rejects malformed, oversized and incomplete sets', () => {
    const first = shapeSet()[0];
    for (const raw of ['', '{}', 'null', '[]', '[null, null]', ' '.repeat(MAX_SHAPE_JSON + 1),
      JSON.stringify([first]), JSON.stringify(shapeSet().slice(0, -1)),
      JSON.stringify(Array(MAX_SHAPE_BANDS + 1).fill(first))]) {
      expect(parseShapeBands(raw), raw.slice(0, 80)).toBeNull();
    }
    for (const patch of [{ end: -1 }, { end: 260 }, { end: 40.5 }, { end: '42' },
      { shape: 'triangle' }, { color: 'red' }, { color: '#fff' }, { size: -1 },
      { size: 101 }, { size: null }]) {
      expect(parseShapeBands(JSON.stringify([{ ...first, ...patch }, ...shapeSet().slice(1)]))).toBeNull();
    }
    const overlap = shapeSet();
    overlap[1].end = overlap[0].end;
    expect(parseShapeBands(JSON.stringify(overlap))).toBeNull();
  });

  it('splits a band without gaps, preserves its appearance and limits the count', () => {
    const before = shapeSet();
    const after = splitShapeBand(before, 1);
    expect(after).toHaveLength(7);
    expect(after[1].end).toBe(63);
    expect(after[2]).toEqual(before[1]);
    expect(parseShapeBands(JSON.stringify(after))).toEqual(after);
    expect(before).toEqual(shapeSet());
    const narrow = [{ ...before[0], end: 0 }, { ...before[1], end: 255 }];
    expect(splitShapeBand(narrow, 0)).toBe(narrow);
    let full = before;
    while (full.length < MAX_SHAPE_BANDS) {
      const widths = full.map((b, i) => b.end - (full[i - 1]?.end ?? -1));
      full = splitShapeBand(full, widths.indexOf(Math.max(...widths)));
    }
    expect(splitShapeBand(full, 1)).toBe(full);
  });

  it('distributes uneven bands and reverses appearances without moving boundaries', () => {
    const bands = splitShapeBand(shapeSet(), 0);
    const distributed = distributeShapeBands(bands);
    const widths = distributed.map((b, i) => b.end - (distributed[i - 1]?.end ?? -1));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(parseShapeBands(JSON.stringify(distributed))).toEqual(distributed);
    const reversed = reverseShapeBands(bands);
    expect(reversed.map((b) => b.end)).toEqual(bands.map((b) => b.end));
    expect(reversed[0].size).toBe(bands.at(-1)?.size);
    expect(reverseShapeBands(reversed)).toEqual(bands);
  });

  it('sanitizes sets for saved state and shares while rejecting invalid values', () => {
    const bands = shapeSet();
    bands[0].color = '#ABCDEF';
    const cleaned = sanitize({ algorithm: 'luma-shapes', shapeBands: JSON.stringify(bands),
      shapeBackground: '#123456', shapeFeather: 200, shapeFeatherPattern: 'scatter' });
    expect(cleaned.shapeBands).toContain('#abcdef');
    expect(cleaned.shapeFeather).toBe(100);
    expect(cleaned.algorithm).toBe('luma-shapes');
    expect(sanitize({ shapeBands: '[]', shapeFeatherPattern: 'noise', shapeBackground: 'red' })).toEqual({});
    expect(sanitize({ shapeBands: DEFAULT_SHAPE_BANDS }).shapeBands).toBe(DEFAULT_SHAPE_BANDS);
    for (const key of ['shapeBands', 'shapeFeather', 'shapeFeatherPattern', 'shapeBackground'] as const) {
      expect(DITHER_KEYS).toContain(key);
    }
    const p = { ...DEFAULTS, layer2: JSON.stringify({ on: true, opacity: 100, blend: 'normal',
      params: { algorithm: 'luma-shapes', shapeBands: JSON.stringify(bands), shapeFeather: 50 } }) };
    const layer = readLayer(p);
    expect(layer).not.toBeNull();
    expect(layerParams(p, layer!).shapeFeather).toBe(50);
    expect(layerParams(p, layer!).shapeBands).toContain('#abcdef');
  });

  it('clamps dragged boundaries and keeps every band at least one level wide', () => {
    const bands = shapeSet();
    expect(moveShapeBoundary(bands, 1, -999)[1].end).toBe(43);
    expect(moveShapeBoundary(bands, 1, 999)[1].end).toBe(126);
    expect(moveShapeBoundary(bands, 1, 90.6)[1].end).toBe(91);
    expect(moveShapeBoundary(bands, 5, 100)).toBe(bands);
    expect(moveShapeBoundary(bands, 0, Number.NaN)).toBe(bands);
    for (let i = 0; i < bands.length - 1; i++) {
      expect(parseShapeBands(JSON.stringify(moveShapeBoundary(bands, i, -100)))).not.toBeNull();
      expect(parseShapeBands(JSON.stringify(moveShapeBoundary(bands, i, 1000)))).not.toBeNull();
    }
    expect(bands).toEqual(shapeSet());
  });

  it('resizes the final band by moving its left edge while preserving 255', () => {
    const bands = shapeSet();
    expect(shapeBandWidthLimit(bands, 0)).toBe(84);
    expect(shapeBandWidthLimit(bands, 5)).toBe(84);
    expect(resizeShapeBand(bands, 0, 20)[0].end).toBe(19);
    const final = resizeShapeBand(bands, 5, 70);
    expect(final[4].end).toBe(185);
    expect(final[5].end).toBe(255);
    expect(parseShapeBands(JSON.stringify(final))).not.toBeNull();
    expect(resizeShapeBand(bands, 5, 999)[4].end).toBe(171);
    expect(resizeShapeBand(bands, 5, -2)[4].end).toBe(254);
  });

  it('preserves embedded RGBA tiles through import, split, reverse, layers and large share links', () => {
    const pixels = new Uint8ClampedArray(BAND_IMAGE_BYTES);
    for (let i = 0; i < pixels.length; i++) pixels[i] = i % 256;
    const image = encodeBandImage(pixels);
    expect(decodeBandImage(image)).toEqual(new Uint8Array(pixels));
    const bands = distributeShapeBands(Array.from({ length: 12 }, (_, i) => ({
      ...shapeSet()[i % 6], shape: 'image' as const, image, imageName: 'tile.png',
    })));
    const raw = JSON.stringify(bands);
    expect(raw.length).toBeGreaterThan(250000);
    expect(parseShapeBands(raw)).toEqual(bands);
    const params = { ...DEFAULTS, algorithm: 'luma-shapes', shapeBands: raw };
    expect(decodeShare(`#s=${encodeShare(params)}`)?.shapeBands).toBe(raw);
    expect(reverseShapeBands(bands)[0].image).toBe(image);
    const split = splitShapeBand(bands.slice(0, 6).map((b, i) => ({ ...b, end: shapeSet()[i].end })), 1);
    expect(split[1].image).toBe(image);
    expect(split[2].image).toBe(image);
    const layer = readLayer({ ...DEFAULTS, layer2: JSON.stringify({ on: true, params: { shapeBands: raw } }) });
    expect(layerParams(DEFAULTS, layer!).shapeBands).toBe(raw);
  });

  it('rejects image payloads with the wrong size, format or metadata', () => {
    const original = shapeSet();
    const image = encodeBandImage(new Uint8ClampedArray(BAND_IMAGE_BYTES));
    for (const patch of [{ shape: 'image' }, { image: 'data:image/png;base64,xyz' },
      { image: image.slice(1) }, { image: image.replace('A', '_') }, { image: 123 },
      { image, imageName: 'x'.repeat(81) }, { imageName: 1 }]) {
      expect(parseShapeBands(JSON.stringify([{ ...original[0], ...patch }, ...original.slice(1)]))).toBeNull();
    }
  });
});
