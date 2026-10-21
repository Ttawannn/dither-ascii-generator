import { describe, expect, it } from 'vitest';
import { newLayer, parseLayer, serializeLayer } from './layers';
import { decodeShare, encodeShare, PRESET_KEYS } from './presets';
import { DEFAULTS, layerParams, readLayer, sanitize, type Params } from './state';

const keepAll = (d: unknown) => (d && typeof d === 'object' ? (d as Record<string, unknown>) : {});

describe('parseLayer', () => {
  it('is null when empty or unreadable', () => {
    expect(parseLayer('', keepAll)).toBeNull();
    expect(parseLayer('{broken', keepAll)).toBeNull();
    expect(parseLayer('[1,2]', keepAll)).toBeNull();
  });

  it('repairs the switches', () => {
    const l = parseLayer(JSON.stringify({ on: 'yes', blend: 'dodge', opacity: 250, maskOnly: 1, params: { mode: 'ascii' } }), keepAll)!;
    expect(l).toEqual({ on: false, blend: 'normal', opacity: 100, maskOnly: false, params: { mode: 'ascii' } });
  });

  it('round-trips a new layer', () => {
    expect(parseLayer(serializeLayer(newLayer()), keepAll)).toEqual(newLayer());
  });
});

describe('layer2 param', () => {
  it('keeps only the layer’s own settings, sanitized', () => {
    const json = serializeLayer({
      ...newLayer(),
      blend: 'screen',
      params: { mode: 'dither', algorithm: 'honeycomb', levels: 99, contrast: 50, fxGlow: true, bogus: 1 },
    });
    const layer = readLayer({ ...DEFAULTS, ...sanitize({ layer2: json }) } as Params)!;
    // levels is clamped, contrast / fxGlow are shared settings and dropped, unknown keys dropped.
    expect(layer.params).toEqual({ mode: 'dither', algorithm: 'honeycomb', levels: 16 });
    expect(layer.blend).toBe('screen');
  });

  it('turns an unreadable value into "no layer"', () => {
    expect(sanitize({ layer2: 'not json' })).toEqual({ layer2: '' });
  });

  it('renders with shared settings from layer 1 and its own from defaults + the layer', () => {
    const p: Params = { ...DEFAULTS, contrast: 40, algorithm: 'bayer8', palette: 'pico8', mode: 'dither' };
    const lp = layerParams(p, { ...newLayer(), params: { mode: 'ascii', asciiColumns: 80 } });
    expect(lp.contrast).toBe(40); // shared
    expect(lp.mode).toBe('ascii');
    expect(lp.asciiColumns).toBe(80);
    expect(lp.algorithm).toBe(DEFAULTS.algorithm); // own setting, not inherited from layer 1
    expect(lp.palette).toBe(DEFAULTS.palette);
  });

  it('is part of presets and share links', () => {
    expect(PRESET_KEYS).toContain('layer2');
    const json = serializeLayer({ ...newLayer(), opacity: 40, params: { mode: 'ascii' } });
    const decoded = decodeShare(`#s=${encodeShare({ ...DEFAULTS, layer2: json })}`)!;
    expect(decoded.layer2).toBe(json);
  });
});
