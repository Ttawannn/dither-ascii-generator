/**
 * Loudness of three frequency bands, for audio-reactive animation lanes. An audio file is analysed
 * once up front (so exports are the same every time); the microphone is read live from an
 * AnalyserNode. Both map band magnitude in dB onto 0..1 the same way.
 */

export const BANDS = {
  bass: [20, 250],
  mid: [250, 2000],
  high: [2000, 8000],
} as const;
export type Band = keyof typeof BANDS;
export const BAND_IDS = Object.keys(BANDS) as Band[];

/** Analysis frames per second for audio files. */
export const LEVEL_RATE = 60;
/** dB range mapped onto 0..1 (an AnalyserNode's default min / max decibels). */
const DB_MIN = -90;
const DB_MAX = -20;
const WINDOW = 2048;

const toLevel = (db: number) => Math.min(1, Math.max(0, (db - DB_MIN) / (DB_MAX - DB_MIN)));

/** In-place radix-2 FFT; `re` and `im` have the same power-of-two length. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** Band levels from per-bin magnitudes in dB (as AnalyserNode.getFloatFrequencyData gives them). */
export function levelsFromDb(db: ArrayLike<number>, sampleRate: number, fftSize: number): Record<Band, number> {
  const out = {} as Record<Band, number>;
  const hz = sampleRate / fftSize;
  for (const band of BAND_IDS) {
    const [lo, hi] = BANDS[band];
    let sum = 0;
    let n = 0;
    for (let k = Math.max(1, Math.floor(lo / hz)); k <= Math.min(db.length - 1, Math.ceil(hi / hz)); k++) {
      sum += 10 ** (db[k] / 20); // average in linear magnitude, then back to dB
      n++;
    }
    out[band] = n ? toLevel(20 * Math.log10(sum / n + 1e-12)) : 0;
  }
  return out;
}

/** Analyse mono samples: band levels at LEVEL_RATE frames per second (Hann-windowed FFT of 2048). */
export function analyseLevels(samples: Float32Array, sampleRate: number): Record<Band, Float32Array> {
  const frames = Math.max(1, Math.ceil((samples.length / sampleRate) * LEVEL_RATE));
  const out = Object.fromEntries(BAND_IDS.map((b) => [b, new Float32Array(frames)])) as Record<Band, Float32Array>;
  const re = new Float32Array(WINDOW);
  const im = new Float32Array(WINDOW);
  const db = new Float32Array(WINDOW / 2);
  for (let f = 0; f < frames; f++) {
    const end = Math.round((f / LEVEL_RATE) * sampleRate);
    const start = end - WINDOW;
    for (let i = 0; i < WINDOW; i++) {
      const s = start + i;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1));
      re[i] = s >= 0 && s < samples.length ? samples[s] * w : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < WINDOW / 2; k++) db[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / WINDOW + 1e-12);
    const levels = levelsFromDb(db, sampleRate, WINDOW);
    for (const b of BAND_IDS) out[b][f] = levels[b];
  }
  return out;
}

/** Average of an analysed series over the `window` seconds ending at time `t` (a single frame when 0). */
export function levelAt(series: Float32Array, t: number, window: number): number {
  if (!series.length) return 0;
  const last = Math.min(series.length - 1, Math.max(0, Math.round(t * LEVEL_RATE)));
  const first = Math.max(0, last - Math.round(window * LEVEL_RATE));
  let sum = 0;
  for (let i = first; i <= last; i++) sum += series[i];
  return sum / (last - first + 1);
}
