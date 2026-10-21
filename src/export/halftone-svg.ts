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

/** Fraction of a cell the shader inks when the value compared against its threshold is `x`. */
export function screenCoverage(x: number): number {
  let lo = 0;
  let hi = SCREEN.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (SCREEN[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo / SCREEN.length;
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
): string {
  const out: string[] = [];
  for (const [x, y] of lattice(px.width, px.height, cell, angle)) {
    const r = dotRadius(coverAt(sample(px, x, y, cell))) * cell;
    if (r < 0.01 * cell) continue;
    out.push(`<circle cx="${num(x)}" cy="${num(px.height - y)}" r="${num(r)}"/>`);
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
  opts: { cell: number; angle: number; spread: number; ink: string; paper: string; scale: number; size?: SvgSize },
): string {
  const spread = Math.max(1e-4, opts.spread);
  const cover = ([r, g, b]: [number, number, number]) => {
    const l = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
    return screenCoverage(0.5 + (0.5 - l) / spread);
  };
  const dots = circles(px, opts.cell, (opts.angle * Math.PI) / 180, cover);
  return wrap(px, opts.scale, opts.size, opts.paper, `<g fill="${opts.ink}">${dots}</g>`);
}

/**
 * Four-ink halftone: cyan, magenta, yellow and black screens at their own angles, multiplied over
 * white, separated the same way as dither.frag (grey component replacement, then dot gain).
 */
export function cmykHalftoneSvg(
  px: Pixels,
  opts: {
    cell: number;
    /** Screen angles in degrees, C M Y K. */
    angles: [number, number, number, number];
    /** 0..1 */
    dotGain: number;
    /** 0..1 */
    gcr: number;
    scale: number;
    size?: SvgSize;
  },
): string {
  const inks = ['#00ffff', '#ff00ff', '#ffff00', '#000000'];
  const amount = (ch: number) => ([r, g, b]: [number, number, number]) => {
    const k = (1 - Math.max(r, g, b)) * opts.gcr;
    const rgb = [r, g, b];
    let v = ch === 3 ? k : clamp01((1 - rgb[ch] - k) / Math.max(1 - k, 1e-4));
    v = clamp01(v + opts.dotGain * v * (1 - v));
    return screenCoverage(v);
  };
  const body = inks
    .map((ink, ch) => {
      const dots = circles(px, opts.cell, (opts.angles[ch] * Math.PI) / 180, amount(ch));
      return `<g fill="${ink}" style="mix-blend-mode:multiply">${dots}</g>`;
    })
    .join('\n');
  return wrap(px, opts.scale, opts.size, '#ffffff', body);
}
