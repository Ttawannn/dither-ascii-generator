export type RGB = [number, number, number]; // 0..1

/**
 * ramp — colours ordered dark → light, chosen by luminance (best for mono / duotone / Game Boy)
 * set  — arbitrary colours, chosen by nearest colour
 * rgb  — independent per-channel quantisation to `levels` steps
 */
export type PaletteKind = 'ramp' | 'set' | 'rgb';

export interface Palette {
  kind: PaletteKind;
  colors: RGB[];
  levels: number;
}

export interface PaletteDef {
  id: string;
  label: string;
  /** Which extra controls apply. */
  uses: { levels?: boolean; inkPaper?: boolean };
}

export const PALETTES: PaletteDef[] = [
  { id: 'mono', label: 'Mono / Duotone', uses: { levels: true, inkPaper: true } },
  { id: 'gameboy', label: 'Game Boy', uses: {} },
  { id: 'cga', label: 'CGA', uses: {} },
  { id: 'pico8', label: 'PICO-8', uses: {} },
  { id: 'c64', label: 'Commodore 64', uses: {} },
  { id: 'rgb', label: 'RGB levels', uses: { levels: true } },
  { id: 'image', label: 'From image', uses: { levels: true } },
];

export function getPaletteDef(id: string): PaletteDef {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Ink / paper presets for the Mono palette. */
export const MONO_PRESETS: { label: string; ink: string; paper: string }[] = [
  { label: 'Black / White', ink: '#000000', paper: '#ffffff' },
  { label: 'Mac', ink: '#1a1a1a', paper: '#e8e4d8' },
  { label: 'Amber', ink: '#120800', paper: '#ffb000' },
  { label: 'Phosphor', ink: '#001a05', paper: '#33ff66' },
  { label: 'Blueprint', ink: '#0b2a6b', paper: '#dbe8ff' },
  { label: 'Risograph', ink: '#1d1a4d', paper: '#ff6f61' },
];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

const hexes = (list: string) => list.split(' ').map(hexToRgb);

const FIXED: Record<string, Palette> = {
  gameboy: { kind: 'ramp', levels: 4, colors: hexes('#0f380f #306230 #8bac0f #9bbc0f') },
  cga: { kind: 'set', levels: 4, colors: hexes('#000000 #55ffff #ff55ff #ffffff') },
  pico8: {
    kind: 'set',
    levels: 16,
    colors: hexes(
      '#000000 #1d2b53 #7e2553 #008751 #ab5236 #5f574f #c2c3c7 #fff1e8 #ff004d #ffa300 #ffec27 #00e436 #29adff #83769c #ff77a8 #ffccaa',
    ),
  },
  c64: {
    kind: 'set',
    levels: 16,
    colors: hexes(
      '#000000 #ffffff #68372b #70a4b2 #6f3d86 #588d43 #352879 #b8c76f #6f4f25 #433900 #9a6759 #444444 #6c6c6c #9ad284 #6c5eb5 #959595',
    ),
  },
};

export const MAX_PALETTE = 32;

export function resolvePalette(
  id: string,
  opts: { levels: number; ink: string; paper: string; extracted: RGB[] | null },
): Palette {
  if (FIXED[id]) return FIXED[id];
  if (id === 'rgb') {
    const levels = Math.min(opts.levels, 8);
    // Representative colours for the swatch strip only.
    const steps = Array.from({ length: levels }, (_, i) => i / (levels - 1));
    const colors: RGB[] = [];
    for (const r of steps) for (const g of steps) for (const b of steps) colors.push([r, g, b]);
    return { kind: 'rgb', levels, colors };
  }
  if (id === 'image' && opts.extracted?.length) {
    return { kind: 'set', levels: opts.extracted.length, colors: opts.extracted };
  }
  const ink = hexToRgb(opts.ink);
  const paper = hexToRgb(opts.paper);
  const n = Math.max(2, opts.levels);
  const colors = Array.from({ length: n }, (_, i): RGB => {
    const t = i / (n - 1);
    return [ink[0] + (paper[0] - ink[0]) * t, ink[1] + (paper[1] - ink[1]) * t, ink[2] + (paper[2] - ink[2]) * t];
  });
  return { kind: 'ramp', levels: n, colors };
}

/** Base ordered-dither spread: roughly the gap between neighbouring palette colours. */
export function baseSpread(p: Palette): number {
  if (p.kind === 'ramp') return 1 / (p.colors.length - 1);
  if (p.kind === 'rgb') return 1 / (p.levels - 1);
  return 1 / Math.sqrt(p.colors.length);
}

const luma = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Median-cut palette extraction from an image, sorted dark → light. */
export function extractPalette(bitmap: ImageBitmap, count: number): RGB[] {
  const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d')!;
  g.drawImage(bitmap, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;

  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) pixels.push([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]);

  const range = (box: RGB[], ch: number) => {
    let lo = 1;
    let hi = 0;
    for (const p of box) {
      if (p[ch] < lo) lo = p[ch];
      if (p[ch] > hi) hi = p[ch];
    }
    return hi - lo;
  };

  let boxes: RGB[][] = [pixels];
  while (boxes.length < count) {
    // Split the box with the widest channel range (weighted by population).
    let best = -1;
    let bestScore = 0;
    let bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        const score = range(box, ch) * Math.sqrt(box.length);
        if (score > bestScore) [best, bestScore, bestCh] = [i, score, ch];
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }

  return boxes
    .map((box): RGB => {
      const s: RGB = [0, 0, 0];
      for (const p of box) for (let ch = 0; ch < 3; ch++) s[ch] += p[ch];
      return [s[0] / box.length, s[1] / box.length, s[2] / box.length];
    })
    .sort((a, b) => luma(a) - luma(b));
}
