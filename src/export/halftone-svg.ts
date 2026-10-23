import { dotThreshold } from '../pipeline/halftone-shape';
import { srgbToLinear } from '../pipeline/color-space';
import { hexToRgb } from '../pipeline/palettes';
/**
 * Halftone as true vector dots for print: one circle per screen cell, sized by the brightness under
 * it, instead of the pixel runs canvasToSvg produces. The screen matches dither.frag (cell size,
 * angle, dots on the rotated lattice); Follow image and Boil are not part of it.
 */

/** Adjusted image pixels, RGBA, bottom row first (readPixels layout). */
export interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/** Physical width / height attributes ("120mm", "4in"); pixels × scale when omitted. */
export interface SvgSize {
  width: string;
  height: string;
}

const LUMA = [0.2126, 0.7152, 0.0722];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const num = (v: number) => String(Math.round(v * 100) / 100);

// The screen's threshold over one cell, sorted: 0.5 − 0.25·(cos 2πu + cos 2πv), as in dither.frag.
const SCREEN = (() => {
  const n = 64;
  const t = new Float32Array(n * n);
  for (let v = 0; v < n; v++) {
    for (let u = 0; u < n; u++) {
      t[v * n + u] = 0.5 - 0.25 * (Math.cos((2 * Math.PI * (u + 0.5)) / n) + Math.cos((2 * Math.PI * (v + 0.5)) / n));
    }
  }
  return t.sort();
})();
const SHAPE_SCREENS = new Map<string, Float32Array>();
function shapeScreen(shape: string): Float32Array {
  if (shape === 'round') return SCREEN;
  let screen = SHAPE_SCREENS.get(shape);
  if (!screen) {
    screen = Float32Array.from({ length: 4096 }, (_, i) =>
      dotThreshold(((i % 64) + 0.5) / 64, (Math.floor(i / 64) + 0.5) / 64, shape),
    ).sort();
    SHAPE_SCREENS.set(shape, screen);
  }
  return screen;
}

/** Fraction of a cell the shader inks when the value compared against its threshold is `x`. */
export function screenCoverage(x: number, shape = 'round'): number {
  const screen = shapeScreen(shape);
  let lo = 0;
  let hi = screen.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (screen[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo / screen.length;
}

/**
 * Dot radius in cells for an ink coverage 0..1. Up to π/4 the dot is a circle of that area (it then
 * touches the cell edges); beyond, it grows to the cell's half-diagonal, so full coverage is solid.
 */
export function dotRadius(cover: number): number {
  const c = clamp01(cover);
  const knee = Math.PI / 4;
  if (c <= knee) return Math.sqrt(c / Math.PI);
  return 0.5 + ((Math.SQRT1_2 - 0.5) * (c - knee)) / (1 - knee);
}

/** Dot centres of a screen (y up, like gl_FragCoord), covering the image plus one cell around it. */
function lattice(w: number, h: number, cell: number, angle: number): [number, number][] {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  // dither.frag: r = R·p / cell with R·v = (c·x − s·y, s·x + c·y); lattice points are integer r.
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ].map(([x, y]) => [(c * x - s * y) / cell, (s * x + c * y) / cell]);
  const [i0, i1] = [Math.min(...corners.map((r) => r[0])), Math.max(...corners.map((r) => r[0]))];
  const [j0, j1] = [Math.min(...corners.map((r) => r[1])), Math.max(...corners.map((r) => r[1]))];
  const out: [number, number][] = [];
  for (let i = Math.floor(i0) - 1; i <= Math.ceil(i1) + 1; i++) {
    for (let j = Math.floor(j0) - 1; j <= Math.ceil(j1) + 1; j++) {
      const x = cell * (c * i + s * j);
      const y = cell * (-s * i + c * j);
      if (x >= -cell && x <= w + cell && y >= -cell && y <= h + cell) out.push([x, y]);
    }
  }
  return out;
}

/** Average colour (0..1) of the cell-sized box around (x, y). */
function sample(px: Pixels, x: number, y: number, cell: number): [number, number, number] {
  const half = Math.max(0, Math.floor(cell / 2));
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let yy = Math.max(0, cy - half); yy <= Math.min(px.height - 1, cy + half); yy++) {
    for (let xx = Math.max(0, cx - half); xx <= Math.min(px.width - 1, cx + half); xx++) {
      const i = (yy * px.width + xx) * 4;
      r += px.data[i];
      g += px.data[i + 1];
      b += px.data[i + 2];
      n++;
    }
  }
  return n ? [r / n / 255, g / n / 255, b / n / 255] : [1, 1, 1];
}

function circles(
  px: Pixels,
  cell: number,
  angle: number,
  coverAt: (rgb: [number, number, number]) => number,
  shape = 'round',
): string {
  const out: string[] = [];
  for (const [x, y] of lattice(px.width, px.height, cell, angle)) {
    const cover = coverAt(sample(px, x, y, cell));
    const r = dotRadius(cover) * cell;
    if (r < 0.01 * cell) continue;
    if (shape === 'round') out.push(`<circle cx="${num(x)}" cy="${num(px.height - y)}" r="${num(r)}"/>`);
    else {
      const screen = shapeScreen(shape);
      const threshold = cover >= 1 ? 1 : screen[Math.min(screen.length - 1, Math.round(cover * screen.length))];
      const a = (threshold * cell) / 2;
      const rotation = (-angle * 180) / Math.PI;
      let dot: string;
      if (shape === 'ellipse')
        dot = `<ellipse cx="0" cy="0" rx="${num((a * 1.6347783) / 0.65)}" ry="${num((a * 1.6347783) / 1.5)}"/>`;
      else if (shape === 'square')
        dot = `<rect x="${num(-a)}" y="${num(-a)}" width="${num(2 * a)}" height="${num(2 * a)}"/>`;
      else dot = `<path d="M ${num(-2 * a)} 0 L 0 ${num(-2 * a)} L ${num(2 * a)} 0 L 0 ${num(2 * a)} Z"/>`;
      out.push(`<g transform="translate(${num(x)} ${num(px.height - y)}) rotate(${num(rotation)})">${dot}</g>`);
    }
  }
  return out.join('');
}

function wrap(px: Pixels, scale: number, size: SvgSize | undefined, background: string, body: string): string {
  const { width: w, height: h } = px;
  const width = size?.width ?? `${w * scale}`;
  const height = size?.height ?? `${h * scale}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${width}" height="${height}">
<defs><clipPath id="frame"><rect width="${w}" height="${h}"/></clipPath></defs>
<rect width="${w}" height="${h}" fill="${background}"/>
<g clip-path="url(#frame)">
${body}
</g>
</svg>
`;
}

/**
 * One-ink halftone: `ink` dots on `paper`. `spread` is the shader's u_spread (strength × the
 * palette's base spread); dots cover where brightness + spread·(threshold − ½) falls below ½.
 */
export function monoHalftoneSvg(
  px: Pixels,
  opts: {
    cell: number;
    angle: number;
    spread: number;
    ink: string;
    paper: string;
    scale: number;
    size?: SvgSize;
    shape?: string;
    linearLight?: boolean;
  },
): string {
  const spread = Math.max(1e-4, opts.spread);
  const lightness = (hex: string) => hexToRgb(hex).reduce((sum, v, i) => sum + srgbToLinear(v) * LUMA[i], 0);
  const cutoff = opts.linearLight ? (lightness(opts.ink) + lightness(opts.paper)) / 2 : 0.5;
  const cover = ([r, g, b]: [number, number, number]) => {
    const convert = (v: number) => (opts.linearLight ? srgbToLinear(v) : v);
    const l = convert(r) * LUMA[0] + convert(g) * LUMA[1] + convert(b) * LUMA[2];
    return screenCoverage(0.5 + (cutoff - l) / spread, opts.shape);
  };
  const dots = circles(px, opts.cell, (opts.angle * Math.PI) / 180, cover, opts.shape);
  return wrap(px, opts.scale, opts.size, opts.paper, `<g fill="${opts.ink}">${dots}</g>`);
}

/**
 * Four-ink halftone: cyan, magenta, yellow and black screens at their own angles, multiplied over
 * white, separated the same way as dither.frag (grey component replacement, then dot gain).
 */
export interface CmykOptions {
  cell: number;
  /** Screen angles in degrees, C M Y K. */
  angles: [number, number, number, number];
  /** 0..1 */
  dotGain: number;
  /** 0..1 */
  gcr: number;
  scale: number;
  size?: SvgSize;
  shape?: string;
}

const INKS = [
  { name: 'cyan', color: '#00ffff' },
  { name: 'magenta', color: '#ff00ff' },
  { name: 'yellow', color: '#ffff00' },
  { name: 'black', color: '#000000' },
];

/** Each ink's dots (C, M, Y, K), shared by the combined image and the separate plates. */
function cmykDots(px: Pixels, opts: CmykOptions): string[] {
  const amount =
    (ch: number) =>
    ([r, g, b]: [number, number, number]) => {
      const k = (1 - Math.max(r, g, b)) * opts.gcr;
      const rgb = [r, g, b];
      let v = ch === 3 ? k : clamp01((1 - rgb[ch] - k) / Math.max(1 - k, 1e-4));
      v = clamp01(v + opts.dotGain * v * (1 - v));
      return screenCoverage(v, opts.shape);
    };
  return INKS.map((_, ch) => circles(px, opts.cell, (opts.angles[ch] * Math.PI) / 180, amount(ch), opts.shape));
}

export function cmykHalftoneSvg(px: Pixels, opts: CmykOptions): string {
  const body = cmykDots(px, opts)
    .map((dots, ch) => `<g fill="${INKS[ch].color}" style="mix-blend-mode:multiply">${dots}</g>`)
    .join('\n');
  return wrap(px, opts.scale, opts.size, '#ffffff', body);
}

/**
 * The four inks as separate plates for screen printing: black dots on white, one file per ink,
 * with the same dots as cmykHalftoneSvg. With `marks`, a margin carries registration marks at the
 * middle of each side and the plate's name, so the plates can be lined up.
 */
export function cmykSeparations(px: Pixels, opts: CmykOptions & { marks: boolean }): { name: string; svg: string }[] {
  const { width: w, height: h } = px;
  const m = opts.marks ? Math.max(2 * opts.cell, Math.round(0.06 * Math.min(w, h))) : 0;
  const size = opts.size && m ? growSize(opts.size, (w + 2 * m) / w, (h + 2 * m) / h) : opts.size;
  return cmykDots(px, opts).map((dots, ch) => {
    const body = `<g fill="#000000">${dots}</g>`;
    if (!m) return { name: INKS[ch].name, svg: wrap(px, opts.scale, size, '#ffffff', body) };
    const r = m * 0.3;
    const mark = (x: number, y: number) =>
      `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/><path d="M ${num(x - r * 1.6)} ${num(y)} H ${num(x + r * 1.6)} M ${num(x)} ${num(y - r * 1.6)} V ${num(y + r * 1.6)}"/>`;
    const marks = [mark(w / 2, -m / 2), mark(w / 2, h + m / 2), mark(-m / 2, h / 2), mark(w + m / 2, h / 2)].join('');
    const label = `<text x="0" y="${num(h + m * 0.75)}" font-family="sans-serif" font-size="${num(m * 0.35)}">${INKS[ch].name.toUpperCase()}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${w + 2 * m} ${h + 2 * m}" width="${size?.width ?? (w + 2 * m) * opts.scale}" height="${size?.height ?? (h + 2 * m) * opts.scale}">
<defs><clipPath id="frame"><rect width="${w}" height="${h}"/></clipPath></defs>
<rect x="${-m}" y="${-m}" width="${w + 2 * m}" height="${h + 2 * m}" fill="#ffffff"/>
<g clip-path="url(#frame)">
${body}
</g>
<g fill="none" stroke="#000000" stroke-width="${num(Math.max(0.5, m * 0.03))}">${marks}</g>
${label}
</svg>
`;
    return { name: INKS[ch].name, svg };
  });
}

/** A physical size ("120mm") grown by a factor, keeping its unit. */
function growSize(size: SvgSize, fx: number, fy: number): SvgSize {
  const grow = (s: string, f: number) => {
    const m = /^([\d.]+)(\D*)$/.exec(s);
    return m ? `${num(parseFloat(m[1]) * f)}${m[2]}` : s;
  };
  return { width: grow(size.width, fx), height: grow(size.height, fy) };
}
