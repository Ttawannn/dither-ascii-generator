import { describe, expect, it } from 'vitest';
import { DEFAULTS, sanitize } from './state';

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

  it('ignores non-objects', () => {
    expect(sanitize(null)).toEqual({});
    expect(sanitize('{"mode":"ascii"}')).toEqual({});
  });

  it('accepts every default as-is', () => {
    expect(sanitize(DEFAULTS)).toEqual(DEFAULTS);
  });
});
