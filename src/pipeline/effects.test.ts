import { describe, expect, it } from 'vitest';
import { DEFAULTS, FX_SLIDERS, sanitize, type Params } from '../state';
import { activeEffects, DEFAULT_ORDER, EFFECT_IDS, EFFECTS, moveEffect, normalizeOrder } from './effects';

describe('effect order', () => {
  it('keeps a valid order as it is', () => {
    expect(normalizeOrder(DEFAULT_ORDER)).toBe(DEFAULT_ORDER);
    const reversed = [...EFFECT_IDS].reverse().join(',');
    expect(normalizeOrder(reversed)).toBe(reversed);
  });

  it('drops unknown and duplicate ids and appends missing ones', () => {
    expect(normalizeOrder('grain,nope,grain,glow')).toBe(
      ['grain', 'glow', ...EFFECT_IDS.filter((id) => id !== 'grain' && id !== 'glow')].join(','),
    );
    expect(normalizeOrder('')).toBe(DEFAULT_ORDER);
  });

  it('moves an effect one step and stops at the ends', () => {
    const [first, second] = EFFECT_IDS;
    expect(moveEffect(DEFAULT_ORDER, second, -1).split(',').slice(0, 2)).toEqual([second, first]);
    expect(moveEffect(DEFAULT_ORDER, first, -1)).toBe(DEFAULT_ORDER);
    const last = EFFECT_IDS[EFFECT_IDS.length - 1];
    expect(moveEffect(DEFAULT_ORDER, last, 1)).toBe(DEFAULT_ORDER);
  });

  it('is repaired by sanitize', () => {
    expect(sanitize({ fxOrder: 'vignette,bogus' }).fxOrder).toBe(normalizeOrder('vignette'));
  });
});

describe('activeEffects', () => {
  it('is empty by default', () => {
    expect(activeEffects(DEFAULTS)).toEqual([]);
  });

  it('returns only enabled effects, in chain order, with shader parameters', () => {
    const p: Params = { ...DEFAULTS, fxGlow: true, fxVignette: true, fxVignetteAmount: 80, fxOrder: 'vignette,glow' };
    const fx = activeEffects(p);
    expect(fx.map((f) => f.kind)).toEqual([4, 0]);
    expect(fx[0].params[0]).toBeCloseTo(0.8);
    expect(fx[1].params).toEqual([DEFAULTS.fxGlowRadius, DEFAULTS.fxGlowIntensity / 100, DEFAULTS.fxGlowThreshold / 100, 0]);
  });
});

describe('effect definitions', () => {
  it('have unique ids and shader kinds, and sliders for each', () => {
    expect(new Set(EFFECT_IDS).size).toBe(EFFECTS.length);
    expect(new Set(EFFECTS.map((e) => e.kind)).size).toBe(EFFECTS.length);
    for (const e of EFFECTS) expect(FX_SLIDERS[e.id]?.length, e.id).toBeGreaterThan(0);
  });

  it('switch on with a boolean param', () => {
    for (const e of EFFECTS) expect(typeof DEFAULTS[e.enabled], e.id).toBe('boolean');
  });
});
