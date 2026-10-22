export type AlgorithmGroup = 'ordered' | 'pattern' | 'diffusion' | 'stipple' | 'other';

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
  { id: 'bluenoise', label: 'Blue noise', group: 'ordered', shader: 3 },
  { id: 'halftone', label: 'Halftone dot', group: 'pattern', shader: 4 },
  { id: 'lines', label: 'Halftone line', group: 'pattern', shader: 5 },
  { id: 'crosshatch', label: 'Crosshatch', group: 'pattern', shader: 6 },
  { id: 'honeycomb', label: 'Honeycomb', group: 'pattern', shader: 9 },
  { id: 'orbs', label: 'Orbs', group: 'pattern', shader: 10 },
  { id: 'halftone-cmyk', label: 'Halftone CMYK', group: 'pattern', shader: 11 },
  { id: 'luma-shapes', label: 'Luma Shapes', group: 'pattern', shader: 12 },
  { id: 'modulation', label: 'Modulation Lines', group: 'pattern', shader: 13 },
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
  { id: 'stippling', label: 'Stippling', group: 'stipple' },
  { id: 'noise', label: 'Random noise', group: 'other', shader: 7 },
  { id: 'threshold', label: 'Threshold', group: 'other', shader: 8 },
];

/** Pattern algorithms whose cells can bend along the image (`patternFollow`). */
export const FOLLOWS_IMAGE = ['halftone', 'lines', 'crosshatch', 'honeycomb'];

export const GROUP_LABELS: Record<AlgorithmGroup, string> = {
  ordered: 'Ordered',
  pattern: 'Pattern',
  diffusion: 'Error diffusion',
  stipple: 'Stippling',
  other: 'Other',
};

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
};
