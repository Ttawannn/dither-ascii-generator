import { describe, expect, it } from 'vitest';
import { polygonCells, polygonSvg, voronoiPoint, type PolygonKind } from './polygon-svg';
import type { Palette } from '../pipeline/palettes';

const area = (poly: [number, number][]) =>
  Math.abs(poly.reduce((s, [x, y], i) => {
    const [nx, ny] = poly[(i + 1) % poly.length];
    return s + x * ny - nx * y;
  }, 0)) / 2;

const inside = (poly: [number, number][], [px, py]: [number, number]) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
};

describe('polygonCells', () => {
  for (const kind of ['poly-hex', 'poly-tri', 'voronoi'] as PolygonKind[]) {
    it(`${kind}: cells contain their centres and cover the plane once (area per unit square ≈ 1)`, () => {
      const cells = polygonCells(kind, [0, 0, 10, 10], 0.8);
      for (const cell of cells) expect(inside(cell.corners, cell.centre)).toBe(true);
      // Sum the areas of cells whose centres lie well inside, against the area those centres span.
      const inner = cells.filter(({ centre: [x, y] }) => x >= 3 && x < 7 && y >= 3 && y < 7);
      const total = inner.reduce((s, c) => s + area(c.corners), 0);
      expect(total / 16).toBeGreaterThan(0.85);
      expect(total / 16).toBeLessThan(1.15);
    });
  }

  it('gives hexagons of inner radius ½ and equilateral triangles of side 1', () => {
    const [hex] = polygonCells('poly-hex', [0, 0, 1, 1]);
    expect(area(hex.corners)).toBeCloseTo(Math.sqrt(3) / 2, 6);
    const [tri] = polygonCells('poly-tri', [0, 0, 1, 1]);
    expect(area(tri.corners)).toBeCloseTo(Math.sqrt(3) / 4, 6);
  });

  it('places Voronoi points by a fixed hash, inside their square', () => {
    expect(voronoiPoint(3, -2, 0.8)).toEqual(voronoiPoint(3, -2, 0.8));
    expect(voronoiPoint(0, 0, 0)).toEqual([0.5, 0.5]);
    for (let i = -5; i < 5; i++) {
      const [x, y] = voronoiPoint(i, i * 3, 1);
      expect(x).toBeGreaterThanOrEqual(i);
      expect(x).toBeLessThanOrEqual(i + 1);
      expect(y).toBeGreaterThanOrEqual(i * 3);
      expect(y).toBeLessThanOrEqual(i * 3 + 1);
    }
  });
});

describe('polygonSvg', () => {
  const pixels = (w: number, h: number, f: (x: number) => number) => {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([f(x), f(x), f(x), 255], (y * w + x) * 4);
    return { data, width: w, height: h };
  };
  const ramp: Palette = { kind: 'ramp', levels: 2, colors: [[0, 0, 0], [1, 1, 1]] };
  const base = { cell: 8, angle: 0, border: 0, borderColor: '#ff0000', jitter: 0.8, palette: ramp, scale: 1 };

  it('fills cells with palette colours: dark on the left, light on the right', () => {
    const svg = polygonSvg(pixels(64, 32, (x) => (x < 32 ? 20 : 235)), { ...base, kind: 'poly-hex' });
    const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(new Set(fills)).toEqual(new Set(['#000000', '#ffffff']));
    expect(svg).not.toContain('stroke=');
  });

  it('draws the border as a stroke as wide as the shader band on both sides of an edge', () => {
    const svg = polygonSvg(pixels(32, 32, () => 128), { ...base, kind: 'voronoi', border: 0.25 });
    expect(svg).toContain('stroke="#ff0000" stroke-width="2"'); // 2 × 0.25 × ½ × 8
  });
});
