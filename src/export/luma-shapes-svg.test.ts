import { describe, expect, it } from 'vitest';
import { lumaShapesSvg, shapeCells, shapeHash } from './luma-shapes-svg';
import { DEFAULTS, sanitize } from '../state';
import { shapeSet } from '../pipeline/shape-bands';

const pixels = new Uint8Array(24 * 16 * 4).fill(255);
const params = { ...DEFAULTS, algorithm: 'luma-shapes', cellSize: 8, angle: 0 };
describe('vector shapes', () => {
  it('emits circles grouped by colour with print dimensions and optional transparent background', () => {
    const svg = lumaShapesSvg(pixels, 24, 16, params, new Map(), { width: '24mm', height: '16mm' });
    expect(svg).toContain('<circle'); expect(svg).toContain('width="24mm"'); expect(svg).toContain(`fill="${params.shapeBackground}"`);
    expect(lumaShapesSvg(pixels, 24, 16, { ...params, shapeTransparent: true })).not.toContain(`fill="${params.shapeBackground}"`);
    expect(svg).not.toContain('<image');
  });
  it('keeps placement fixed when bands change and changes it when the seed changes', () => {
    const p = { ...params, shapeLayout: 'scatter', shapeJitter: 70, shapeSeed: 97 };
    const positions = (v: typeof p) => shapeCells(pixels, 24, 16, v).map(({ x, y }) => [x, y]);
    const bands = shapeSet().map((b) => ({ ...b, size: 22, rotation: 45 }));
    expect(positions(p)).toEqual(positions({ ...p, shapeBands: JSON.stringify(bands) }));
    expect(positions(p)).not.toEqual(positions({ ...p, shapeSeed: 98 }));
  });
  it('handles negative cell coordinates deterministically and staggers alternate rows', () => {
    expect(shapeHash(-1, -2, 3)).toBe(shapeHash(-1, -2, 3));
    expect(shapeHash(-1, -2, 3)).toBeGreaterThanOrEqual(0); expect(shapeHash(-1, -2, 3)).toBeLessThanOrEqual(1);
    const cells = shapeCells(pixels, 24, 16, { ...params, shapeLayout: 'staggered' });
    expect(cells.find((v) => v.cx === 0 && v.cy === 0)?.x).toBe(4);
    expect(cells.find((v) => v.cx === 0 && v.cy === 1)?.x).toBe(8);
  });
  it('requires actual embedded image assets instead of silently losing shapes', () => {
    const shapeBands = JSON.stringify([{ end: 127, shape: 'empty', size: 0, color: '#000000' },
      { end: 255, shape: 'image', size: 80, color: '#ffffff', image: 'A'.repeat(21846) + '==' }]);
    const p = { ...params, shapeBands };
    expect(() => lumaShapesSvg(pixels, 24, 16, p)).toThrow('Missing shape image');
    const svg = lumaShapesSvg(pixels, 24, 16, p, new Map([[1, 'data:image/png;base64,AAAA']]));
    expect(svg).toContain('href="data:image/png');
    expect(svg.match(/<image /g)).toHaveLength(1);
    expect(svg).toContain('<use href="#image1"');
  });
  it('loads older bands without adding rotation and preserves valid new rotation', () => {
    expect(sanitize({ shapeBands: JSON.stringify(shapeSet()) }).shapeBands).toBe(JSON.stringify(shapeSet()));
    const shapeBands = JSON.stringify(shapeSet().map((b) => ({ ...b, rotation: 37 })));
    expect(sanitize({ shapeBands }).shapeBands).toBe(shapeBands);
  });
});
