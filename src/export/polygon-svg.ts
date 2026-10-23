import { nearestIndex, paletteLab } from '../pipeline/oklab';
import { rgbToHex, type Palette } from '../pipeline/palettes';
import type { Pixels, SvgSize } from './halftone-svg';

/**
 * Polygon looks (Hex cells, Triangles, Voronoi) as vector polygons, one per cell, filled with the
 * palette colour of the cell's average — the same cells, samples and colours as dither.frag.
 * Coordinates are in output pixels with y up (gl_FragCoord), flipped when written.
 */

export type PolygonKind = 'poly-hex' | 'poly-tri' | 'voronoi';

export interface PolygonOptions {
  kind: PolygonKind;
  cell: number;
  /** Lattice angle, degrees. */
  angle: number;
  /** Border, 0..0.5 of the cell's inner radius. */
  border: number;
  borderColor: string;
  /** Voronoi jitter 0..1. */
  jitter: number;
  /** Lattice shift in pixels (dither.frag's u_offset). */
  offset?: [number, number];
  palette: Palette;
  perceptual?: boolean;
  scale: number;
  size?: SvgSize;
}

interface Cell {
  /** Centre in cell units, in the turned lattice. */
  centre: [number, number];
  /** Corners in cell units, in the turned lattice. */
  corners: [number, number][];
}

const H = Math.sqrt(3) / 2;

/** dither.frag's hash1: a seedless 32-bit hash to 0..1. */
export function hash1(n: number): number {
  let h = (Math.imul(n, 747796405) + 2891336453) >>> 0;
  h = Math.imul((h >>> ((h >>> 28) + 4)) ^ h, 277803737) >>> 0;
  h = ((h >>> 22) ^ h) >>> 0;
  return h / 4294967295;
}

/** The jittered Voronoi point of grid square (i, j), in cell units. */
export function voronoiPoint(i: number, j: number, jitter: number): [number, number] {
  const n = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0;
  return [i + 0.5 + (hash1((n * 2) >>> 0) - 0.5) * jitter, j + 0.5 + (hash1((n * 2 + 1) >>> 0) - 0.5) * jitter];
}

/** Clip a convex polygon to the half-plane closer to `a` than to `b`. */
function clipCloser(poly: [number, number][], a: [number, number], b: [number, number]): [number, number][] {
  const n = [b[0] - a[0], b[1] - a[1]];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const side = (p: [number, number]) => (p[0] - mid[0]) * n[0] + (p[1] - mid[1]) * n[1];
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Cells whose centres fall in the lattice-space box [x0, x1] × [y0, y1] (cell units). */
export function polygonCells(kind: PolygonKind, box: [number, number, number, number], jitter = 0): Cell[] {
  const [x0, y0, x1, y1] = box;
  const cells: Cell[] = [];
  if (kind === 'poly-hex') {
    const r = 1 / Math.sqrt(3); // circumradius for inner radius ½
    const ring = Array.from({ length: 6 }, (_, k) => [Math.cos(((30 + 60 * k) * Math.PI) / 180) * r, Math.sin(((30 + 60 * k) * Math.PI) / 180) * r]);
    // Centres: (i, j·√3) and (i + ½, (j + ½)·√3).
    for (let j = Math.floor(y0 / (2 * H)) - 1; j <= Math.ceil(y1 / (2 * H)) + 1; j++) {
      for (let i = Math.floor(x0) - 1; i <= Math.ceil(x1) + 1; i++) {
        for (const [cx, cy] of [[i, j * 2 * H], [i + 0.5, (j + 0.5) * 2 * H]]) {
          cells.push({ centre: [cx, cy], corners: ring.map(([dx, dy]) => [cx + dx, cy + dy] as [number, number]) });
        }
      }
    }
  } else if (kind === 'poly-tri') {
    for (let row = Math.floor(y0 / H) - 1; row <= Math.ceil(y1 / H) + 1; row++) {
      const shift = (((row % 2) + 2) % 2) * 0.5;
      const b = row * H;
      for (let k = Math.floor(x0) - 2; k <= Math.ceil(x1) + 2; k++) {
        const x = k + shift;
        cells.push({ centre: [x + 0.5, b + H / 3], corners: [[x, b], [x + 1, b], [x + 0.5, b + H]] });
        cells.push({ centre: [x, b + (2 * H) / 3], corners: [[x - 0.5, b + H], [x + 0.5, b + H], [x, b]] });
      }
    }
  } else {
    for (let j = Math.floor(y0) - 1; j <= Math.ceil(y1) + 1; j++) {
      for (let i = Math.floor(x0) - 1; i <= Math.ceil(x1) + 1; i++) {
        const a = voronoiPoint(i, j, jitter);
        let poly: [number, number][] = [[i - 1, j - 1], [i + 2, j - 1], [i + 2, j + 2], [i - 1, j + 2]];
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            if (di || dj) poly = clipCloser(poly, a, voronoiPoint(i + di, j + dj, jitter));
          }
        }
        cells.push({ centre: a, corners: poly });
      }
    }
  }
  return cells;
}

const LUMA = [0.2126, 0.7152, 0.0722];
const num = (v: number) => String(Math.round(v * 100) / 100);

export function polygonSvg(px: Pixels, opts: PolygonOptions): string {
  const { width: w, height: h } = px;
  const a = (opts.angle * Math.PI) / 180;
  const [s, c] = [Math.sin(a), Math.cos(a)];
  const [ox, oy] = opts.offset ?? [0, 0];
  // dither.frag: lattice point = turn · (frag + offset) / cell, with turn·v = (c·x − s·y, s·x + c·y).
  const toLattice = (x: number, y: number): [number, number] => [(c * (x + ox) - s * (y + oy)) / opts.cell, (s * (x + ox) + c * (y + oy)) / opts.cell];
  const toPixels = ([u, v]: [number, number]): [number, number] => [opts.cell * (c * u + s * v) - ox, opts.cell * (-s * u + c * v) - oy];
  const corners = [toLattice(0, 0), toLattice(w, 0), toLattice(0, h), toLattice(w, h)];
  const box: [number, number, number, number] = [
    Math.min(...corners.map((p) => p[0])),
    Math.min(...corners.map((p) => p[1])),
    Math.max(...corners.map((p) => p[0])),
    Math.max(...corners.map((p) => p[1])),
  ];

  const pal = opts.palette;
  const flat = pal.colors.flat();
  const lab = pal.kind === 'set' && opts.perceptual ? paletteLab(flat) : null;
  const colourOf = (rgb: number[]): string => {
    if (pal.kind === 'rgb') {
      const steps = pal.levels - 1;
      return rgbToHex(rgb.map((v) => Math.min(1, Math.max(0, Math.floor(v * steps + 0.5) / steps))) as [number, number, number]);
    }
    if (pal.kind === 'ramp') {
      const l = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
      return rgbToHex(pal.colors[Math.min(pal.colors.length - 1, Math.max(0, Math.floor(l * (pal.colors.length - 1) + 0.5)))]);
    }
    return rgbToHex(pal.colors[nearestIndex(flat, lab, rgb[0], rgb[1], rgb[2])]);
  };
  const reach = (opts.kind === 'poly-tri' ? 0.15 : 0.25) * opts.cell;
  const average = (x: number, y: number) => {
    const sum = [0, 0, 0];
    for (let sy = -1; sy <= 1; sy++) {
      for (let sx = -1; sx <= 1; sx++) {
        const xx = Math.floor(Math.min(w - 1, Math.max(0, x + sx * reach)));
        const yy = Math.floor(Math.min(h - 1, Math.max(0, y + sy * reach)));
        const i = (yy * w + xx) * 4;
        for (let ch = 0; ch < 3; ch++) sum[ch] += px.data[i + ch] / 255;
      }
    }
    return sum.map((v) => v / 9);
  };

  const margin = 1.5;
  const fills = new Map<string, string[]>();
  for (const cell of polygonCells(opts.kind, [box[0] - margin, box[1] - margin, box[2] + margin, box[3] + margin], opts.jitter)) {
    const [cx, cy] = toPixels(cell.centre);
    if (cx < -2 * opts.cell || cx > w + 2 * opts.cell || cy < -2 * opts.cell || cy > h + 2 * opts.cell) continue;
    const fill = colourOf(average(cx, cy));
    const d = cell.corners.map((p, i) => {
      const [x, y] = toPixels(p);
      return `${i ? 'L' : 'M'}${num(x)} ${num(h - y)}`;
    });
    (fills.get(fill) ?? fills.set(fill, []).get(fill)!).push(`${d.join(' ')}Z`);
  }

  // The shader's border is the band within `border` × inner radius of an edge, on both sides of it.
  const inner = opts.kind === 'poly-tri' ? H / 3 : 0.5;
  const stroke = opts.border > 0 ? ` stroke="${opts.borderColor}" stroke-width="${num(2 * opts.border * inner * opts.cell)}" stroke-linejoin="round"` : '';
  const body = [...fills].map(([fill, paths]) => `<path fill="${fill}"${stroke} d="${paths.join(' ')}"/>`).join('\n');
  const width = opts.size?.width ?? `${w * opts.scale}`;
  const height = opts.size?.height ?? `${h * opts.scale}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${width}" height="${height}">
<defs><clipPath id="frame"><rect width="${w}" height="${h}"/></clipPath></defs>
<g clip-path="url(#frame)">
${body}
</g>
</svg>
`;
}
