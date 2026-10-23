import type { Params } from '../state';
import { bayer } from '../pipeline/algorithms';
import { parseShapeBands, shapeSet, type ShapeBand } from '../pipeline/shape-bands';
import type { SvgSize } from './halftone-svg';

/** Same unsigned integer hash as the shape shader, independent of the current brightness band. */
export function shapeHash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 1664525) + Math.imul(y, 1013904223) + seed) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const num = (v: number) => +v.toFixed(5);
export interface ShapeCell {
  x: number; y: number; band: number; radius: number; rotation: number;
  cx: number; cy: number; stagger: number;
}
/** Enumerate in framebuffer coordinates (Y up), sampling the same adjusted pixels as WebGL. */
export function shapeCells(data: Uint8Array, width: number, height: number, p: Params, boilSeed = 0): ShapeCell[] {
  const bands = parseShapeBands(p.shapeBands) ?? shapeSet();
  const angle = p.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), cell = p.cellSize;
  const ox = (boilSeed * 29) % 64, oy = (boilSeed * 47) % 64;
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) =>
    [(c * (x + ox) - s * (y + oy)) / cell, (s * (x + ox) + c * (y + oy)) / cell]);
  const loX = Math.floor(Math.min(...corners.map((v) => v[0]))) - 1;
  const hiX = Math.ceil(Math.max(...corners.map((v) => v[0]))) + 1;
  const loY = Math.floor(Math.min(...corners.map((v) => v[1]))) - 1;
  const hiY = Math.ceil(Math.max(...corners.map((v) => v[1]))) + 1;
  if ((hiX - loX + 1) * (hiY - loY + 1) > 150000) throw new Error('Too many vector shapes — increase cell size or use PNG');
  const out: ShapeCell[] = [];
  for (let cy = loY; cy <= hiY; cy++) for (let cx = loX; cx <= hiX; cx++) {
    const seed = p.shapeSeed;
    const stagger = p.shapeLayout === 'staggered' ? ((cy % 2 + 2) % 2) * 0.5 : 0;
    const amount = Math.max(p.shapeLayout === 'scatter' ? 0.8 : 0, p.shapeJitter / 100);
    const gx = cx + 0.5 + stagger + (shapeHash(cx, cy, seed) - 0.5) * amount;
    const gy = cy + 0.5 + (shapeHash(cx, cy, seed + 101) - 0.5) * amount;
    const x = (c * gx + s * gy) * cell - ox, y = (-s * gx + c * gy) * cell - oy;
    if (x < -2 * cell || y < -2 * cell || x > width + 2 * cell || y > height + 2 * cell) continue;
    const px = Math.max(0, Math.min(width - 1, Math.trunc(x))), py = Math.max(0, Math.min(height - 1, Math.trunc(y)));
    const at = (py * width + px) * 4;
    const luma = (data[at] * 0.2126 + data[at + 1] * 0.7152 + data[at + 2] * 0.0722) / 255;
    const rank = p.shapeFeatherPattern === 'scatter' ? shapeHash(cx, cy, boilSeed + 1) : bayer(cx, cy, 3);
    let band = bands.length - 1;
    for (let i = 0; i < bands.length - 1; i++) {
      const bound = (bands[i].end + 1) / 256, lower = i ? (bands[i - 1].end + 1) / 256 : 0;
      const width = Math.min(bound - lower, (bands[i + 1].end - bands[i].end) / 256);
      if (luma < bound + (rank - 0.5) * width * p.shapeFeather / 100) { band = i; break; }
    }
    out.push({ x, y, band, cx, cy, stagger,
      radius: bands[band].size / 200 * (1 - shapeHash(cx, cy, seed + 202) * p.shapeSizeJitter / 100),
      rotation: (bands[band].rotation ?? 0) + (shapeHash(cx, cy, seed + 303) * 2 - 1) * p.shapeAngleJitter });
  }
  return out;
}

function primitive(b: ShapeBand, r: number, image?: string): string {
  const n = num, R = n(r), D = n(r * 2);
  switch (b.shape) {
    case 'empty': return '';
    case 'circle': return `<circle r="${R}"/>`;
    case 'square': return `<rect x="${-R}" y="${-R}" width="${D}" height="${D}"/>`;
    case 'diamond': return `<path d="M0 ${-R}L${R} 0 0 ${R} ${-R} 0Z"/>`;
    case 'line': return `<rect x="-2" y="${-R}" width="4" height="${D}"/>`;
    case 'cross': return `<rect x="-2" y="${n(-r * .35)}" width="4" height="${n(r * .7)}"/><rect x="${n(-r * .35)}" y="-2" width="${n(r * .7)}" height="4"/>`;
    case 'ring': return `<circle r="${n(r * .8)}" fill="none" stroke="${b.color}" stroke-width="${n(r * .4)}"/>`;
    case 'image': return `<use href="${image}" transform="scale(${D})"/>`;
  }
}

export function lumaShapesSvg(data: Uint8Array, width: number, height: number, p: Params,
  images: Map<number, string> = new Map(), size?: SvgSize, seed = 0): string {
  const bands = parseShapeBands(p.shapeBands) ?? shapeSet();
  const defs: string[] = [];
  bands.forEach((band, i) => {
    if (band.shape === 'image' && images.has(i))
      defs.push(`<image id="image${i}" x="-0.5" y="-0.5" width="1" height="1" href="${images.get(i)}"/>`);
  });
  const groups = new Map<string, string[]>();
  const angle = p.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), cell = p.cellSize;
  for (const [i, v] of shapeCells(data, width, height, p, seed).entries()) {
    const band = bands[v.band];
    if (band.shape === 'empty' || v.radius <= 0) continue;
    const clip = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([dx, dy]) => {
      const x = (v.cx + v.stagger + dx) * cell, y = (v.cy + dy) * cell;
      return `${num(c * x + s * y - (seed * 29) % 64)},${num(height - (-s * x + c * y - (seed * 47) % 64))}`;
    }).join(' ');
    defs.push(`<clipPath id="c${i}"><polygon points="${clip}"/></clipPath>`);
    if (band.shape === 'image' && !images.has(v.band)) throw new Error('Missing shape image');
    const body = `<g clip-path="url(#c${i})"><g transform="translate(${num(v.x)} ${num(height - v.y)}) rotate(${num(p.angle - v.rotation)}) scale(${cell})">${primitive(band, v.radius, `#image${v.band}`)}</g></g>`;
    if (!groups.has(band.color)) groups.set(band.color, []);
    groups.get(band.color)!.push(body);
  }
  const background = p.shapeTransparent ? '' : `<rect width="${width}" height="${height}" fill="${p.shapeBackground}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${size?.width ?? width * p.exportScale}" height="${size?.height ?? height * p.exportScale}"><defs>${defs.join('')}</defs>${background}${[...groups].map(([color, shapes]) => `<g fill="${color}">${shapes.join('')}</g>`).join('')}</svg>`;
}
