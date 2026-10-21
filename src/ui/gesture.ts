/** Two-finger zoom and pan for the viewer, as a pure step so it can be tested. */

export interface Point {
  x: number;
  y: number;
}
/** Viewer state: image offset in the stage and zoom. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The view after two fingers move from (a0, b0) to (a1, b1): zoom follows the change in their
 * distance, and the image point that was between the fingers stays between them.
 */
export function pinchStep(view: View, a0: Point, b0: Point, a1: Point, b1: Point): View {
  const d0 = dist(a0, b0);
  const ratio = d0 > 0 ? dist(a1, b1) / d0 : 1;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * ratio));
  const m0 = mid(a0, b0);
  const m1 = mid(a1, b1);
  const k = zoom / view.zoom;
  return { x: m1.x - (m0.x - view.x) * k, y: m1.y - (m0.y - view.y) * k, zoom };
}
