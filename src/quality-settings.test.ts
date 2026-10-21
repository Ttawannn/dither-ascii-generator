import { describe, expect, it } from 'vitest';
import { DEFAULTS, layerParams, readLayer, sanitize, animatableSpec } from './state';
import { importPreset } from './preset-import';
import { PRESET_KEYS } from './presets';
import { monoHalftoneSvg, cmykHalftoneSvg } from './export/halftone-svg';
import { dotThreshold } from './pipeline/halftone-shape';
describe('phase 22–23 settings', () => {
  it('validates enums, clamps ranges and keeps new settings in presets', () => {
    const p = sanitize({
      paletteMixing: 'pattern',
      linearLight: true,
      halftoneShape: 'diamond',
      asciiShape: 300,
      stippleCount: 1e9,
      stippleSeed: -1,
      fxSort: true,
      fxSortLength: 1e9,
      fxSortVertical: true,
    });
    expect(p).toMatchObject({
      paletteMixing: 'pattern',
      linearLight: true,
      halftoneShape: 'diamond',
      asciiShape: 100,
      stippleCount: 30000,
      stippleSeed: 1,
      fxSortLength: 512,
    });
    for (const key of Object.keys(p)) expect(PRESET_KEYS).toContain(key);
    expect(sanitize({ paletteMixing: 'bad', halftoneShape: 'bad', linearLight: 'yes', asciiShape: NaN })).toEqual({});
  });
  it('round trips a second layer with its own quality settings', () => {
    const p = {
      ...DEFAULTS,
      layer2: JSON.stringify({
        on: true,
        blend: 'multiply',
        opacity: 60,
        params: { algorithm: 'ostromoukhov', linearLight: true, asciiShape: 70, halftoneShape: 'square' },
      }),
    };
    const layer = readLayer({ ...p, ...sanitize(p) })!;
    expect(layerParams(p, layer)).toMatchObject({
      algorithm: 'ostromoukhov',
      linearLight: true,
      asciiShape: 70,
      halftoneShape: 'square',
    });
  });
  it('animates quality and sort sliders, but keeps explicit stipple generation settings out of lanes', () => {
    expect(animatableSpec('asciiShape')).toBeDefined();
    expect(animatableSpec('fxSortLength')).toBeDefined();
    expect(animatableSpec('stippleCount')).toBeUndefined();
    expect(animatableSpec('stippleSeed')).toBeUndefined();
  });
  it('imports obvious counterparts and new algorithms', () => {
    expect(
      importPreset({
        dither: { style: 'Ostromoukhov', linearLight: true, paletteMixing: 'pattern' },
        halftone: { enabled: true, mode: 'grayscale', shape: 'ellipse' },
      })?.params,
    ).toMatchObject({ algorithm: 'halftone', linearLight: true, paletteMixing: 'pattern', halftoneShape: 'ellipse' });
    expect(importPreset({ dither: { style: 'Dot diffusion', controls: { linearLight: true } } })?.params).toMatchObject(
      { algorithm: 'dot-diffusion', linearLight: true },
    );
    expect(importPreset({ dither: { style: 'Riemersma' } })?.params.algorithm).toBe('riemersma');
  });
});
describe('halftone shapes in vector export', () => {
  const px = {
    width: 24,
    height: 24,
    data: Uint8Array.from({ length: 24 * 24 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 128)),
  };
  it.each([
    ['ellipse', 'ellipse'],
    ['square', 'rect'],
    ['diamond', 'path'],
  ])('exports %s as a vector primitive', (shape, tag) => {
    const svg = monoHalftoneSvg(px, {
      cell: 8,
      angle: 30,
      spread: 1,
      ink: '#000000',
      paper: '#ffffff',
      scale: 1,
      shape,
    });
    expect(svg).toContain(`<${tag} `);
    expect(svg).toContain('rotate(-30)');
    expect(svg).not.toContain('<image');
    expect(cmykHalftoneSvg(px, { cell: 8, angles: [15, 75, 0, 45], dotGain: 0, gcr: 1, scale: 1, shape })).toContain(
      `<${tag} `,
    );
  });
  it('keeps cell centres at zero, corners at one, and repeats each cell', () => {
    for (const shape of ['round', 'ellipse', 'square', 'diamond']) {
      expect(dotThreshold(0, 0, shape)).toBe(0);
      expect(dotThreshold(0.5, 0.5, shape)).toBeCloseTo(1, 6);
      expect(dotThreshold(0.2, 0.3, shape)).toBeCloseTo(dotThreshold(1.2, -0.7, shape), 6);
    }
  });
});
