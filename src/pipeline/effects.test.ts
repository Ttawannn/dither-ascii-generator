import { describe, expect, it } from 'vitest';
import { DEFAULTS, FX_SLIDERS, sanitize, type Params } from '../state';
import { activeEffects, compensationGain, DEFAULT_ORDER, EFFECT_IDS, EFFECTS, MASK_KIND, maskEffect, moveEffect, normalizeOrder } from './effects';

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

describe('defaults keep the earlier look', () => {
  it('glitch runs block shift, colour crush and channel swap at full share, the new modes off', () => {
    const [fx] = activeEffects({ ...DEFAULTS, fxGlitch: true });
    expect(fx.params).toEqual([DEFAULTS.fxGlitchAmount / 100, DEFAULTS.fxGlitchBlock, 1, 1]);
    expect(fx.extra).toEqual([1, 0, 0, 0]);
  });

  it('chromatic pushes red out and blue in, green stays', () => {
    expect(activeEffects({ ...DEFAULTS, fxChroma: true })[0].params).toEqual([DEFAULTS.fxChromaAmount, 1, 0, -1]);
  });

  it('glow is round, hard-edged, unturned and falls off as 1/ring', () => {
    const [fx] = activeEffects({ ...DEFAULTS, fxGlow: true });
    expect(fx.params[3]).toBe(0);
    expect(fx.extra).toEqual([1, 0, 1, 0]);
  });
});

describe('glow and finish', () => {
  it('only glow asks for the bright pass', () => {
    const all = activeEffects({ ...DEFAULTS, fxGlow: true, fxGrain: true, fxFinish: true });
    expect(all.filter((f) => f.bright).map((f) => f.kind)).toEqual([0]);
  });

  it('sends glow angle and finish hue in radians', () => {
    const [glow, finish] = activeEffects({
      ...DEFAULTS,
      fxOrder: 'glow,finish',
      fxGlow: true,
      fxGlowAngle: 90,
      fxGlowAspect: 2,
      fxFinish: true,
      fxFinishBlur: 3,
      fxFinishSharpen: 40,
      fxFinishHue: -180,
    });
    expect(glow.extra[0]).toBe(2);
    expect(glow.extra[1]).toBeCloseTo(Math.PI / 2);
    expect(finish.kind).toBe(7);
    expect(finish.params[0]).toBe(3);
    expect(finish.params[1]).toBeCloseTo(0.4);
    expect(finish.params[2]).toBeCloseTo(-Math.PI);
  });
});

describe('mask', () => {
  it('is off by default', () => {
    expect(maskEffect(DEFAULTS)).toBeNull();
  });

  it('sends the range, feather, invert, hue and outside choice', () => {
    const fx = maskEffect(
      { ...DEFAULTS, maskMode: 'hue', maskHue: 90, maskHueWidth: 45, maskFeather: 50, maskInvert: true, maskOutside: 'transparent', maskColor: '#ff0000' },
      true,
    )!;
    expect(fx.kind).toBe(MASK_KIND);
    expect(fx.params).toEqual([0, 0.5, 0.5, 1]);
    expect(fx.extra).toEqual([0.25, 0.125, 2, 2]);
    expect(fx.mask).toEqual({ color: [1, 0, 0], view: true });
    expect(maskEffect({ ...DEFAULTS, maskMode: 'luma' })!.extra[2]).toBe(1);
  });
});

describe('tint', () => {
  it('sends the colour and opacity, and the blend mode index as extra parameters', () => {
    const p: Params = { ...DEFAULTS, fxTint: true, fxTintColor: '#ff0000', fxTintOpacity: 50, fxTintMode: 'screen' };
    const [fx] = activeEffects(p);
    expect(fx.params).toEqual([1, 0, 0, 0.5]);
    expect(fx.extra).toEqual([1, 0, 0, 0]);
  });

  it('gives other effects zero extra parameters', () => {
    expect(activeEffects({ ...DEFAULTS, fxGrain: true })[0].extra).toEqual([0, 0, 0, 0]);
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

describe('glow curve', () => {
  it('keeps the old glow at the defaults: no ε, no compensation, no tint', () => {
    const [fx] = activeEffects({ ...DEFAULTS, fxGlow: true });
    expect(fx.extra[3]).toBe(0);
    expect(fx.more).toEqual([1, 1, 0, 0]);
    expect(fx.color).toEqual([1, 1, 1]);
  });

  it('passes ε, distance scale, compensation gain and tint', () => {
    const [fx] = activeEffects({ ...DEFAULTS, fxGlow: true, fxGlowEpsilon: 50, fxGlowDistance: 200, fxGlowCompensate: true, fxGlowRadius: 200, fxGlowTint: 40, fxGlowColor: '#ff0000' });
    expect(fx.extra[3]).toBe(1);
    expect(fx.more![0]).toBe(2);
    expect(fx.more![1]).toBe(1); // the renderer fills in the gain
    expect(fx.more![2]).toBe(0.4);
    expect(fx.more![3]).toBe(1);
    expect(fx.color).toEqual([1, 0, 0]);
  });

  it('compensation lifts faded small details, leaves large bright areas, and is capped', () => {
    expect(compensationGain(0.9, 0.9)).toBe(1);
    expect(compensationGain(0.8, 0.2)).toBe(4);
    expect(compensationGain(0.5, 0.9)).toBe(1);
    expect(compensationGain(1, 0)).toBe(8);
  });
});
