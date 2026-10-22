import { describe, expect, it } from 'vitest';
import { temporalPhase } from './temporal';
import { DEFAULTS, sanitize } from './state';
import { decodeShare, encodeShare, snapshot } from './presets';

describe('temporal clock', () => {
  it('matches at the start and end of every loop for fractional speeds', () => {
    for (const temporalSpeed of [0.1, 0.7, 1, 3.2]) {
      const p = { ...DEFAULTS, temporalSpeed };
      expect(temporalPhase(p, 0)).toBeCloseTo(temporalPhase(p, p.animDuration));
      expect(temporalPhase(p, 0.7)).toBeCloseTo(temporalPhase(p, 0.7 + p.animDuration));
    }
  });
  it('uses continuous seconds when looping is off', () => {
    expect(temporalPhase({ ...DEFAULTS, temporalLoop: false, temporalSpeed: 2 }, 1.25)).toBe(2.5);
  });
  it('carries new controls through presets, share links and validation', () => {
    const p = { ...DEFAULTS, temporalPattern: 'blocks', temporalSeed: 42, shapeLayout: 'staggered', fxReveal: true, modulationWidth: 37 };
    expect(snapshot(p)).toMatchObject({ temporalPattern: 'blocks', shapeLayout: 'staggered', fxReveal: true });
    expect(decodeShare(`#s=${encodeShare(p)}`)).toMatchObject({ temporalSeed: 42, modulationWidth: 37 });
    expect(sanitize({ temporalPattern: 'bad', temporalAmount: Infinity, temporalSeed: -3 })).toEqual({ temporalSeed: 1 });
  });
});
