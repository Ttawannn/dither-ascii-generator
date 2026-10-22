/**
 * The Tint blend of `post.frag` on straight RGB in 0..1, one mode per TINT_MODES entry (same order).
 * The shader is the one that renders; this copy exists so the formulas can be tested.
 */
export type RGB = [number, number, number];

const LUMA: RGB = [0.2126, 0.7152, 0.0722];
const lum = (c: RGB) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
const sat = (c: RGB) => Math.max(...c) - Math.min(...c);
const map = (a: RGB, b: RGB, f: (x: number, y: number) => number): RGB => [f(a[0], b[0]), f(a[1], b[1]), f(a[2], b[2])];

/** Give `c` the luminance `l`, pulling it back into gamut without changing hue. */
export function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  let r: RGB = [c[0] + d, c[1] + d, c[2] + d];
  const L = lum(r);
  const lo = Math.min(...r);
  const hi = Math.max(...r);
  if (lo < 0) r = r.map((x) => L + ((x - L) * L) / Math.max(L - lo, 1e-5)) as RGB;
  if (hi > 1) r = r.map((x) => L + ((x - L) * (1 - L)) / Math.max(hi - L, 1e-5)) as RGB;
  return r;
}

/** Give `c` the saturation (max − min) `s`, keeping the order of its channels. */
export function setSat(c: RGB, s: number): RGB {
  const lo = Math.min(...c);
  const range = sat(c);
  return range > 1e-5 ? (c.map((x) => ((x - lo) * s) / range) as RGB) : [0, 0, 0];
}

const overlay = (b: number, t: number) => (b < 0.5 ? 2 * b * t : 1 - 2 * (1 - b) * (1 - t));

export function blend(b: RGB, t: RGB, mode: number): RGB {
  switch (mode) {
    case 0: return map(b, t, (x, y) => x * y);
    case 1: return map(b, t, (x, y) => 1 - (1 - x) * (1 - y));
    case 2: return map(b, t, overlay);
    case 3: return map(b, t, (x, y) => (y < 0.5 ? x - (1 - 2 * y) * x * (1 - x) : x + (2 * y - 1) * (Math.sqrt(x) - x)));
    case 4: return setLum(t, lum(b));
    case 5: return map(b, t, (x, y) => 1 - Math.min(1, (1 - x) / Math.max(y, 1e-3)));
    case 6: return map(b, t, (x, y) => overlay(y, x));
    case 7: return map(b, t, (x, y) => Math.abs(x - y));
    case 8: return map(b, t, (x, y) => x + y - 2 * x * y);
    case 9: return map(b, t, Math.max);
    case 10: return map(b, t, Math.min);
    case 11: return map(b, t, (x, y) => Math.min(1, x / Math.max(1 - y, 1e-3)));
    case 12: return setLum(setSat(t, sat(b)), lum(b));
    case 13: return setLum(setSat(b, sat(t)), lum(b));
    case 14: return setLum(b, lum(t));
    default: return [...t];
  }
}
