import { describe, expect, it } from 'vitest';
import { analyseLevels, fft, LEVEL_RATE, levelAt } from './audio-levels';

const RATE = 44100;
const tone = (hz: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));

describe('fft', () => {
  it('puts a pure cosine in its bin', () => {
    const n = 64;
    const re = Float32Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n));
    const im = new Float32Array(n);
    fft(re, im);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]));
    expect(mag[5]).toBeCloseTo(n / 2, 3);
    expect(mag[59]).toBeCloseTo(n / 2, 3);
    expect(Math.max(...mag.filter((_, i) => i !== 5 && i !== 59))).toBeLessThan(1e-3);
  });
});

describe('analyseLevels', () => {
  it('gives one value per frame at LEVEL_RATE', () => {
    expect(analyseLevels(tone(100, 1), RATE).bass.length).toBe(LEVEL_RATE);
  });

  it('separates bass from highs', () => {
    const low = analyseLevels(tone(100, 0.5), RATE);
    const high = analyseLevels(tone(4000, 0.5), RATE);
    const f = LEVEL_RATE / 4; // well inside the sound
    expect(low.bass[f]).toBeGreaterThan(0.5);
    expect(low.bass[f]).toBeGreaterThan(low.high[f] + 0.3);
    expect(high.high[f]).toBeGreaterThan(high.bass[f] + 0.3);
  });

  it('is silent for silence', () => {
    const quiet = analyseLevels(new Float32Array(RATE / 2), RATE);
    expect(Math.max(...quiet.bass, ...quiet.mid, ...quiet.high)).toBe(0);
  });
});

describe('levelAt', () => {
  const series = Float32Array.from({ length: 120 }, (_, i) => (i < 60 ? 0 : 1));
  it('reads one frame without smoothing', () => {
    expect(levelAt(series, 0.5, 0)).toBe(0);
    expect(levelAt(series, 1.5, 0)).toBe(1);
  });
  it('averages the window that ends at t', () => {
    expect(levelAt(series, 1.5, 1)).toBeCloseTo(31 / 61, 5); // frames 30..90, 31 of them loud
  });
  it('clamps past the ends', () => {
    expect(levelAt(series, 99, 0)).toBe(1);
    expect(levelAt(series, -1, 0)).toBe(0);
    expect(levelAt(new Float32Array(), 0, 0)).toBe(0);
  });
});
