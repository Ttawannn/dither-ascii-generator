import { describe, expect, it } from 'vitest';
import { applyAnimation, type Lane } from './anim';
import { animateStack, currentStack, layerView, newFxLayer, stackEffects, stackFromFlat } from './fx-stack';
import { activeEffects, MAX_FX_LAYERS } from './pipeline/effects';
import { animatableSpec, DEFAULTS, sanitize, type Params } from './state';

const look = (o: Partial<Params>): Params => ({ ...DEFAULTS, ...o });

describe('effect stack from flat settings', () => {
  it('gives exactly the effects older looks render, in their order', () => {
    const p = look({ fxGlow: true, fxGlowRadius: 40, fxTint: true, fxTintMode: 'screen', fxGrain: true, fxOrder: 'tint,grain,glow' });
    const { pre, post } = stackEffects(p);
    expect(pre).toEqual([]);
    expect(post).toEqual(activeEffects(p));
    expect(stackFromFlat(p).map((l) => l.type)).toEqual(['tint', 'grain', 'glow']);
    expect(stackFromFlat(p)[2].settings.fxGlowRadius).toBe(40);
  });

  it('is empty when no effect is on', () => {
    expect(currentStack(DEFAULTS)).toEqual([]);
    expect(stackEffects(DEFAULTS)).toEqual({ pre: [], post: [] });
  });
});

describe('stored stack', () => {
  it('is repaired by sanitize: unknown types and keys dropped, values clamped, ids unique', () => {
    const raw = JSON.stringify([
      { id: 'glow', type: 'glow', on: true, before: true, settings: { fxGlowRadius: 9999, fxTintColor: '#ff0000', bogus: 1 } },
      { id: 'glow', type: 'glow', settings: {} },
      { type: 'nope', settings: {} },
      { id: 'sort', type: 'sort', before: true, settings: { fxSortVertical: true } },
      'junk',
    ]);
    const list = JSON.parse(sanitize({ fxStack: raw }).fxStack!);
    expect(list.map((l: { id: string }) => l.id)).toEqual(['glow', 'glow-2', 'sort']);
    expect(list[0]).toMatchObject({ before: true, settings: { fxGlowRadius: 200 } });
    expect(list[0].settings.fxTintColor).toBeUndefined();
    expect(list[1].on).toBe(true);
    // Pixel sorting can't run before dithering.
    expect(list[2]).toMatchObject({ before: false, settings: { fxSortVertical: true } });
    expect(sanitize({ fxStack: 'not json' }).fxStack).toBe('');
    expect(sanitize({ fxStack: '' }).fxStack).toBe('');
  });

  it('keeps at most 16 layers', () => {
    const raw = JSON.stringify(Array.from({ length: 30 }, () => ({ type: 'vignette', settings: {} })));
    expect(JSON.parse(sanitize({ fxStack: raw }).fxStack!)).toHaveLength(MAX_FX_LAYERS);
  });

  it('renders each layer with its own settings, before or after dithering, skipping hidden ones', () => {
    const stack = [
      { id: 'glow', type: 'glow', on: true, before: true, settings: { fxGlowRadius: 10 } },
      { id: 'glow-2', type: 'glow', on: true, before: false, settings: { fxGlowRadius: 80 } },
      { id: 'vignette', type: 'vignette', on: false, before: false, settings: {} },
    ];
    const p = look({ fxStack: JSON.stringify(stack), fxGlow: false, fxGlowRadius: 3 });
    const { pre, post } = stackEffects(p);
    expect(pre.map((e) => e.params[0])).toEqual([10]);
    expect(post.map((e) => e.params[0])).toEqual([80]);
    // Flat settings no longer decide anything once a stack is stored.
    expect(layerView(p, stack[1]).fxGlow).toBe(true);
  });

  it('gives new layers default settings and a free id', () => {
    const list = [newFxLayer('glow', [])];
    expect(list[0]).toMatchObject({ id: 'glow', on: true, before: false, settings: { fxGlowRadius: DEFAULTS.fxGlowRadius } });
    expect(newFxLayer('glow', list).id).toBe('glow-2');
  });
});

describe('animation lanes on effect layers', () => {
  const lane = (key: string, overrides: Partial<Lane> = {}): Lane =>
    ({ id: 1, key, mode: 'keys', shape: 'sine', hz: 1, amount: 0.5, from: 10, to: 30, ease: 'linear', loop: 'once', band: 'bass', smooth: 0, ...overrides }) as Lane;
  const animate = (t: number) => (view: Params, lanes: Lane[]) => applyAnimation(view, lanes, t, animatableSpec);

  it('drive the first layer of that effect only', () => {
    const stack = [
      { id: 'glow', type: 'glow', on: true, before: false, settings: { fxGlowRadius: 6 } },
      { id: 'glow-2', type: 'glow', on: true, before: false, settings: { fxGlowRadius: 50 } },
    ];
    const p = look({ fxStack: JSON.stringify(stack), animDuration: 2 });
    const lanes = [lane('fxGlowRadius')];
    const out = animateStack(p, lanes, animate(1), animate(1)(p, lanes));
    const list = JSON.parse(out.fxStack);
    expect(list[0].settings.fxGlowRadius).toBe(20); // halfway from 10 to 30
    expect(list[1].settings.fxGlowRadius).toBe(50);
  });

  it('leave looks without a stored stack to the flat settings', () => {
    const p = look({ fxGlow: true, animDuration: 2 });
    const lanes = [lane('fxGlowRadius')];
    const flat = animate(1)(p, lanes);
    expect(animateStack(p, lanes, animate(1), flat)).toBe(flat);
  });
});
