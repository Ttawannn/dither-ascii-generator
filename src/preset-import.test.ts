import { describe, expect, it } from 'vitest';
import { KNOWN_STYLES, importPreset, importPresetList, looksLikePreset } from './preset-import';
import { presetFile, presetFileName, presetListFile } from './presets';
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

  it('maps the palette, style and scale, and reports the shadow cut-off', () => {
    const r = importPreset(external())!;
    expect(r.name).toBe('Test look');
    expect(r.params).toMatchObject({
      palette: 'custom',
      customPalette: '#000000 #0055ff',
      customRamp: true,
      algorithm: 'atkinson',
      pixelSize: 2,
    });
    expect(r.params.threshold).toBeUndefined();
    expect(r.approximated).toEqual(['Brightness and contrast (100 read as unchanged)']);
    expect(r.skipped).toContain('Luminance threshold (shadow cut-off)');
  });

  it('turns scale into a block size of 51 − scale', () => {
    const px = (scale?: number) => importPreset(external({ dither: { scale } }))!.params.pixelSize;
    expect(px(45)).toBe(6);
    expect(px(50)).toBe(1);
    expect(px(undefined)).toBe(1);
    expect(px(60)).toBe(1);
    expect(px(20)).toBe(16);
    expect(importPreset(external({ dither: { scale: 20 } }))!.approximated).toContain('Scale → pixel size (capped at 16 px)');
  });

  it('converts diffusion controls by meaning', () => {
    const p = (style: string, controls: object) => importPreset(external({ dither: { style, controls } }))!;
    expect(p('atkinson', { serpentine: true, errorReduction: 2 }).params).toMatchObject({ serpentine: true, diffusion: 50 });
    expect(p('burkes', { errorStrength: 80 }).params.diffusion).toBe(80);
    const strong = p('sierra', { errorStrength: 150 });
    expect(strong.params.diffusion).toBe(100);
    expect(strong.approximated).toContain('Error strength 150% (capped at 100%)');
  });

  it('picks the Bayer size from the matrix size', () => {
    const bayer = (matrixSize?: string) => importPreset(external({ dither: { style: 'bayer-matrix', controls: { matrixSize } } }))!;
    expect(bayer('2x2').params.algorithm).toBe('bayer2');
    expect(bayer(undefined).params.algorithm).toBe('bayer4');
    expect(bayer('8x8').params.algorithm).toBe('bayer8');
    expect(bayer('8x8').approximated).not.toContain('Dither style “bayer-matrix” → Bayer 8×8');
    const big = bayer('16x16');
    expect(big.params.algorithm).toBe('bayer16');
    expect(big.approximated.some((a) => a.startsWith('Dither style “bayer-matrix”'))).toBe(false);
    expect(big.skipped).not.toContain('Dither control “matrixSize”');
  });

  it('maps tile and dot sizes onto pixel and cell size', () => {
    const mosaic = importPreset(external({ dither: { style: 'mosaic', scale: 49, controls: { blockSize: 4 } } }))!;
    expect(mosaic.params).toMatchObject({ algorithm: 'threshold', threshold: 50, pixelSize: 8 });
    const bit = importPreset(external({ dither: { style: 'bit-tone', scale: 50, controls: { dotSize: 3 } } }))!;
    expect(bit.params).toMatchObject({ algorithm: 'halftone', cellSize: 12 });
  });

  it('draws shape grids with Luma Shapes in the palette colours', () => {
    const r = importPreset(external({ dither: { style: 'diamond-grid' } }))!;
    expect(r.params.algorithm).toBe('luma-shapes');
    const bands = JSON.parse(r.params.shapeBands!) as { shape: string; color: string }[];
    expect(bands.map((b) => b.shape)).toEqual(['empty', 'diamond', 'diamond', 'diamond', 'diamond', 'diamond']);
    expect(bands[5].color).toBe('#0055ff');
    expect(r.params.shapeBackground).toBe('#000000');
  });

  it('carries warp amounts onto Warp', () => {
    const curve = importPreset(external({ dither: { style: 'bayer-void', controls: { warpIntensity: 50 } } }))!;
    expect(curve.params).toMatchObject({ algorithm: 'bayer4', warpCurve: 20 });
    const swirl = importPreset(external({ dither: { style: 'vortex-diffusion', controls: { twistStrength: -60 } } }))!;
    expect(swirl.params).toMatchObject({ algorithm: 'floyd-steinberg', warpSwirl: -30 });
    expect(importPreset(external({ dither: { style: 'topography' } }))!.params.algorithm).toBe('contour');
    expect(importPreset(external({ dither: { style: 'vortex', controls: { swirl: 3 } } }))!.params).toMatchObject({ algorithm: 'radial', radialArms: 3 });
  });

  it('never drops a known style silently', () => {
    for (const style of KNOWN_STYLES) {
      const r = importPreset(external({ dither: { style } }))!;
      const reported = r.approximated.some((a) => a.includes(`“${style}”`)) || r.skipped.some((s) => s.includes(`“${style}”`));
      expect(r.params.algorithm !== undefined || reported, style).toBe(true);
      if (r.params.algorithm === undefined) expect(reported, style).toBe(true);
    }
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
    expect(r.params.fxTintMode).toBe('difference');
    expect(r.skipped).toContain('Glow “quality”');
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

describe('preset files round-trip', () => {
  const look = { name: 'Blue lines', params: { algorithm: 'atkinson', waveStrength: 60, palette: 'custom', customPalette: '#000000 #0055ff' } };

  it('reads back a single exported look exactly', () => {
    const r = importPreset(JSON.parse(presetFile(look)))!;
    expect(r.name).toBe('Blue lines');
    expect(r.params).toEqual(look.params);
  });

  it('reads back several looks from one file, skipping unreadable entries', () => {
    const other = { name: 'Plain', params: { algorithm: 'bayer8' } };
    const data = JSON.parse(presetListFile([look, other]));
    data.presets.push({ junk: true });
    const list = importPresetList(data)!;
    expect(list.map((r) => r.name)).toEqual(['Blue lines', 'Plain']);
    expect(list[1].params).toEqual({ algorithm: 'bayer8' });
    expect(importPresetList({ presets: [] })).toBeNull();
    expect(importPresetList({ name: 'x', params: {} })).toBeNull();
  });

  it('makes safe file names in any script', () => {
    expect(presetFileName('Blue lines')).toBe('Blue-lines.json');
    expect(presetFileName('ลายเส้น/สีฟ้า?')).toBe('ลายเส้นสีฟ้า.json');
    expect(presetFileName('  ')).toBe('look.json');
  });
});

describe('tint blend names', () => {
  const tint = (blendMode: string) =>
    importPreset({ preset: { dither: {}, effectInstances: { t: { type: 'tint', settings: { enabled: true, blendMode } } } } })!;

  it('reads blend modes however they are written', () => {
    expect(tint('colorDodge').params.fxTintMode).toBe('color-dodge');
    expect(tint('Hard Light').params.fxTintMode).toBe('hard-light');
    expect(tint('luminosity').params.fxTintMode).toBe('luminosity');
    expect(tint('normal').params.fxTintMode).toBe('normal');
    expect(tint('pinLight').skipped).toContain('Tint blend mode “pin-light”');
  });
});

describe('polygon styles', () => {
  it('map onto the polygon looks', () => {
    const style = (s: string) => importPreset({ preset: { dither: { style: s } } })!;
    expect(style('hexa-poly').params.algorithm).toBe('poly-hex');
    expect(style('hexa-poly').approximated).toEqual([]);
    expect(style('tri-poly').params.algorithm).toBe('poly-tri');
    expect(style('camo').params.algorithm).toBe('voronoi');
    expect(style('camo').approximated).toContain('Dither style “camo” → Voronoi');
  });
});

describe('diffusion styles', () => {
  it('map onto the new kernels with their settings', () => {
    const style = (s: string, controls: object = {}) => importPreset({ preset: { dither: { style: s, controls } } })!;
    expect(style('stevenson-arce').params.algorithm).toBe('stevenson-arce');
    expect(style('stevenson-arce').approximated).toEqual([]);
    expect(style('gaussian', { distributionSpread: 4 }).params).toMatchObject({ algorithm: 'gaussian', gaussSpread: 28 });
    expect(style('cracked-diffuse', { cracked: 30 }).params).toMatchObject({ algorithm: 'edge-diffusion', edgeCrack: 70 });
    expect(style('uniform-modulation-x', { bleedFraction: 0.25, smoothingFactor: 0.5 }).params)
      .toMatchObject({ algorithm: 'axis', axisVertical: true, axisBleed: 25, axisSmooth: 50 });
    expect(style('modulated-diffuse-y').params.axisVertical).toBeUndefined();
  });
});
