import { describe, expect, it } from 'vitest';
import { cmykHalftoneSvg, dotRadius, monoHalftoneSvg, screenCoverage, type Pixels } from './halftone-svg';

const solid = (w: number, h: number, [r, g, b]: number[]): Pixels => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
  return { data, width: w, height: h };
};
const radii = (svg: string) => [...svg.matchAll(/ r="([\d.]+)"/g)].map((m) => Number(m[1]));
/** [ink colour, has dots] per ink group. */
const inks = (svg: string) =>
  [...svg.matchAll(/<g fill="(#[0-9a-f]{6})"[^>]*>(.*?)<\/g>/g)].map((m) => [m[1], m[2].includes('<circle')]);

describe('dotRadius', () => {
  it('matches the covered area, then fills the cell', () => {
    expect(dotRadius(0)).toBe(0);
    expect(dotRadius(Math.PI / 4)).toBeCloseTo(0.5);
    expect(dotRadius(1)).toBeCloseTo(Math.SQRT1_2);
    for (let c = 0; c < 0.95; c += 0.05) expect(dotRadius(c + 0.05)).toBeGreaterThan(dotRadius(c));
  });
});

describe('screenCoverage', () => {
  it('runs 0 → ½ → 1 across the threshold, S-shaped', () => {
    expect(screenCoverage(0)).toBe(0);
    expect(screenCoverage(0.5)).toBeCloseTo(0.5, 1);
    expect(screenCoverage(1.01)).toBe(1);
    expect(screenCoverage(0.25)).toBeLessThan(0.25);
    expect(screenCoverage(0.75)).toBeGreaterThan(0.75);
  });
});

describe('monoHalftoneSvg', () => {
  const opts = { cell: 8, angle: 45, spread: 1, ink: '#000000', paper: '#ffffff', scale: 2 };
  it('has no dots on white and full dots on black', () => {
    expect(radii(monoHalftoneSvg(solid(64, 32, [255, 255, 255]), opts))).toEqual([]);
    const black = radii(monoHalftoneSvg(solid(64, 32, [0, 0, 0]), opts));
    expect(black.length).toBeGreaterThan((64 / 8) * (32 / 8));
    expect(new Set(black)).toEqual(new Set([Math.round(8 * Math.SQRT1_2 * 100) / 100]));
  });

  it('sizes dots by brightness: mid grey covers about half the cell', () => {
    const [r] = radii(monoHalftoneSvg(solid(64, 64, [128, 128, 128]), { ...opts, angle: 0 }));
    expect(r).toBeCloseTo(8 * Math.sqrt(0.5 / Math.PI), 0);
  });

  it('uses the palette colours and a physical size', () => {
    const svg = monoHalftoneSvg(solid(10, 10, [0, 0, 0]), {
      ...opts,
      ink: '#112233',
      paper: '#ffeedd',
      size: { width: '20mm', height: '20mm' },
    });
    expect(svg).toContain('width="20mm"');
    expect(svg).toContain('fill="#ffeedd"');
    expect(svg).toContain('<g fill="#112233">');
  });
});

describe('cmykHalftoneSvg', () => {
  const opts = { cell: 6, angles: [15, 75, 0, 45] as [number, number, number, number], dotGain: 0, gcr: 1, scale: 1 };
  it('prints only cyan for cyan and only black for black', () => {
    expect(inks(cmykHalftoneSvg(solid(36, 36, [0, 255, 255]), opts))).toEqual([
      ['#00ffff', true],
      ['#ff00ff', false],
      ['#ffff00', false],
      ['#000000', false],
    ]);
    expect(inks(cmykHalftoneSvg(solid(36, 36, [0, 0, 0]), opts))).toEqual([
      ['#00ffff', false],
      ['#ff00ff', false],
      ['#ffff00', false],
      ['#000000', true],
    ]);
  });

  it('is blank paper for white', () => {
    expect(radii(cmykHalftoneSvg(solid(36, 36, [255, 255, 255]), opts))).toEqual([]);
  });
});
