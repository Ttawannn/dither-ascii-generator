/**
 * Nearest-colour matching for `set` palettes. The default distance is weighted RGB; perceptual
 * matching compares colours in OKLab instead. dither.frag has the same two distances; keep them
 * in sync.
 */

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (0..1) → OKLab, written into `out` at `o`. */
export function oklabInto(r: number, g: number, b: number, out: Float32Array | number[], o = 0): void {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/** Flat OKLab copy of a flat RGB palette. */
export function paletteLab(colors: ArrayLike<number>): Float32Array {
  const out = new Float32Array(colors.length);
  for (let i = 0; i < colors.length; i += 3) oklabInto(colors[i], colors[i + 1], colors[i + 2], out, i);
  return out;
}

const tmp = new Float32Array(3);

/**
 * Index of the palette colour nearest to (r, g, b), all 0..1. With `lab` (from paletteLab) the
 * distance is perceptual; without it, RGB weighted 2:4:3.
 */
export function nearestIndex(colors: ArrayLike<number>, lab: Float32Array | null, r: number, g: number, b: number): number {
  let best = Infinity;
  let at = 0;
  if (lab) {
    oklabInto(r, g, b, tmp);
    for (let i = 0; i < lab.length; i += 3) {
      const dl = tmp[0] - lab[i];
      const da = tmp[1] - lab[i + 1];
      const db = tmp[2] - lab[i + 2];
      const e = dl * dl + da * da + db * db;
      if (e < best) {
        best = e;
        at = i / 3;
      }
    }
    return at;
  }
  for (let i = 0; i < colors.length; i += 3) {
    const dr = r - colors[i];
    const dg = g - colors[i + 1];
    const db = b - colors[i + 2];
    const e = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (e < best) {
      best = e;
      at = i / 3;
    }
  }
  return at;
}
