import type { Params } from '../state';

export type AlgorithmGroup = 'ordered' | 'pattern' | 'polygon' | 'diffusion' | 'stipple' | 'other';

export interface Algorithm {
  id: string;
  label: string;
  group: AlgorithmGroup;
  /** Index used by dither.frag (`u_algo`); undefined for CPU error diffusion. */
  shader?: number;
}

export const ALGORITHMS: Algorithm[] = [
  { id: 'bayer2', label: 'Bayer 2×2', group: 'ordered', shader: 0 },
  { id: 'bayer4', label: 'Bayer 4×4', group: 'ordered', shader: 1 },
  { id: 'bayer8', label: 'Bayer 8×8', group: 'ordered', shader: 2 },
  { id: 'bayer16', label: 'Bayer 16×16', group: 'ordered', shader: 14 },
  { id: 'bluenoise', label: 'Blue noise', group: 'ordered', shader: 3 },
  { id: 'halftone', label: 'Halftone dot', group: 'pattern', shader: 4 },
  { id: 'lines', label: 'Halftone line', group: 'pattern', shader: 5 },
  { id: 'crosshatch', label: 'Crosshatch', group: 'pattern', shader: 6 },
  { id: 'honeycomb', label: 'Honeycomb', group: 'pattern', shader: 9 },
  { id: 'orbs', label: 'Orbs', group: 'pattern', shader: 10 },
  { id: 'halftone-cmyk', label: 'Halftone CMYK', group: 'pattern', shader: 11 },
  { id: 'luma-shapes', label: 'Luma Shapes', group: 'pattern', shader: 12 },
  { id: 'modulation', label: 'Modulation Lines', group: 'pattern', shader: 13 },
  { id: 'contour', label: 'Contour', group: 'pattern', shader: 15 },
  { id: 'moire', label: 'Sine moiré', group: 'pattern', shader: 16 },
  { id: 'radial', label: 'Radial', group: 'pattern', shader: 17 },
  { id: 'poly-hex', label: 'Hex cells', group: 'polygon', shader: 18 },
  { id: 'poly-tri', label: 'Triangles', group: 'polygon', shader: 19 },
  { id: 'voronoi', label: 'Voronoi', group: 'polygon', shader: 20 },
  { id: 'floyd-steinberg', label: 'Floyd–Steinberg', group: 'diffusion' },
  { id: 'atkinson', label: 'Atkinson', group: 'diffusion' },
  { id: 'jjn', label: 'Jarvis–Judice–Ninke', group: 'diffusion' },
  { id: 'stucki', label: 'Stucki', group: 'diffusion' },
  { id: 'burkes', label: 'Burkes', group: 'diffusion' },
  { id: 'sierra', label: 'Sierra', group: 'diffusion' },
  { id: 'sierra2', label: 'Sierra two-row', group: 'diffusion' },
  { id: 'sierra-lite', label: 'Sierra Lite', group: 'diffusion' },
  { id: 'ostromoukhov', label: 'Ostromoukhov', group: 'diffusion' },
  { id: 'riemersma', label: 'Riemersma', group: 'diffusion' },
  { id: 'dot-diffusion', label: 'Dot diffusion', group: 'diffusion' },
  { id: 'stevenson-arce', label: 'Stevenson–Arce', group: 'diffusion' },
  { id: 'gaussian', label: 'Gaussian', group: 'diffusion' },
  { id: 'edge-diffusion', label: 'Edge-directed', group: 'diffusion' },
  { id: 'axis', label: 'Single-axis', group: 'diffusion' },
  { id: 'stippling', label: 'Stippling', group: 'stipple' },
  { id: 'noise', label: 'Random noise', group: 'other', shader: 7 },
  { id: 'threshold', label: 'Threshold', group: 'other', shader: 8 },
];

/** Pattern algorithms whose cells can bend along the image (`patternFollow`). */
export const FOLLOWS_IMAGE = ['halftone', 'lines', 'crosshatch', 'honeycomb'];

export const GROUP_LABELS: Record<AlgorithmGroup, string> = {
  ordered: 'Ordered',
  pattern: 'Pattern',
  polygon: 'Polygon',
  diffusion: 'Error diffusion',
  stipple: 'Stippling',
  other: 'Other',
};

/** Recursive Bayer threshold of size 2^n at (x, y), in (0, 1); the same recursion as dither.frag. */
export function bayer(x: number, y: number, n: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const bx = (x >> i) & 1;
    const by = (y >> i) & 1;
    v |= (((bx ^ by) << 1) | by) << (2 * (n - 1 - i));
  }
  return (v + 0.5) / (1 << (2 * n));
}

/**
 * dither.frag's `u_look` for the looks that need more than the cell and angle: Contour (lines,
 * unused, phase), Sine moiré (second wavelength as a ratio, second angle in radians) and Radial
 * (centre in output pixels with y up, spiral arms).
 */
export function lookUniform(p: Params, width: number, height: number): [number, number, number, number] {
  if (p.algorithm === 'contour') return [p.contourLevels, 0, p.modulationPhase / 100, 0];
  if (p.algorithm === 'moire') return [p.moireRatio / 100, (p.moireAngle * Math.PI) / 180, 0, 0];
  if (p.algorithm === 'radial') return [(p.radialX / 100) * width, (1 - p.radialY / 100) * height, p.radialArms, 0];
  return [0, 0, 0, 0];
}

export function getAlgorithm(id: string): Algorithm {
  return ALGORITHMS.find((a) => a.id === id) ?? ALGORITHMS[0];
}

/** Error-diffusion kernels as [dx, dy, weight] (weights already divided). dy > 0 is the next row. */
export type Kernel = [number, number, number][];

function kernel(divisor: number, rows: number[][], originCol: number): Kernel {
  // rows[0] starts right of the current pixel; later rows are centred on originCol.
  const out: Kernel = [];
  rows[0].forEach((w, i) => w && out.push([i + 1, 0, w / divisor]));
  for (let y = 1; y < rows.length; y++) {
    rows[y].forEach((w, i) => w && out.push([i - originCol, y, w / divisor]));
  }
  return out;
}

export const KERNELS: Record<string, Kernel> = {
  'floyd-steinberg': kernel(16, [[7], [3, 5, 1]], 1),
  atkinson: kernel(8, [[1, 1], [1, 1, 1], [0, 1, 0]], 1),
  jjn: kernel(48, [[7, 5], [3, 5, 7, 5, 3], [1, 3, 5, 3, 1]], 2),
  stucki: kernel(42, [[8, 4], [2, 4, 8, 4, 2], [1, 2, 4, 2, 1]], 2),
  burkes: kernel(32, [[8, 4], [2, 4, 8, 4, 2]], 2),
  sierra: kernel(32, [[5, 3], [2, 4, 5, 4, 2], [0, 2, 3, 2, 0]], 2),
  sierra2: kernel(16, [[4, 3], [1, 2, 3, 2, 1]], 2),
  'sierra-lite': kernel(4, [[2], [1, 1, 0]], 1),
  // Stevenson & Arce (1985), weights / 200 over four rows.
  'stevenson-arce': kernel(
    200,
    [[0, 32], [12, 0, 26, 0, 30, 0, 16], [0, 12, 0, 26, 0, 12, 0], [5, 0, 12, 0, 12, 0, 5]],
    3,
  ),
};

/** Settings of the kernels built per job: Gaussian, Edge-directed and Single-axis. */
export interface KernelShape {
  /** Gaussian σ in pixels. */
  sigma: number;
  /** Gaussian threshold noise, 0..1. */
  noise: number;
  /** Edge-directed: share sent the main way, 0 (half each) .. 1 (all). */
  crack: number;
  /** Single-axis: carry the error down columns instead of along rows. */
  vertical: boolean;
  /** Single-axis: share leaking to the next line, 0..1. */
  bleed: number;
  /** Single-axis: share passed two pixels on instead of one, 0..1. */
  smooth: number;
}

/** Gaussian weights on the 12 not-yet-visited cells of a 5×5 window, normalised to 1. */
export function gaussianKernel(sigma: number): Kernel {
  const out: Kernel = [];
  for (let dy = 0; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dy === 0 && dx <= 0) continue;
      out.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))]);
    }
  }
  const sum = out.reduce((s, k) => s + k[2], 0);
  return out.map(([dx, dy, w]) => [dx, dy, w / sum]);
}

/** Single-axis kernel: along the row (or column), with a share leaking to the next line. */
export function axisKernel(s: KernelShape): Kernel {
  const along = 1 - s.bleed;
  const taps: Kernel = s.vertical
    ? [[0, 1, along * (1 - s.smooth)], [0, 2, along * s.smooth], [1, 0, s.bleed]]
    : [[1, 0, along * (1 - s.smooth)], [2, 0, along * s.smooth], [0, 1, s.bleed]];
  return taps.filter((k) => k[2] > 0);
}

/**
 * Edge-directed: where brightness changes more vertically (gy ≥ gx) the error runs along the edge to
 * the right, otherwise down; `crack` sets how much goes the main way. Returns [right, down].
 */
export function edgeShares(gx: number, gy: number, crack: number): [number, number] {
  const main = 0.5 + 0.5 * crack;
  return gy >= gx ? [main, 1 - main] : [1 - main, main];
}
