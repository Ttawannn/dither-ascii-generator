import { describe, expect, it } from 'vitest';
import { stipple, type StippleJob } from './stipple';
import { stippleSvg } from '../export/stipple-svg';
const job = (v = 64): StippleJob => ({
  width: 40,
  height: 32,
  data: Uint8Array.from({ length: 40 * 32 * 4 }, (_, i) => (i % 4 === 3 ? 255 : v)),
  count: 150,
  iterations: 3,
  size: 100,
  seed: 2,
});
describe('weighted stippling', () => {
  it('is seeded, finite, bounded and reports progress', () => {
    const progress: number[] = [];
    const a = stipple(job(), (v) => progress.push(v));
    expect(a.points).toEqual(stipple(job()).points);
    expect(a.points).not.toEqual(stipple({ ...job(), seed: 3 }).points);
    expect(a.points.length).toBe(450);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    for (let i = 0; i < a.points.length; i += 3) {
      expect(a.points[i]).toBeGreaterThanOrEqual(0);
      expect(a.points[i]).toBeLessThan(40);
      expect(a.points[i + 1]).toBeLessThan(32);
      expect(a.points[i + 2]).toBeGreaterThan(0);
    }
  });
  it('returns no points for a white image', () => expect(stipple(job(255)).points.length).toBe(0));
  it('puts dots only in the dark half and honours visual row order', () => {
    const j = job(255);
    for (let y = 16; y < 32; y++) for (let x = 0; x < 40; x++) j.data.set([0, 0, 0, 255], (y * 40 + x) * 4);
    const a = stipple(j);
    for (let i = 0; i < a.points.length; i += 3) expect(a.points[i + 1]).toBeLessThan(16);
  });
  it('increases dot radius with darkness and size', () => {
    const radius = (j: StippleJob) => stipple(j).points[2];
    expect(radius(job(0))).toBeGreaterThan(radius(job(180)));
    expect(radius({ ...job(), size: 200 })).toBeCloseTo(radius(job()) * 2);
  });
  it('exports the exact points as clipped vector circles with print dimensions', () => {
    const a = stipple(job());
    const svg = stippleSvg(a, '#112233', '#ffffff', 2, { width: '50mm', height: '40mm' });
    expect(svg.match(/<circle /g)?.length).toBe(a.points.length / 3);
    expect(svg).toContain('width="50mm"');
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('clip-path="url(#frame)"');
  });
});
