import { axisKernel, edgeShares, gaussianKernel, KERNELS, type Kernel, type KernelShape } from './algorithms';
import { OSTROMOUKHOV } from './ostromoukhov';
import { advancedDiffuse } from './advanced-diffuse';
import { linearPalette, linearToSrgb, srgbToLinear } from './color-space';
import { nearestIndex, paletteLab } from './oklab';
import type { PaletteKind } from './palettes';

export interface DiffusionJob {
  id: number;
  width: number;
  height: number;
  /** RGBA, bottom row first (WebGL readPixels layout). */
  data: Uint8Array;
  kernel: string;
  serpentine: boolean;
  strength: number; // 0..1
  kind: PaletteKind;
  colors: Float32Array; // flat RGB 0..1
  levels: number;
  /** Nearest colour in OKLab instead of weighted RGB (`set` palettes only). */
  perceptual?: boolean;
  linearLight?: boolean;
  /** Per-pixel input jitter amplitude (0 = none); used for the boil animation. */
  noise: number;
  /** 64×64 blue-noise tile to take the jitter from instead of white noise. */
  noiseTile?: Uint8Array | null;
  /**
   * Wave diffusion: a sine added to the quantisation threshold along visual rows.
   * [strength 0..1 (±0.5 at 1), wavelength in pixels, bias −1..1 (tilt per pixel along x),
   *  follow 0..1 (optional): how far smoothed brightness shifts the wave, so lines bend along the image].
   */
  wave?: [number, number, number, number?] | null;
  /** Settings for Gaussian, Edge-directed and Single-axis. */
  shape?: KernelShape;
  seed: number;
}

export interface DiffusionResult {
  id: number;
  width: number;
  height: number;
  data: Uint8Array;
  /** Processing time in the worker. */
  ms: number;
}

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/** Wavelengths the wave can shift between black and white when following the image fully. */
const FOLLOW_WAVES = 2;

/**
 * Luminance (0..1) of RGBA pixels, box-blurred with radius r in both directions (edges clamped).
 * Same buffer layout as the input.
 */
export function smoothLuma(data: Uint8Array, w: number, h: number, r: number): Float32Array {
  const n = w * h;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (LR * data[i * 4] + LG * data[i * 4 + 1] + LB * data[i * 4 + 2]) / 255;
  const b = new Float32Array(n);
  const pass = (
    src: Float32Array,
    dst: Float32Array,
    len: number,
    lines: number,
    at: (line: number, k: number) => number,
  ) => {
    const span = 2 * r + 1;
    for (let line = 0; line < lines; line++) {
      const get = (k: number) => src[at(line, Math.min(len - 1, Math.max(0, k)))];
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += get(k);
      for (let k = 0; k < len; k++) {
        dst[at(line, k)] = sum / span;
        sum += get(k + r + 1) - get(k - r);
      }
    }
  };
  pass(a, b, w, h, (y, x) => y * w + x);
  pass(b, a, h, w, (x, y) => y * w + x);
  return a;
}

const DEFAULT_SHAPE: KernelShape = { sigma: 1.5, noise: 0, crack: 0.5, vertical: false, bleed: 0, smooth: 0 };

/** A 32-bit integer hash to 0..1 (for noise that is the same every time for a seed). */
function hash01(n: number): number {
  let h = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Error-diffuse one frame. Pure function, shared by the worker and the tests. */
export function diffuse(job: DiffusionJob): Uint8Array {
  if (job.kernel === 'riemersma' || job.kernel === 'dot-diffusion') return advancedDiffuse(job);
  const { width: w, height: h, data, kind, colors, strength } = job;
  const variable = job.kernel === 'ostromoukhov';
  const shape = job.shape ?? DEFAULT_SHAPE;
  const edge = job.kernel === 'edge-diffusion';
  // Edge-directed and Single-axis follow fixed directions, so they never alternate the row order.
  const serpentine = job.serpentine && !edge && job.kernel !== 'axis';
  let kernel: Kernel =
    KERNELS[job.kernel] ??
    (job.kernel === 'gaussian' ? gaussianKernel(shape.sigma) : job.kernel === 'axis' ? axisKernel(shape) : KERNELS['floyd-steinberg']);
  const edgeKernel: Kernel = [[1, 0, 0], [0, 1, 0]];
  const luma = edge ? smoothLuma(data, w, h, 0) : null;
  const gaussNoise = job.kernel === 'gaussian' ? shape.noise * 0.25 : 0;
  const linear = !!job.linearLight;
  const pal = linear ? linearPalette(colors) : colors;
  const convert = (v: number) => (linear ? srgbToLinear(Math.min(1, Math.max(0, v))) : v);
  const n = w * h;
  const out = new Uint8Array(n * 4);
  const ch = kind === 'ramp' ? 1 : 3;
  const buf = new Float32Array(n * ch);

  let rng = (job.seed * 2654435761) >>> 0 || 1;
  const tile = job.noiseTile;
  const tx = (job.seed * 29) & 63;
  const ty = (job.seed * 47) & 63;
  const jitter = (i: number) => {
    if (tile) return (tile[((((i / w) | 0) + ty) & 63) * 64 + (((i % w) + tx) & 63)] / 255 - 0.5) * job.noise;
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return ((rng >>> 0) / 4294967296 - 0.5) * job.noise;
  };

  for (let i = 0; i < n; i++) {
    const j = job.noise ? jitter(i) : 0;
    const r = convert(data[i * 4] / 255 + j);
    const g = convert(data[i * 4 + 1] / 255 + j);
    const b = convert(data[i * 4 + 2] / 255 + j);
    if (ch === 1) buf[i] = LR * r + LG * g + LB * b;
    else {
      buf[i * 3] = r;
      buf[i * 3 + 1] = g;
      buf[i * 3 + 2] = b;
    }
  }

  const palSize = colors.length / 3;
  const rampLuma =
    linear && kind === 'ramp'
      ? Array.from({ length: palSize }, (_, i) => LR * pal[i * 3] + LG * pal[i * 3 + 1] + LB * pal[i * 3 + 2])
      : null;
  const [waveAmp, waveLen, waveBias, waveFollow = 0] = job.wave ?? [0, 1, 0];
  const waveK = (2 * Math.PI) / Math.max(1, waveLen);
  const wavePhase = job.seed * 1.7; // boil moves the waves
  // Follow: brightness, smoothed over about one wavelength, pushes the wave by up to FOLLOW_WAVES
  // wavelengths, so lines shift where the image changes and trace its shapes.
  const follow = waveAmp && waveFollow ? smoothLuma(data, w, h, Math.max(1, Math.round(waveLen))) : null;
  const followK = waveFollow * FOLLOW_WAVES * 2 * Math.PI;
  const lab = kind === 'set' && job.perceptual ? paletteLab(colors) : null;
  const steps = job.levels - 1;
  const q = [0, 0, 0];
  const err = [0, 0, 0];

  // Walk in visual order (top row first). Buffer rows are bottom-up, so visual row vy is buffer row h-1-vy.
  for (let vy = 0; vy < h; vy++) {
    const row = h - 1 - vy;
    const reverse = (serpentine || variable) && (vy & 1) === 1;
    for (let k = 0; k < w; k++) {
      const x = reverse ? w - 1 - k : k;
      const i = row * w + x;
      if (variable) {
        const level = Math.round(LR * data[i * 4] + LG * data[i * 4 + 1] + LB * data[i * 4 + 2]);
        kernel = OSTROMOUKHOV[level];
      }
      if (luma) {
        // Brightness differences across the pixel, in visual rows (buffer rows run bottom-up).
        const at = (xx: number, yy: number) => luma[(h - 1 - Math.min(h - 1, Math.max(0, yy))) * w + Math.min(w - 1, Math.max(0, xx))];
        const [right, down] = edgeShares(Math.abs(at(x + 1, vy) - at(x - 1, vy)), Math.abs(at(x, vy + 1) - at(x, vy - 1)), shape.crack);
        edgeKernel[0][2] = right;
        edgeKernel[1][2] = down;
        kernel = edgeKernel;
      }
      let ci = 0; // palette index for output colour (ramp/set)
      // Threshold modulation: the wave shifts which level is picked, the error still uses the true value.
      const bend = follow ? follow[i] * followK : 0;
      let m = waveAmp ? 0.5 * waveAmp * Math.sin((vy + waveBias * x) * waveK + wavePhase + bend) : 0;
      if (gaussNoise) {
        // Gaussian threshold noise (Box–Muller), fixed per pixel and seed.
        const u1 = Math.max(1e-9, hash01(Math.imul(i, 2) + job.seed * 7919));
        const u2 = hash01(Math.imul(i, 2) + 1 + job.seed * 7919);
        m += gaussNoise * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }

      if (ch === 1) {
        const v = Math.min(1, Math.max(0, buf[i]));
        ci = Math.min(palSize - 1, Math.max(0, Math.round((v + m) * (palSize - 1))));
        if (rampLuma)
          ci = rampLuma.reduce((best, l, i) => (Math.abs(l - v - m) < Math.abs(rampLuma[best] - v - m) ? i : best), 0);
        err[0] = (v - (rampLuma ? rampLuma[ci] : ci / (palSize - 1))) * strength;
      } else {
        const r = Math.min(1, Math.max(0, buf[i * 3]));
        const g = Math.min(1, Math.max(0, buf[i * 3 + 1]));
        const b = Math.min(1, Math.max(0, buf[i * 3 + 2]));
        if (kind === 'rgb') {
          q[0] = Math.min(1, Math.max(0, Math.round((r + m) * steps) / steps));
          q[1] = Math.min(1, Math.max(0, Math.round((g + m) * steps) / steps));
          q[2] = Math.min(1, Math.max(0, Math.round((b + m) * steps) / steps));
        } else {
          ci =
            linear && lab
              ? nearestIndex(
                  colors,
                  lab,
                  linearToSrgb(Math.max(0, r + m)),
                  linearToSrgb(Math.max(0, g + m)),
                  linearToSrgb(Math.max(0, b + m)),
                )
              : nearestIndex(pal, lab, r + m, g + m, b + m);
          q[0] = pal[ci * 3];
          q[1] = pal[ci * 3 + 1];
          q[2] = pal[ci * 3 + 2];
        }
        err[0] = (r - q[0]) * strength;
        err[1] = (g - q[1]) * strength;
        err[2] = (b - q[2]) * strength;
      }

      for (const [kdx, dy, wgt] of kernel) {
        const nx = x + (reverse ? -kdx : kdx);
        const nvy = vy + dy;
        if (nx < 0 || nx >= w || nvy >= h) continue;
        const j = (h - 1 - nvy) * w + nx;
        if (ch === 1) buf[j] += err[0] * wgt;
        else {
          buf[j * 3] += err[0] * wgt;
          buf[j * 3 + 1] += err[1] * wgt;
          buf[j * 3 + 2] += err[2] * wgt;
        }
      }

      const o = i * 4;
      if (kind === 'rgb') {
        out[o] = (linear ? linearToSrgb(q[0]) : q[0]) * 255 + 0.5;
        out[o + 1] = (linear ? linearToSrgb(q[1]) : q[1]) * 255 + 0.5;
        out[o + 2] = (linear ? linearToSrgb(q[2]) : q[2]) * 255 + 0.5;
      } else {
        out[o] = colors[ci * 3] * 255 + 0.5;
        out[o + 1] = colors[ci * 3 + 1] * 255 + 0.5;
        out[o + 2] = colors[ci * 3 + 2] * 255 + 0.5;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
