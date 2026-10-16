import { BRAILLE_DOTS } from './atlas';

export interface GridOptions {
  /** Ramp size; 0 means braille. Edge glyphs live at rampSize .. rampSize+3. */
  rampSize: number;
  edges: boolean;
  /** 0..1 */
  edgeThreshold: number;
  dither: boolean;
  /** True when glyphs are lighter than the background, so bright pixels get dense glyphs. */
  lightOnDark: boolean;
}

export interface AsciiGrid {
  cols: number;
  rows: number;
  /** RGBA per cell, top row first: rgb = average colour, a = glyph index. */
  cells: Uint8Array;
  /** Glyph index per cell, top row first. */
  glyphIds: Uint16Array;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

/**
 * Turn the adjusted image (RGBA, bottom row first, as read back from WebGL) into glyph ids.
 * Ramp mode expects one pixel per cell; braille expects 2×4 pixels per cell.
 */
export function buildGrid(data: Uint8Array, cols: number, rows: number, opts: GridOptions): AsciiGrid {
  const braille = opts.rampSize === 0;
  const gw = braille ? cols * 2 : cols;
  const gh = braille ? rows * 4 : rows;

  // Luma, top row first.
  const luma = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const src = (gh - 1 - y) * gw * 4;
    for (let x = 0; x < gw; x++) {
      const i = src + x * 4;
      luma[y * gw + x] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    }
  }
  const density = (v: number) => (opts.lightOnDark ? v : 1 - v);
  const pixel = (x: number, y: number) => (gh - 1 - y) * gw * 4 + x * 4;

  const cells = new Uint8Array(cols * rows * 4);
  const glyphIds = new Uint16Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = row * cols + col;
      let glyph = 0;
      let r = 0;
      let g = 0;
      let b = 0;

      if (braille) {
        BRAILLE_DOTS.forEach(([dx, dy], bit) => {
          const x = col * 2 + dx;
          const y = row * 4 + dy;
          const threshold = opts.dither ? bayer(x, y) : 0.5;
          if (density(luma[y * gw + x]) > threshold) glyph |= 1 << bit;
          const p = pixel(x, y);
          r += data[p];
          g += data[p + 1];
          b += data[p + 2];
        });
        r /= 8;
        g /= 8;
        b /= 8;
      } else {
        const p = pixel(col, row);
        r = data[p];
        g = data[p + 1];
        b = data[p + 2];
        const n = opts.rampSize;
        let d = density(luma[c]);
        if (opts.dither) d += (bayer(col, row) - 0.5) / (n - 1);
        glyph = Math.min(n - 1, Math.max(0, Math.round(d * (n - 1))));
        if (opts.edges) {
          const edge = edgeGlyph(luma, cols, rows, col, row, opts.edgeThreshold);
          if (edge >= 0) glyph = n + edge;
        }
      }

      glyphIds[c] = glyph;
      cells[c * 4] = r;
      cells[c * 4 + 1] = g;
      cells[c * 4 + 2] = b;
      cells[c * 4 + 3] = glyph;
    }
  }
  return { cols, rows, cells, glyphIds };
}

/** Sobel edge direction at a cell: 0 '-', 1 '/', 2 '|', 3 '\', or -1 for no edge. */
function edgeGlyph(l: Float32Array, w: number, h: number, x: number, y: number, threshold: number): number {
  const at = (dx: number, dy: number) =>
    l[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
  const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
  const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
  const mag = Math.hypot(gx, gy) / 4;
  if (mag < 0.03 + threshold * 0.6) return -1;
  // Edge runs perpendicular to the gradient; y is down here, so flip to get the on-screen angle.
  let angle = (Math.atan2(-gx, -gy) * 180) / Math.PI;
  angle = ((angle % 180) + 180) % 180;
  return Math.round(angle / 45) % 4;
}

export function gridToText(grid: AsciiGrid, glyphs: string[]): string {
  const lines: string[] = [];
  for (let row = 0; row < grid.rows; row++) {
    let line = '';
    for (let col = 0; col < grid.cols; col++) line += glyphs[grid.glyphIds[row * grid.cols + col]];
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!);
const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Standalone HTML page; colour modes become runs of coloured spans. */
export function gridToHtml(
  grid: AsciiGrid,
  glyphs: string[],
  opts: { title: string; fontCss: string; lineHeight: number; mode: string; fg: string; bg: string },
): string {
  const lines: string[] = [];
  for (let row = 0; row < grid.rows; row++) {
    let line = '';
    let runStyle = '';
    let run = '';
    const flush = () => {
      if (!run) return;
      line += runStyle ? `<span style="${runStyle}">${escapeHtml(run)}</span>` : escapeHtml(run);
      run = '';
    };
    for (let col = 0; col < grid.cols; col++) {
      const c = row * grid.cols + col;
      const color = hex(grid.cells[c * 4], grid.cells[c * 4 + 1], grid.cells[c * 4 + 2]);
      const style = opts.mode === 'color' ? `color:${color}` : opts.mode === 'colorBg' ? `background:${color}` : '';
      if (style !== runStyle) {
        flush();
        runStyle = style;
      }
      run += glyphs[grid.glyphIds[c]];
    }
    flush();
    lines.push(line);
  }
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono&family=IBM+Plex+Mono&family=VT323&display=swap" rel="stylesheet">
<style>body{margin:0;background:${opts.bg}}pre{margin:0;padding:16px;font:${opts.fontCss};line-height:${opts.lineHeight};color:${opts.fg};background:${opts.bg};white-space:pre}</style>
</head><body><pre>${lines.join('\n')}</pre></body></html>
`;
}
