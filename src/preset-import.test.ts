import { describe, expect, it } from 'vitest';
import { importPreset, looksLikePreset } from './preset-import';
import { normalizeOrder } from './pipeline/effects';

/** An external preset in the shape these files use, with every effect off unless overridden. */
function external(overrides: { dither?: object; effects?: Record<string, object>; order?: string[]; extra?: object } = {}) {
  return {
    type: 'look',
    preset: {
      name: 'Test look',
      colorPalette: { category: 'Custom', paletteId: 'custom', customColors: ['#000000', '#0055ff'], colorDepth: 2 },
      dither: { style: 'atkinson', scale: 49, luminanceThreshold: 60, controls: {}, ...overrides.dither },
      effectInstances: {
        adjustments: {
          type: 'adjustments',
          label: 'Adjustments',
          settings: { enabled: true, brightness: 107, contrast: 54, saturation: 90, midtones: 34, highlights: 0, blur: 0, denoise: 0, hue: 0 },
        },
        'glow-1': {
          type: 'glow',
          label: 'Glow',
          settings: { enabled: false, threshold: 1, thresholdSmoothing: 25, radius: 200, intensity: 1000, aspectRatio: 124, direction: 0, falloff: 10, quality: 17 },
        },
        ...overrides.effects,
      },
      pipelineOrder: overrides.order ?? ['adjustments'],
      ...overrides.extra,
    },
  };
}

describe('looksLikePreset', () => {
  it('accepts our own presets and external looks, and rejects palette files', () => {
    expect(looksLikePreset({ name: 'x', params: { algorithm: 'bayer4' } })).toBe(true);
    expect(looksLikePreset(external())).toBe(true);
    expect(looksLikePreset({ name: 'Raven', colors: [{ r: 0, g: 0, b: 0 }] })).toBe(false);
    expect(looksLikePreset('nope')).toBe(false);
    expect(importPreset([1, 2])).toBeNull();
  });
});

describe('importPreset', () => {
  it('reads our own format through sanitize', () => {
    const r = importPreset({ name: 'Mine', params: { algorithm: 'bayer8', contrast: 500, bogus: 1 } })!;
    expect(r.name).toBe('Mine');
    expect(r.params).toEqual({ algorithm: 'bayer8', contrast: 100 });
    expect(r.skipped).toEqual([]);
  });

  it('maps the palette, style, scale and threshold', () => {
    const r = importPreset(external())!;
    expect(r.name).toBe('Test look');
    expect(r.params).toMatchObject({
      palette: 'custom',
      customPalette: '#000000 #0055ff',
      customRamp: true,
      algorithm: 'atkinson',
      pixelSize: 2,
      threshold: 60,
    });
  });

  it('maps adjustments around 100 as unchanged and skips the ones with no known scale', () => {
    const r = importPreset(external())!;
    expect(r.params).toMatchObject({ brightness: 7, contrast: -46, saturation: 90 });
    expect(r.skipped).toEqual(expect.arrayContaining(['Adjust “midtones” (scale unknown)', 'Adjust “highlights” (scale unknown)']));
  });

  it('maps style names loosely and reports the approximation', () => {
    const hex = importPreset(external({ dither: { style: 'beehive', controls: { cellSize: 4, lineScale: 13 } } }))!;
    expect(hex.params).toMatchObject({ algorithm: 'honeycomb', cellSize: 4 });
    expect(hex.approximated).toContain('Dither style “beehive” → Honeycomb');
    expect(hex.skipped).toContain('Dither control “lineScale”');

    const orbs = importPreset(
      external({ dither: { style: 'orb-diffuse-y', controls: { orbSize: 10, orbCount: 50, orbIntensity: 20, orbRandom: 50, orbVertical: false } } }),
    )!;
    expect(orbs.params).toMatchObject({ algorithm: 'orbs', orbSize: 10, orbCount: 50, orbIntensity: 20, orbRandom: 50, orbVertical: false });

    const wave = importPreset(
      external({ dither: { style: 'atkinson-line-modulation', controls: { modulationStrength: 3, horizontalBias: 6 } } }),
    )!;
    expect(wave.params).toMatchObject({ algorithm: 'atkinson', waveStrength: 30, waveBias: 60 });

    const unknown = importPreset(external({ dither: { style: 'mystery-style' } }))!;
    expect(unknown.params.algorithm).toBeUndefined();
    expect(unknown.skipped).toContain('Dither style “mystery-style” (kept the default)');
  });

  it('maps effects and their order', () => {
    const r = importPreset(
      external({
        effects: {
          'glow-1': {
            type: 'glow',
            label: 'Glow',
            settings: { enabled: true, threshold: 1, thresholdSmoothing: 25, radius: 200, intensity: 1000, aspectRatio: 124, direction: 0, falloff: 10, quality: 17 },
          },
          'glitch-1': {
            type: 'jpegGlitch',
            label: 'JPEG Glitch',
            settings: { enabled: true, blockShift: { enabled: true, amount: 40 }, channelSwap: { enabled: false, amount: 90 } },
          },
          'chroma-1': { type: 'chromaticEffects', label: 'Chromatic', settings: { enabled: true, maxDisplace: 20, redChannel: 50, greenChannel: 48, blueChannel: 54 } },
          'tint-1': { type: 'tint', label: 'Tint', settings: { enabled: true, color: '#7a8aff', blendMode: 'difference', opacity: 100 } },
          'post-1': { type: 'postProcessing', label: 'Post Processing', settings: { enabled: true, invert: false, sharpen: 5, blur: 9, hue: 0 } },
          'time-1': { type: 'temporalVariation', label: 'Temporal Variation', settings: { enabled: true, intensity: 1.8, speed: 0.9, pattern: 'blue-noise' } },
        },
        order: ['time-1', 'adjustments', 'post-1', 'glow-1', 'tint-1'],
      }),
    )!;
    expect(r.params).toMatchObject({
      fxGlow: true,
      fxGlowThreshold: 1,
      fxGlowSoftness: 25,
      fxGlowRadius: 200,
      fxGlowIntensity: 100,
      fxGlowAspect: 1.24,
      fxGlowFalloff: 1,
      fxGlitch: true,
      fxGlitchShift: 40,
      fxGlitchSwap: 0,
      fxGlitchCrush: 0,
      fxChroma: true,
      fxChromaAmount: 20,
      fxChromaR: 0,
      fxChromaG: -4,
      fxChromaB: 8,
      fxTint: true,
      fxTintColor: '#7a8aff',
      fxTintOpacity: 100,
      fxFinish: true,
      fxFinishBlur: 9,
      fxFinishSharpen: 5,
      animate: true,
      boilPattern: 'blue',
      boilAmount: 36,
      boilFps: 7,
    });
    expect(r.params.fxTintMode).toBeUndefined();
    expect(r.skipped).toEqual(expect.arrayContaining(['Tint blend mode “difference”', 'Glow “quality”']));
    expect(r.params.fxOrder).toBe(normalizeOrder('finish,glow,tint'));
  });

  it('falls back to a stacked effect list, and reads halftone and ASCII stages', () => {
    const r = importPreset({
      preset: {
        name: 'Stacked',
        colorPalette: { customColors: ['#000000', '#ffffff'] },
        halftone: { enabled: true, mode: 'cmyk', cellSize: 10, dotGain: 0.2, supersample: 4, cyanAngle: 15, magentaAngle: 75, yellowAngle: 0, blackAngle: 45, gcr: 1 },
        ascii: { enabled: true, depth: 10, characterSet: 'classic_ascii_10', characterOffset: 0, fontStyle: 'bold', characterColor: 'palette', backgroundColor: '#101010' },
        fxStack: [
          { type: 'effect', subtype: 'adjustments', enabled: true, settings: { brightness: 100, contrast: 100, saturation: 100 } },
          { type: 'dither', subtype: 'floyd-steinberg', enabled: true, settings: { scale: 50 } },
        ],
      },
    })!;
    expect(r.params).toMatchObject({
      algorithm: 'halftone-cmyk',
      cellSize: 10,
      cmykDotGain: 20,
      cmykGcr: 100,
      cmykSupersample: 4,
      cmykAngleM: 75,
      brightness: 0,
      contrast: 0,
      pixelSize: 2,
      mode: 'ascii',
      asciiDepth: 10,
      asciiCharset: 'standard',
      asciiBold: true,
      asciiColor: 'palette',
      asciiPalette: 'custom',
      asciiBg: '#101010',
    });
  });
});
