import { KERNELS } from './algorithms';
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

function diffuse(job: DiffusionJob): Uint8Array {
  const { width: w, height: h, data, kind, colors, strength } = job;
  const kernel = KERNELS[job.kernel] ?? KERNELS['floyd-steinberg'];
  const n = w * h;
  const out = new Uint8Array(n * 4);
  const ch = kind === 'ramp' ? 1 : 3;
  const buf = new Float32Array(n * ch);

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    if (ch === 1) buf[i] = LR * r + LG * g + LB * b;
    else {
      buf[i * 3] = r;
      buf[i * 3 + 1] = g;
      buf[i * 3 + 2] = b;
    }
  }

  const palSize = colors.length / 3;
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

      if (ch === 1) {
        const v = Math.min(1, Math.max(0, buf[i]));
        ci = Math.min(palSize - 1, Math.max(0, Math.round(v * (palSize - 1))));
        err[0] = (v - ci / (palSize - 1)) * strength;
      } else {
        const r = Math.min(1, Math.max(0, buf[i * 3]));
        const g = Math.min(1, Math.max(0, buf[i * 3 + 1]));
        const b = Math.min(1, Math.max(0, buf[i * 3 + 2]));
        if (kind === 'rgb') {
          q[0] = Math.round(r * steps) / steps;
          q[1] = Math.round(g * steps) / steps;
          q[2] = Math.round(b * steps) / steps;
        } else {
          let best = Infinity;
          for (let p = 0; p < palSize; p++) {
            const dr = r - colors[p * 3];
            const dg = g - colors[p * 3 + 1];
            const db = b - colors[p * 3 + 2];
            const e = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
            if (e < best) {
              best = e;
              ci = p;
            }
          }
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

self.onmessage = (e: MessageEvent<DiffusionJob>) => {
  const job = e.data;
  const t0 = performance.now();
  const data = diffuse(job);
  const ms = performance.now() - t0;
  const result: DiffusionResult = { id: job.id, width: job.width, height: job.height, data, ms };
  (self as unknown as Worker).postMessage(result, [data.buffer]);
};
