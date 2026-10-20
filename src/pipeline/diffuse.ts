import { KERNELS } from './algorithms';
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
  const pass = (src: Float32Array, dst: Float32Array, len: number, lines: number, at: (line: number, k: number) => number) => {
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

/** Error-diffuse one frame. Pure function, shared by the worker and the tests. */
export function diffuse(job: DiffusionJob): Uint8Array {
  const { width: w, height: h, data, kind, colors, strength } = job;
  const kernel = KERNELS[job.kernel] ?? KERNELS['floyd-steinberg'];
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
    const r = data[i * 4] / 255 + j;
    const g = data[i * 4 + 1] / 255 + j;
    const b = data[i * 4 + 2] / 255 + j;
    if (ch === 1) buf[i] = LR * r + LG * g + LB * b;
    else {
      buf[i * 3] = r;
      buf[i * 3 + 1] = g;
      buf[i * 3 + 2] = b;
    }
  }

  const palSize = colors.length / 3;
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
    const reverse = job.serpentine && (vy & 1) === 1;
    for (let k = 0; k < w; k++) {
      const x = reverse ? w - 1 - k : k;
      const i = row * w + x;
      let ci = 0; // palette index for output colour (ramp/set)
      // Threshold modulation: the wave shifts which level is picked, the error still uses the true value.
      const bend = follow ? follow[i] * followK : 0;
      const m = waveAmp ? 0.5 * waveAmp * Math.sin((vy + waveBias * x) * waveK + wavePhase + bend) : 0;

      if (ch === 1) {
        const v = Math.min(1, Math.max(0, buf[i]));
        ci = Math.min(palSize - 1, Math.max(0, Math.round((v + m) * (palSize - 1))));
        err[0] = (v - ci / (palSize - 1)) * strength;
      } else {
        const r = Math.min(1, Math.max(0, buf[i * 3]));
        const g = Math.min(1, Math.max(0, buf[i * 3 + 1]));
        const b = Math.min(1, Math.max(0, buf[i * 3 + 2]));
        if (kind === 'rgb') {
          q[0] = Math.min(1, Math.max(0, Math.round((r + m) * steps) / steps));
          q[1] = Math.min(1, Math.max(0, Math.round((g + m) * steps) / steps));
          q[2] = Math.min(1, Math.max(0, Math.round((b + m) * steps) / steps));
        } else {
          ci = nearestIndex(colors, lab, r + m, g + m, b + m);
          q[0] = colors[ci * 3];
          q[1] = colors[ci * 3 + 1];
          q[2] = colors[ci * 3 + 2];
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
        out[o] = q[0] * 255 + 0.5;
        out[o + 1] = q[1] * 255 + 0.5;
        out[o + 2] = q[2] * 255 + 0.5;
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
