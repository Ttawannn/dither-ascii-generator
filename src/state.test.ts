import { describe, expect, it } from 'vitest';
import { DEFAULTS, printLength, READY_EXPORTS, readyExport, sanitize } from './state';

describe('sanitize', () => {
  it('keeps valid values', () => {
    expect(sanitize({ mode: 'ascii', pixelSize: 4, ink: '#123abc', invert: true })).toEqual({
      mode: 'ascii',
      pixelSize: 4,
      ink: '#123abc',
      invert: true,
    });
  });

  it('drops unknown keys and wrong types', () => {
    expect(sanitize({ foo: 1, pixelSize: '4', invert: 'yes' })).toEqual({});
  });

  it('rejects values outside an enum and malformed colours', () => {
    expect(sanitize({ algorithm: 'nope', palette: 'x', asciiFg: 'red', paper: '#fff' })).toEqual({});
  });

  it('clamps numbers to the slider range and rejects non-finite ones', () => {
    expect(sanitize({ asciiColumns: 999999, pixelSize: -5, gamma: Number.NaN })).toEqual({
      asciiColumns: 300,
      pixelSize: 1,
    });
  });

  it('rejects an over-long custom ramp', () => {
    expect(sanitize({ asciiCustom: 'x'.repeat(65) })).toEqual({});
    expect(sanitize({ asciiCustom: ' .oO@' })).toEqual({ asciiCustom: ' .oO@' });
  });

  it('normalizes the custom palette and rejects one with fewer than two colours', () => {
    expect(sanitize({ customPalette: '#FFF, #000000; junk #12345' })).toEqual({ customPalette: '#ffffff #000000' });
    expect(sanitize({ customPalette: '#ffffff' })).toEqual({});
    expect(sanitize({ customPalette: Array(40).fill('#123456').join(' ') }).customPalette?.split(' ')).toHaveLength(32);
  });

  it('checks the tint blend mode and colour', () => {
    expect(sanitize({ fxTintMode: 'screen', fxTintColor: '#00FF00' })).toEqual({ fxTintMode: 'screen', fxTintColor: '#00FF00' });
    expect(sanitize({ fxTintMode: 'dodge', fxTintColor: 'green' })).toEqual({});
  });

  it('checks the boil pattern and accepts wide glows', () => {
    expect(sanitize({ boilPattern: 'blue', fxGlowRadius: 180 })).toEqual({ boilPattern: 'blue', fxGlowRadius: 180 });
    expect(sanitize({ boilPattern: 'pink', fxGlowRadius: 999 })).toEqual({ fxGlowRadius: 200 });
  });

  it('clamps the new dither settings to their ranges', () => {
    expect(sanitize({ orbCount: 500, cmykSupersample: 0, waveBias: -300, waveFollow: 150, algorithm: 'honeycomb' })).toEqual({
      orbCount: 64,
      cmykSupersample: 1,
      waveBias: -100,
      waveFollow: 100,
      algorithm: 'honeycomb',
    });
  });

  it('checks the mask settings', () => {
    expect(sanitize({ maskMode: 'hue', maskOutside: 'color', maskColor: '#00ff00', maskHue: 400, patternFollow: 50 })).toEqual({
      maskMode: 'hue',
      maskOutside: 'color',
      maskColor: '#00ff00',
      maskHue: 360,
      patternFollow: 50,
    });
    expect(sanitize({ maskMode: 'depth', maskOutside: 'blur' })).toEqual({});
  });

  it('ignores non-objects', () => {
    expect(sanitize(null)).toEqual({});
    expect(sanitize('{"mode":"ascii"}')).toEqual({});
  });

  it('accepts every default as-is', () => {
    expect(sanitize(DEFAULTS)).toEqual(DEFAULTS);
  });
});

describe('printLength', () => {
  it('converts pixels at a resolution to centimetres or inches', () => {
    expect(printLength(300, 300, 'in')).toBe(1);
    expect(printLength(600, 300, 'cm')).toBeCloseTo(5.08);
  });
  it('sanitizes the print settings', () => {
    const p = sanitize({ exportDpi: 5000, exportUnit: 'mm', exportPrint: 'yes' });
    expect(p.exportDpi).toBe(1200);
    expect(p.exportUnit).toBeUndefined(); // invalid values are dropped
    expect(p.exportPrint).toBeUndefined();
  });
});

describe('ready-made exports', () => {
  const ready = (id: string) => READY_EXPORTS.find((r) => r.id === id)!;

  it('pick the scale that gets nearest the wanted long side', () => {
    expect(readyExport(ready('social'), 540, 360)).toEqual({ params: expect.objectContaining({ exportFormat: 'png', exportScale: 2, exportPrint: false }), reached: 1080 });
    expect(readyExport(ready('social'), 1200, 800).params.exportScale).toBe(1);
  });

  it('cap the scale at 8× and say how big it got', () => {
    const { params, reached } = readyExport(ready('a3'), 400, 300);
    expect(params).toMatchObject({ exportScale: 8, exportPrint: true, exportDpi: 300 });
    expect(reached).toBe(3200);
  });

  it('set animation length and quality where given, and pass sanitize', () => {
    expect(readyExport(ready('gif'), 600, 400).params).toMatchObject({ exportFormat: 'gif', exportDuration: 3, exportFps: 15, exportScale: 1 });
    expect(readyExport(ready('web'), 800, 600).params).toMatchObject({ exportFormat: 'webp', exportQuality: 85, exportScale: 2 });
    for (const r of READY_EXPORTS) {
      const { params } = readyExport(r, 600, 400);
      expect(sanitize(params), r.id).toEqual(params);
    }
  });
});
