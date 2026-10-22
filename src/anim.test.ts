import { describe, expect, it } from 'vitest';
import { applyAnimation, keyProgress, laneValue, MAX_LANES, newLane, parseLanes, serializeLanes, type Lane } from './anim';
import { animatableSpec, DEFAULTS, sanitize } from './state';

const contrast = animatableSpec('contrast')!; // -100..100, step 1

const keys = (over: Partial<Lane> = {}): Lane => ({
  ...newLane(1, 'contrast', contrast, 0),
  mode: 'keys',
  from: -50,
  to: 50,
  ease: 'linear',
  loop: 'repeat',
  ...over,
});

describe('parseLanes', () => {
  it('drops unknown or non-animatable targets and duplicates', () => {
    const json = JSON.stringify([
      { key: 'contrast' },
      { key: 'contrast' },
      { key: 'nope' },
      { key: 'asciiFontSize' }, // rebuilds the atlas every frame, so not animatable
      { key: 'exportScale' },
      { key: 'fxGlowRadius' },
    ]);
    expect(parseLanes(json, animatableSpec).map((l) => l.key)).toEqual(['contrast', 'fxGlowRadius']);
  });

  it('clamps values and repairs bad fields', () => {
    const [lane] = parseLanes(
      JSON.stringify([{ key: 'contrast', mode: 'x', hz: 99, amount: -1, from: -999, to: 999, ease: 'bounce' }]),
      animatableSpec,
    );
    expect(lane).toMatchObject({ mode: 'lfo', hz: 4, amount: 0, from: -100, to: 100, ease: 'smooth' });
  });

  it(`keeps at most ${MAX_LANES} lanes and survives garbage`, () => {
    const many = ['brightness', 'contrast', 'gamma', 'saturation', 'sharpen', 'pixelSize', 'strength', 'threshold', 'angle'];
    expect(parseLanes(JSON.stringify(many.map((key) => ({ key }))), animatableSpec)).toHaveLength(MAX_LANES);
    expect(parseLanes('not json', animatableSpec)).toEqual([]);
    expect(parseLanes('{"key":"contrast"}', animatableSpec)).toEqual([]);
  });

  it('is applied by sanitize', () => {
    const out = sanitize({ animLanes: JSON.stringify([{ key: 'contrast' }, { key: 'bogus' }]) });
    expect(parseLanes(out.animLanes!, animatableSpec).map((l) => l.key)).toEqual(['contrast']);
  });
});

describe('keyframes', () => {
  it('interpolates multiple points, holds steps, clamps outside a lane, and repeats', () => {
    const lane = keys({ start: 1, end: 5, loop: 'once', points: [
      { time: 0, value: -80, ease: 'linear' }, { time: .5, value: 40, ease: 'step' }, { time: 1, value: 90, ease: 'linear' },
    ] });
    expect(laneValue(lane, 0, contrast, 0, 8)).toBe(-80);
    expect(laneValue(lane, 0, contrast, 2, 8)).toBe(-20);
    expect(laneValue(lane, 0, contrast, 4, 8)).toBe(40);
    expect(laneValue(lane, 0, contrast, 6, 8)).toBe(90);
    expect(laneValue({ ...lane, loop: 'repeat' }, 0, contrast, 6, 8)).toBe(-20);
  });
  it('repairs duplicate point times, sorts points, and keeps the final value at a repeated time', () => {
    const [lane] = parseLanes(JSON.stringify([{ ...keys(), points: [
      { time: 1, value: 100, ease: 'linear' }, { time: 0, value: -100 }, { time: .5, value: 0 }, { time: .5, value: 40 },
    ] }]), animatableSpec);
    expect(lane.points?.map((p) => [p.time, p.value])).toEqual([[0, -100], [.5, 40], [1, 100]]);
  });
  it('repeats, ping-pongs or plays once', () => {
    expect(keyProgress({ ease: 'linear', loop: 'repeat' }, 1, 4)).toBeCloseTo(0.25);
    expect(keyProgress({ ease: 'linear', loop: 'repeat' }, 5, 4)).toBeCloseTo(0.25);
    expect(keyProgress({ ease: 'linear', loop: 'pingpong' }, 6, 4)).toBeCloseTo(0.5);
    expect(keyProgress({ ease: 'linear', loop: 'pingpong' }, 7, 4)).toBeCloseTo(0.25);
    expect(keyProgress({ ease: 'linear', loop: 'once' }, 9, 4)).toBe(1);
  });

  it('eases', () => {
    expect(keyProgress({ ease: 'smooth', loop: 'once' }, 1, 4)).toBeCloseTo(0.15625);
    expect(keyProgress({ ease: 'step', loop: 'once' }, 3.9, 4)).toBe(0);
    expect(keyProgress({ ease: 'step', loop: 'once' }, 4, 4)).toBe(1);
  });

  it('goes from → to, snapped to the slider step', () => {
    expect(laneValue(keys(), 0, contrast, 0, 4)).toBe(-50);
    expect(laneValue(keys(), 0, contrast, 1, 4)).toBe(-25);
    expect(laneValue(keys({ loop: 'once' }), 0, contrast, 4, 4)).toBe(50);
    expect(Number.isInteger(laneValue(keys(), 0, contrast, 1.37, 4))).toBe(true);
  });
});

describe('lfo lanes', () => {
  it('swing around the slider value by a fraction of the range, clamped', () => {
    const lane = { ...keys(), mode: 'lfo' as const, shape: 'sine', hz: 1, amount: 0.5 };
    expect(laneValue(lane, 10, contrast, 0.25, 4)).toBe(60); // 10 + 0.5 × 200 / 2
    expect(laneValue(lane, 90, contrast, 0.25, 4)).toBe(100);
  });
});

describe('audio lanes', () => {
  const lane = { ...keys(), mode: 'audio' as const, band: 'mid' as const, amount: 0.5, smooth: 0.2 };
  it('push the value up by loudness × amount of the range, clamped', () => {
    const level = (band: string, window: number) => (band === 'mid' && window === 0.2 ? 0.4 : 0);
    expect(laneValue(lane, 0, contrast, 0, 4, level)).toBe(40); // 0 + 0.4 × 0.5 × 200
    expect(laneValue(lane, 90, contrast, 0, 4, level)).toBe(100);
  });
  it('rest at the slider value without audio', () => {
    expect(laneValue(lane, 10, contrast, 0, 4)).toBe(10);
  });
  it('repair band and smoothing', () => {
    const [l] = parseLanes(JSON.stringify([{ ...lane, band: 'treble', smooth: 9 }]), animatableSpec);
    expect(l.mode).toBe('audio');
    expect(l.band).toBe('bass');
    expect(l.smooth).toBe(1);
  });
});

describe('applyAnimation', () => {
  it('returns the same object when nothing is animated', () => {
    expect(applyAnimation(DEFAULTS, [], 1, animatableSpec)).toBe(DEFAULTS);
  });

  it('only changes animated settings', () => {
    const out = applyAnimation(DEFAULTS, [keys()], 1, animatableSpec);
    expect(out.contrast).toBe(-25);
    expect({ ...out, contrast: DEFAULTS.contrast }).toEqual(DEFAULTS);
  });

  it('round-trips through serializeLanes', () => {
    const lanes = [keys(), { ...keys(), id: 2, key: 'gamma' as const, from: 0.5, to: 2 }];
    expect(parseLanes(serializeLanes(lanes), animatableSpec)).toEqual(lanes);
  });
});
