import { EDGE_CHARS, FALLBACK_FONTS, getFont } from './charsets';
import { SHAPE_H, SHAPE_W, SHAPE_SAMPLES } from './shape';

export const ATLAS_COLUMNS = 16;

export interface Atlas {
  key: string;
  canvas: HTMLCanvasElement;
  cellW: number;
  cellH: number;
  /** Glyph strings in atlas order (index = glyph id). Ramp glyphs come first, sorted sparse → dense. */
  glyphs: string[];
  /** Number of ramp glyphs (0 for braille); edge glyphs follow at rampSize .. rampSize+3. */
  rampSize: number;
  /** Glyphs dropped because no available font could draw them. */
  missing: string[];
  fontCss: string;
  shapes: Float32Array;
}

/** Braille bit → (column, row) within the 2×4 dot cell, following Unicode dot numbering. */
export const BRAILLE_DOTS: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
];

// Shade blocks drawn as 1px patterns so they stay crisp at any size.
const SHADES: Record<string, (x: number, y: number) => boolean> = {
  '░': (x, y) => x % 2 === 0 && y % 2 === 0,
  '▒': (x, y) => (x + y) % 2 === 0,
  '▓': (x, y) => !(x % 2 === 1 && y % 2 === 1),
  '█': () => true,
};

export function atlasKey(
  ramp: string[] | null,
  fontId: string,
  size: number,
  lineHeight: number,
  bold = false,
): string {
  return JSON.stringify([ramp ?? 'braille', fontId, size, lineHeight, bold]);
}

interface Metrics {
  fontCss: string;
  cellW: number;
  cellH: number;
  baseline: number;
}

function drawGlyph(g: CanvasRenderingContext2D, ch: string, x0: number, y0: number, m: Metrics): void {
  const shade = SHADES[ch];
  if (shade) {
    for (let y = 0; y < m.cellH; y++)
      for (let x = 0; x < m.cellW; x++) if (shade(x, y)) g.fillRect(x0 + x, y0 + y, 1, 1);
    return;
  }
  g.save();
  g.beginPath();
  g.rect(x0, y0, m.cellW, m.cellH);
  g.clip();
  g.fillText(ch, x0 + m.cellW / 2, y0 + m.baseline);
  g.restore();
}

function drawBraille(g: CanvasRenderingContext2D, bits: number, x0: number, y0: number, w: number, h: number): void {
  const r = Math.max(0.6, Math.min(w / 2, h / 4) * 0.32);
  BRAILLE_DOTS.forEach(([cx, cy], bit) => {
    if (!(bits & (1 << bit))) return;
    g.beginPath();
    g.arc(x0 + (w * (cx * 2 + 1)) / 4, y0 + (h * (cy * 2 + 1)) / 8, r, 0, Math.PI * 2);
    g.fill();
  });
}

function context(w: number, h: number, m: Metrics): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  g.font = m.fontCss;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  return g;
}

/**
 * Measure every glyph alone in a cell, drop the ones no font could draw, and sort the rest by ink
 * coverage so any character set works as a brightness ramp.
 */
function sortByCoverage(ramp: string[], m: Metrics): { sorted: string[]; missing: string[] } {
  const g = context(m.cellW, m.cellH, m);
  const raster = (ch: string) => {
    g.clearRect(0, 0, m.cellW, m.cellH);
    drawGlyph(g, ch, 0, 0, m);
    return g.getImageData(0, 0, m.cellW, m.cellH).data;
  };
  const sameAs = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((v, i) => v === b[i]);
  // A private-use code point renders as the "missing glyph" box (or nothing) in every font.
  const notdef = raster('');

  const measured: { ch: string; ink: number; order: number }[] = [];
  const missing: string[] = [];
  ramp.forEach((ch, order) => {
    const px = raster(ch);
    let ink = 0;
    for (let i = 3; i < px.length; i += 4) ink += px[i];
    const blank = ch === ' ' || ch === '⠀'; // intentionally empty glyphs
    if (!blank && (ink === 0 || sameAs(px, notdef))) missing.push(ch);
    else measured.push({ ch, ink, order });
  });
  measured.sort((a, b) => a.ink - b.ink || a.order - b.order);
  return { sorted: measured.map((m) => m.ch), missing };
}

/** Render glyphs white-on-transparent into a 16-column grid. `ramp === null` means braille. */
export async function buildAtlas(
  ramp: string[] | null,
  fontId: string,
  size: number,
  lineHeight: number,
  bold = false,
): Promise<Atlas> {
  const font = getFont(fontId);
  const fontCss = `${bold ? 'bold ' : ''}${size}px ${font.family}, ${FALLBACK_FONTS}`;
  // Passing the glyphs makes the browser fetch only the fallback subsets that cover them.
  await document.fonts.load(fontCss, ramp ? ramp.join('') + EDGE_CHARS.join('') : 'M').catch(() => undefined);

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = fontCss;
  const mm = measure.measureText('M');
  const cellW = Math.max(2, Math.round(mm.width));
  const cellH = Math.max(2, Math.round(size * lineHeight));
  const ascent = mm.fontBoundingBoxAscent || size * 0.8;
  const descent = mm.fontBoundingBoxDescent || size * 0.2;
  const m: Metrics = { fontCss, cellW, cellH, baseline: Math.round((cellH - (ascent + descent)) / 2 + ascent) };

  let rampGlyphs: string[] = [];
  let missing: string[] = [];
  if (ramp) {
    ({ sorted: rampGlyphs, missing } = sortByCoverage(ramp, m));
    if (rampGlyphs.length < 2) rampGlyphs = [' ', '#']; // nothing drawable: fall back to something visible
  }
  const glyphs = ramp
    ? [...rampGlyphs, ...EDGE_CHARS]
    : Array.from({ length: 256 }, (_, i) => String.fromCharCode(0x2800 + i));

  const rows = Math.ceil(glyphs.length / ATLAS_COLUMNS);
  const g = context(ATLAS_COLUMNS * cellW, rows * cellH, m);
  glyphs.forEach((ch, i) => {
    const x0 = (i % ATLAS_COLUMNS) * cellW;
    const y0 = Math.floor(i / ATLAS_COLUMNS) * cellH;
    if (ramp === null) drawBraille(g, i, x0, y0, cellW, cellH);
    else drawGlyph(g, ch, x0, y0, m);
  });

  const small = document.createElement('canvas');
  small.width = SHAPE_W;
  small.height = SHAPE_H;
  const sg = small.getContext('2d', { willReadFrequently: true })!;
  const shapes = new Float32Array(glyphs.length * SHAPE_SAMPLES);
  glyphs.forEach((_, i) => {
    sg.clearRect(0, 0, SHAPE_W, SHAPE_H);
    sg.drawImage(
      g.canvas,
      (i % ATLAS_COLUMNS) * cellW,
      Math.floor(i / ATLAS_COLUMNS) * cellH,
      cellW,
      cellH,
      0,
      0,
      SHAPE_W,
      SHAPE_H,
    );
    const px = sg.getImageData(0, 0, SHAPE_W, SHAPE_H).data;
    for (let j = 0; j < SHAPE_SAMPLES; j++) shapes[i * SHAPE_SAMPLES + j] = px[j * 4 + 3] / 255;
  });
  return {
    key: atlasKey(ramp, fontId, size, lineHeight, bold),
    canvas: g.canvas,
    cellW,
    cellH,
    glyphs,
    rampSize: ramp ? rampGlyphs.length : 0,
    missing,
    fontCss,
    shapes,
  };
}
