import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, pinchStep } from './gesture';

const view = { x: 100, y: 50, zoom: 2 };
/** Image coordinates under a stage point. */
const imageAt = (v: typeof view, p: { x: number; y: number }) => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });

describe('pinchStep', () => {
  it('zooms by the change in finger distance around their midpoint', () => {
    const a0 = { x: 200, y: 200 };
    const b0 = { x: 300, y: 200 };
    const next = pinchStep(view, a0, b0, { x: 150, y: 200 }, { x: 350, y: 200 });
    expect(next.zoom).toBeCloseTo(4);
    // The image point under the midpoint (250, 200) stays there.
    expect(imageAt(next, { x: 250, y: 200 })).toEqual(imageAt(view, { x: 250, y: 200 }));
  });

  it('pans when both fingers move together', () => {
    const next = pinchStep(view, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 20 }, { x: 40, y: 20 });
    expect(next).toEqual({ x: 130, y: 70, zoom: 2 });
  });

  it('keeps the point under the fingers while zooming and moving at once', () => {
    const a0 = { x: 100, y: 100 };
    const b0 = { x: 200, y: 200 };
    const a1 = { x: 120, y: 90 };
    const b1 = { x: 320, y: 290 };
    const next = pinchStep(view, a0, b0, a1, b1);
    const before = imageAt(view, { x: 150, y: 150 });
    const after = imageAt(next, { x: 220, y: 190 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps the zoom and ignores fingers on the same spot', () => {
    expect(pinchStep({ ...view, zoom: 60 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(pinchStep(view, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 9, y: 9 }).zoom).toBe(2);
  });
});
