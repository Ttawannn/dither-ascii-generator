import { linearPalette, linearToSrgb, srgbToLinear } from './color-space';
import { nearestIndex, paletteLab } from './oklab';

/** Sixteen error-feedback candidates, sorted by luminance before threshold-map selection. */
export function patternCandidates(
  colors: Float32Array,
  target: number[],
  perceptual = false,
  linear = false,
): number[] {
  const pal = linear ? linearPalette(colors) : colors;
  const c = target.map((v) => (linear ? srgbToLinear(v) : v));
  const err = [0, 0, 0];
  const lab = perceptual ? paletteLab(colors) : null;
  const candidates: number[] = [];
  for (let k = 0; k < 16; k++) {
    const t = c.map((v, j) => (perceptual ? Math.min(1, Math.max(0, v + err[j])) : v + err[j]));
    const match = linear && perceptual ? t.map(linearToSrgb) : t;
    const i = nearestIndex(perceptual ? colors : pal, lab, match[0], match[1], match[2]);
    candidates.push(i);
    for (let j = 0; j < 3; j++) err[j] += c[j] - pal[i * 3 + j];
  }
  const luma = (i: number) => pal[i * 3] * 0.2126 + pal[i * 3 + 1] * 0.7152 + pal[i * 3 + 2] * 0.0722;
  return candidates.sort((a, b) => luma(a) - luma(b));
}
