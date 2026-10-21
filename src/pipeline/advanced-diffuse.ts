import type { DiffusionJob } from './diffuse';
import { linearPalette, linearToSrgb, srgbToLinear } from './color-space';
import { nearestIndex, paletteLab } from './oklab';

/** Knuth's 8×8 class matrix, in visual (top-down) order. */
export const DOT_CLASSES = [
  34, 48, 40, 32, 29, 15, 23, 31, 42, 58, 56, 53, 21, 5, 7, 10, 50, 62, 61, 45, 13, 1, 2, 18, 38, 46, 54, 37, 25, 17, 9,
  26, 28, 14, 22, 30, 35, 49, 41, 33, 20, 4, 6, 11, 43, 59, 57, 52, 12, 0, 3, 19, 51, 63, 60, 44, 24, 16, 8, 27, 39, 47,
  55, 36,
];

/** Padded Hilbert curve, clipped to the rectangle. Callback coordinates are visual, top-down. */
export function walkHilbert(w: number, h: number, visit: (x: number, y: number) => void): void {
  let n = 1;
  while (n < Math.max(w, h)) n *= 2;
  // Recursion prunes quadrants outside skinny rectangles instead of walking the whole padded square.
  const walk = (x0: number, y0: number, xi: number, xj: number, yi: number, yj: number, size: number): void => {
    const xs = [x0, x0 + xi, x0 + yi, x0 + xi + yi];
    const ys = [y0, y0 + xj, y0 + yj, y0 + xj + yj];
    if (Math.max(...xs) <= 0 || Math.max(...ys) <= 0 || Math.min(...xs) >= w || Math.min(...ys) >= h) return;
    if (size === 1) {
      const x = Math.floor(x0 + (xi + yi) / 2),
        y = Math.floor(y0 + (xj + yj) / 2);
      if (x >= 0 && y >= 0 && x < w && y < h) visit(x, y);
      return;
    }
    walk(x0, y0, yi / 2, yj / 2, xi / 2, xj / 2, size / 2);
    walk(x0 + xi / 2, y0 + xj / 2, xi / 2, xj / 2, yi / 2, yj / 2, size / 2);
    walk(x0 + xi / 2 + yi / 2, y0 + xj / 2 + yj / 2, xi / 2, xj / 2, yi / 2, yj / 2, size / 2);
    walk(x0 + xi / 2 + yi, y0 + xj / 2 + yj, -yi / 2, -yj / 2, -xi / 2, -xj / 2, size / 2);
  };
  if (w > 0 && h > 0) walk(0, 0, n, 0, 0, n, n);
}

/** Shared quantisation for the two non-raster traversals. Output stays in the original palette. */
export function advancedDiffuse(job: DiffusionJob): Uint8Array {
  const { width: w, height: h, colors, kind } = job;
  const linear = !!job.linearLight;
  const pal = linear ? linearPalette(colors) : colors;
  const lab = job.perceptual && kind === 'set' ? paletteLab(colors) : null;
  const n = w * h;
  const ch = kind === 'ramp' ? 1 : 3;
  const buf = new Float32Array(n * ch);
  const out = new Uint8Array(n * 4);
  const q = [0, 0, 0],
    err = [0, 0, 0];
  const rampLuma =
    linear && kind === 'ramp'
      ? Array.from(
          { length: colors.length / 3 },
          (_, i) => 0.2126 * pal[i * 3] + 0.7152 * pal[i * 3 + 1] + 0.0722 * pal[i * 3 + 2],
        )
      : null;
  let rng = (job.seed * 2654435761) >>> 0 || 1;
  const convert = (v: number) => (linear ? srgbToLinear(v) : v);
  for (let i = 0; i < n; i++) {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    const tile = job.noiseTile;
    const noise =
      job.noise *
      ((tile
        ? tile[((((i / w) | 0) + job.seed * 47) & 63) * 64 + (((i % w) + job.seed * 29) & 63)] / 255
        : (rng >>> 0) / 4294967296) -
        0.5);
    const r = convert(job.data[i * 4] / 255),
      g = convert(job.data[i * 4 + 1] / 255),
      b = convert(job.data[i * 4 + 2] / 255);
    if (ch === 1) buf[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b + noise;
    else {
      buf[i * 3] = r + noise;
      buf[i * 3 + 1] = g + noise;
      buf[i * 3 + 2] = b + noise;
    }
  }
  const quantize = (i: number, correction?: number[]) => {
    const v = [0, 0, 0];
    for (let c = 0; c < ch; c++) v[c] = Math.min(1, Math.max(0, buf[i * ch + c] + (correction?.[c] ?? 0)));
    let ci = 0;
    if (kind === 'ramp') {
      ci = Math.min(colors.length / 3 - 1, Math.max(0, Math.round(v[0] * (colors.length / 3 - 1))));
      if (rampLuma)
        ci = rampLuma.reduce((best, l, i) => (Math.abs(l - v[0]) < Math.abs(rampLuma[best] - v[0]) ? i : best), 0);
      q[0] = rampLuma ? rampLuma[ci] : ci / (colors.length / 3 - 1);
    } else if (kind === 'rgb') {
      for (let c = 0; c < 3; c++) q[c] = Math.round(v[c] * (job.levels - 1)) / (job.levels - 1);
    } else {
      const match = linear && lab ? v.map(linearToSrgb) : v;
      ci = nearestIndex(lab ? colors : pal, lab, match[0], match[1], match[2]);
      for (let c = 0; c < 3; c++) q[c] = pal[ci * 3 + c];
    }
    for (let c = 0; c < ch; c++) err[c] = (v[c] - q[c]) * job.strength;
    for (let c = 0; c < 3; c++)
      out[i * 4 + c] = (kind === 'rgb' ? (linear ? linearToSrgb(q[c]) : q[c]) : colors[ci * 3 + c]) * 255 + 0.5;
    out[i * 4 + 3] = 255;
  };
  if (job.kernel === 'riemersma') {
    const history = new Float32Array(16 * ch);
    const weights = Array.from({ length: 16 }, (_, i) => 16 ** (-i / 15));
    const correction = [0, 0, 0];
    let head = 0,
      lastX = -1,
      lastY = -1;
    walkHilbert(w, h, (x, y) => {
      if (lastX >= 0 && Math.abs(x - lastX) + Math.abs(y - lastY) !== 1) history.fill(0);
      correction.fill(0);
      for (let k = 0; k < 16; k++)
        for (let c = 0; c < ch; c++) correction[c] += history[((head - 1 - k + 32) % 16) * ch + c] * weights[k];
      const i = (h - 1 - y) * w + x;
      quantize(i, correction);
      // Store source minus quantised, not corrected minus quantised (avoids counting history twice).
      for (let c = 0; c < ch; c++) history[head * ch + c] = (buf[i * ch + c] - q[c]) * job.strength;
      head = (head + 1) % 16;
      lastX = x;
      lastY = y;
    });
  } else {
    const positions = new Int8Array(128);
    DOT_CLASSES.forEach((v, i) => {
      positions[v * 2] = i % 8;
      positions[v * 2 + 1] = i >> 3;
    });
    const cls = (x: number, y: number) => DOT_CLASSES[(y & 7) * 8 + (x & 7)];
    for (let rank = 0; rank < 64; rank++) {
      for (let y = positions[rank * 2 + 1]; y < h; y += 8)
        for (let x = positions[rank * 2]; x < w; x += 8) {
          const i = (h - 1 - y) * w + x;
          quantize(i);
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx,
                yy = y + dy;
              if (xx >= 0 && xx < w && yy >= 0 && yy < h && cls(xx, yy) > rank) sum += dx && dy ? 1 : 2;
            }
          if (!sum) continue;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx,
                yy = y + dy;
              if (xx < 0 || xx >= w || yy < 0 || yy >= h || cls(xx, yy) <= rank) continue;
              const j = (h - 1 - yy) * w + xx,
                weight = (dx && dy ? 1 : 2) / sum;
              for (let c = 0; c < ch; c++) buf[j * ch + c] += err[c] * weight;
            }
        }
    }
  }
  return out;
}
