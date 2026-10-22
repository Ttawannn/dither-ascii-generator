import { describe, expect, it } from 'vitest';
import { blend, setSat, type RGB } from './blend';
import { TINT_MODES } from './effects';

const mode = (id: string) => TINT_MODES.findIndex((m) => m.id === id);
const close = (a: RGB, b: RGB) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('tint blend', () => {
  const base: RGB = [0.2, 0.6, 0.9];
  const tint: RGB = [0.8, 0.3, 0.5];

  it('has a formula for every mode, keeping the first six where presets left them', () => {
    expect(TINT_MODES.slice(0, 6).map((m) => m.id)).toEqual(['multiply', 'screen', 'overlay', 'soft-light', 'color', 'color-burn']);
    for (let i = 0; i < TINT_MODES.length; i++) {
      for (const v of blend(base, tint, i)) expect(v).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('matches the separable formulas', () => {
    close(blend(base, tint, mode('difference')), [0.6, 0.3, 0.4]);
    close(blend(base, tint, mode('exclusion')), [0.68, 0.54, 0.5]);
    close(blend(base, tint, mode('lighten')), [0.8, 0.6, 0.9]);
    close(blend(base, tint, mode('darken')), [0.2, 0.3, 0.5]);
    // Hard light is overlay with the layers swapped: picks by the tint channel.
    close(blend(base, tint, mode('hard-light')), [1 - 2 * 0.8 * 0.2, 2 * 0.6 * 0.3, 1 - 2 * 0.1 * 0.5]);
    close(blend(base, tint, mode('color-dodge')), [1, 0.6 / 0.7, 1]);
    close(blend([0, 0.5, 0.5], [1, 0, 0.5], mode('color-dodge')), [0, 0.5, 1]);
  });

  it('keeps the base luminance for hue and saturation, and takes the tint luminance for luminosity', () => {
    expect(lum(blend(base, tint, mode('hue')))).toBeCloseTo(lum(base), 4);
    expect(lum(blend(base, tint, mode('saturation')))).toBeCloseTo(lum(base), 4);
    expect(lum(blend(base, tint, mode('luminosity')))).toBeCloseTo(lum(tint), 4);
    // A grey tint has no hue or saturation to give: hue mode turns the base grey.
    const grey = blend(base, [0.5, 0.5, 0.5], mode('hue'));
    close(grey, [lum(base), lum(base), lum(base)]);
  });

  it('sets saturation without changing channel order', () => {
    close(setSat([0.2, 0.6, 0.4], 0.8), [0, 0.8, 0.4]);
    close(setSat([0.5, 0.5, 0.5], 0.8), [0, 0, 0]);
  });
});
