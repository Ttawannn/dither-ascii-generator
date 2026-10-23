import { oklabInto } from './oklab';

/**
 * Built-in palettes by category, chosen for this app. Most are ramps: a few anchor colours from dark
 * to light, spread evenly in OKLab so neighbouring steps look evenly spaced. Prismatic sets are
 * evenly spaced hues at one lightness; Retro has the palettes of old hardware (public facts).
 * A palette is used as `palette = 'set:<id>'`.
 */

export interface PaletteSet {
  id: string;
  name: string;
  category: string;
  /** Hex colours, 2–32. */
  colors: string[];
  /** Picked by brightness (a dark → light ramp) instead of nearest colour. */
  ramp: boolean;
}

export const PALETTE_CATEGORIES = [
  { id: 'monochrome', label: 'Monochrome' },
  { id: 'source', label: 'Source' },
  { id: 'abstract', label: 'Abstract' },
  { id: 'nature', label: 'Nature' },
  { id: 'prismatic', label: 'Prismatic' },
  { id: 'retro', label: 'Retro' },
  { id: 'simple', label: 'Simple' },
  { id: 'custom', label: 'Custom' },
];

// ---------- colour helpers ----------

const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** OKLab → linear sRGB (may fall outside 0..1). */
function labToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const hex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255).toString(16).padStart(2, '0')).join('')}`;

function lab(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  const out = [0, 0, 0];
  oklabInto(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, out);
  return out as [number, number, number];
}

/** `count` colours through the anchors, evenly spaced in OKLab. */
export function rampThrough(count: number, ...anchors: string[]): string[] {
  const pts = anchors.map(lab);
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * (pts.length - 1);
    const k = Math.min(pts.length - 2, Math.floor(t));
    const f = t - k;
    const [L, a, b] = [0, 1, 2].map((c) => pts[k][c] + (pts[k + 1][c] - pts[k][c]) * f);
    return hex(labToLinear(L, a, b));
  });
}

/** An OKLCh colour, with chroma reduced until it fits in sRGB. */
function lch(L: number, C: number, hue: number): string {
  const h = (hue * Math.PI) / 180;
  for (let c = C; c >= 0; c -= 0.005) {
    const rgb = labToLinear(L, c * Math.cos(h), c * Math.sin(h));
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return hex(rgb);
  }
  return hex(labToLinear(L, 0, 0));
}

/** `n` hues evenly around the wheel at one lightness and chroma, optionally with black and white. */
function prism(n: number, L: number, C: number, start: number, ends: '' | 'bw' | 'black' | 'white'): string[] {
  const hues = Array.from({ length: n }, (_, i) => lch(L, C, start + (360 * i) / n));
  return [...(ends === 'bw' || ends === 'black' ? ['#000000'] : []), ...hues, ...(ends === 'bw' || ends === 'white' ? ['#ffffff'] : [])];
}

const ramp = (id: string, name: string, category: string, count: number, ...anchors: string[]): PaletteSet => ({
  id, name, category, colors: rampThrough(count, ...anchors), ramp: true,
});
const set = (id: string, name: string, category: string, colors: string[] | string): PaletteSet => ({
  id, name, category, colors: typeof colors === 'string' ? colors.split(' ') : colors, ramp: false,
});

// ---------- the palettes ----------

export const PALETTE_SETS: PaletteSet[] = [
  // Monochrome
  ramp('grey4', 'Grey 4', 'monochrome', 4, '#000000', '#ffffff'),
  ramp('grey8', 'Grey 8', 'monochrome', 8, '#000000', '#ffffff'),
  ramp('sepia', 'Sepia', 'monochrome', 6, '#1e140c', '#8a6a48', '#f3e6cf'),
  ramp('cyanotype', 'Cyanotype', 'monochrome', 5, '#0b1e3a', '#3c6e9e', '#e8f1f5'),
  ramp('ink-wash', 'Ink wash', 'monochrome', 6, '#101418', '#eef0ea'),

  // Abstract
  ramp('ultraviolet', 'Ultraviolet', 'abstract', 8, '#0d0221', '#3d0f7a', '#8a2be2', '#e0aaff'),
  ramp('ember', 'Ember', 'abstract', 8, '#120404', '#6b0f1a', '#e8551d', '#ffd27a'),
  ramp('ion', 'Ion', 'abstract', 8, '#020c1b', '#0b3d91', '#1fb5ff', '#e6fbff'),
  ramp('venom', 'Venom', 'abstract', 8, '#0a0f0a', '#1d4d1a', '#7bd31a', '#f3ffb0'),
  ramp('glacier', 'Glacier', 'abstract', 8, '#0b1320', '#2b4f6e', '#8ec5d6', '#f4fbff'),
  ramp('molten', 'Molten', 'abstract', 8, '#140200', '#7a1b00', '#ff6b00', '#fff3b0'),
  ramp('nocturne', 'Nocturne', 'abstract', 8, '#05060f', '#1f2259', '#6e5bd4', '#d9d2ff'),
  ramp('citrine', 'Citrine', 'abstract', 8, '#1a1200', '#6b4a00', '#e3b505', '#fff7c2'),
  ramp('orchid', 'Orchid', 'abstract', 8, '#12020f', '#5c1450', '#d64fb4', '#ffe0f6'),
  ramp('reactor', 'Reactor', 'abstract', 8, '#031014', '#0d4d4d', '#00e5c7', '#e0fffa'),
  ramp('smog', 'Smog', 'abstract', 8, '#111111', '#3d3a44', '#8c8696', '#e9e4ee'),
  ramp('oxblood', 'Oxblood', 'abstract', 8, '#0d0203', '#4a0d12', '#a3242f', '#f5c6c0'),
  ramp('aurora', 'Aurora', 'abstract', 8, '#021018', '#0f5e5a', '#66d18b', '#f1ffd6'),
  ramp('afterglow', 'Afterglow', 'abstract', 8, '#0b0420', '#4b0f6e', '#ff2a8a', '#ffd36e'),
  ramp('cobalt', 'Cobalt', 'abstract', 8, '#01030f', '#0a1f6b', '#2f6bff', '#dfe8ff'),
  ramp('phosphor', 'Phosphor', 'abstract', 8, '#020a02', '#0b3d12', '#33ff66', '#e8ffe8'),
  ramp('magma-core', 'Magma core', 'abstract', 8, '#0a0000', '#5a0000', '#d1300c', '#ffb347', '#fff6d0'),
  ramp('bruise', 'Bruise', 'abstract', 8, '#0c0610', '#3b1d4a', '#7c4a8c', '#c9a3c7', '#f6ecf3'),
  ramp('static', 'Static', 'abstract', 8, '#0a0a0f', '#2d3047', '#7a8ca5', '#e3f2fd'),
  ramp('chlorine', 'Chlorine', 'abstract', 8, '#04110e', '#12594a', '#4fd1a8', '#f0fff9'),
  ramp('flare', 'Flare', 'abstract', 8, '#100400', '#8a2400', '#ff9100', '#fff1c1'),
  ramp('abyss', 'Abyss', 'abstract', 8, '#000814', '#001d3d', '#005f73', '#94d2bd'),
  ramp('limelight', 'Limelight', 'abstract', 8, '#0b0f00', '#3e5c00', '#b5ff1f', '#faffe0'),
  ramp('heatwave', 'Heatwave', 'abstract', 8, '#0b0420', '#6a0f8e', '#e8476b', '#ffb03b', '#fff6a8'),
  ramp('mint-chrome', 'Mint chrome', 'abstract', 8, '#071a17', '#2e6b5f', '#9fe3cf', '#f2fffb'),
  ramp('copper', 'Copper wire', 'abstract', 8, '#120a06', '#5e3218', '#c27a3e', '#ffe2c2'),
  ramp('twilight', 'Twilight', 'abstract', 8, '#0f0a1e', '#3d2c5c', '#b06f8f', '#f6d6c2'),
  ramp('sludge', 'Sludge', 'abstract', 8, '#0a0c02', '#3a4a06', '#a3c40b', '#e9ff8a'),

  // Nature
  ramp('forest-floor', 'Forest floor', 'nature', 6, '#0e1a0f', '#2f4a23', '#6f8a3c', '#c8d7a3'),
  ramp('meadow', 'Meadow', 'nature', 8, '#10200c', '#3d6b1f', '#9cc54b', '#f1f7c9'),
  ramp('desert', 'Desert', 'nature', 8, '#2a1608', '#8a4b1e', '#d9a066', '#f7e7c6'),
  ramp('ocean', 'Ocean', 'nature', 8, '#031926', '#0b4f6c', '#4fa3b8', '#e3f4f4'),
  ramp('fallen-leaves', 'Fallen leaves', 'nature', 8, '#1f0b05', '#7a2e0e', '#d9731a', '#f6d48a'),
  ramp('stone', 'Stone', 'nature', 6, '#1c1c1a', '#4a4842', '#8d8a80', '#dedbd2'),
  ramp('moss', 'Moss', 'nature', 6, '#0f1408', '#34431a', '#7d8f3a', '#d8e2a8'),
  ramp('lagoon', 'Lagoon', 'nature', 8, '#04201c', '#0e6b5c', '#4cc9b0', '#e6fff7'),
  ramp('dusk', 'Dusk', 'nature', 8, '#0d1b2a', '#415a77', '#e07a5f', '#f2cc8f'),
  ramp('clay', 'Clay', 'nature', 6, '#2b130b', '#7d3b22', '#c4785a', '#f3d5c0'),

  // Prismatic
  set('spectrum', 'Spectrum', 'prismatic', prism(6, 0.68, 0.2, 25, 'bw')),
  set('pastel', 'Pastel', 'prismatic', prism(8, 0.87, 0.08, 20, 'bw')),
  set('vivid', 'Vivid', 'prismatic', prism(8, 0.72, 0.26, 25, '')),
  set('deep', 'Deep', 'prismatic', prism(8, 0.45, 0.15, 25, 'white')),
  set('wheel-12', 'Wheel 12', 'prismatic', prism(12, 0.7, 0.18, 0, 'bw')),
  set('muted', 'Muted', 'prismatic', prism(8, 0.62, 0.07, 30, 'bw')),
  set('neon', 'Neon', 'prismatic', prism(6, 0.82, 0.22, 140, 'black')),

  // Retro (Game Boy, CGA, PICO-8 and Commodore 64 are the original palette ids)
  set('zx-spectrum', 'ZX Spectrum', 'retro',
    '#000000 #0000d7 #d70000 #d700d7 #00d700 #00d7d7 #d7d700 #d7d7d7 #0000ff #ff0000 #ff00ff #00ff00 #00ffff #ffff00 #ffffff'),
  set('ega', 'EGA', 'retro',
    '#000000 #0000aa #00aa00 #00aaaa #aa0000 #aa00aa #aa5500 #aaaaaa #555555 #5555ff #55ff55 #55ffff #ff5555 #ff55ff #ffff55 #ffffff'),
  set('cga-warm', 'CGA warm', 'retro', '#000000 #55ff55 #ff5555 #ffff55'),
  set('teletext', 'Teletext', 'retro', '#000000 #ff0000 #00ff00 #ffff00 #0000ff #ff00ff #00ffff #ffffff'),
  set('msx', 'MSX', 'retro',
    '#000000 #21c842 #5edc78 #5455ed #7d76fc #d4524d #42ebf5 #fc5554 #ff7978 #d4c154 #e6ce80 #21b03b #c95bba #cccccc #ffffff'),
  ramp('red-visor', 'Red visor', 'retro', 4, '#000000', '#ff0000'),
  ramp('amber-monitor', 'Amber monitor', 'retro', 4, '#120800', '#ffb000'),
  ramp('green-monitor', 'Green monitor', 'retro', 4, '#001200', '#33ff33'),
  set('arcade', 'Arcade', 'retro', '#000000 #1c1c3c #e83b3b #f7a41d #f2e94e #3bd16f #2fa4e7 #ffffff'),
  set('tape', 'Tape', 'retro', '#0d0d1a #2b1b4f #c2185b #ff6f61 #ffd166 #06d6a0 #118ab2 #f8f9fa'),
  set('diner', 'Diner', 'retro', '#1b1b1b #c1121f #fdf0d5 #669bbc #003049'),
  ramp('newsprint', 'Newsprint', 'retro', 3, '#1a1a1a', '#e8e4d9'),

  // Simple: one hue from dark to light
  ramp('simple-red', 'Red', 'simple', 8, '#1a0505', '#d62828', '#fde2e2'),
  ramp('simple-orange', 'Orange', 'simple', 8, '#1a0d02', '#f77f00', '#ffe8cc'),
  ramp('simple-yellow', 'Yellow', 'simple', 8, '#1a1600', '#e9c400', '#fffbe0'),
  ramp('simple-green', 'Green', 'simple', 8, '#06140a', '#2a9d4b', '#e2f7e8'),
  ramp('simple-teal', 'Teal', 'simple', 8, '#031513', '#14a098', '#dff7f5'),
  ramp('simple-blue', 'Blue', 'simple', 8, '#030a1c', '#2367d6', '#e1ecff'),
  ramp('simple-violet', 'Violet', 'simple', 8, '#0e0618', '#7b3fd1', '#efe4ff'),
  ramp('simple-pink', 'Pink', 'simple', 8, '#1a0612', '#e0479e', '#ffe3f2'),
  ramp('simple-brown', 'Brown', 'simple', 16, '#120a05', '#8b5a2b', '#f7ece0'),
];

export const getPaletteSet = (paletteId: string): PaletteSet | undefined =>
  paletteId.startsWith('set:') ? PALETTE_SETS.find((p) => p.id === paletteId.slice(4)) : undefined;
