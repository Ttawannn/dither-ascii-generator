import { EDGE_CHARS, getFont } from './charsets';

export const ATLAS_COLUMNS = 16;

export interface Atlas {
  key: string;
  canvas: HTMLCanvasElement;
  cellW: number;
  cellH: number;
  /** Glyph strings in atlas order (index = glyph id). */
  glyphs: string[];
  /** Number of ramp glyphs; edge glyphs follow at rampSize .. rampSize+3. */
  rampSize: number;
  fontCss: string;
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

export function atlasKey(ramp: string[] | null, fontId: string, size: number, lineHeight: number): string {
  return JSON.stringify([ramp ?? 'braille', fontId, size, lineHeight]);
}

/** Render glyphs white-on-transparent into a 16-column grid. `ramp === null` means braille. */
export async function buildAtlas(
  ramp: string[] | null,
  fontId: string,
  size: number,
  lineHeight: number,
): Promise<Atlas> {
  const font = getFont(fontId);
  const fontCss = `${size}px ${font.family}, monospace`;
  await document.fonts.load(fontCss).catch(() => undefined);

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = fontCss;
  const m = measure.measureText('M');
  const cellW = Math.max(2, Math.round(m.width));
  const cellH = Math.max(2, Math.round(size * lineHeight));

  const glyphs =
    ramp === null
      ? Array.from({ length: 256 }, (_, i) => String.fromCharCode(0x2800 + i))
      : [...ramp, ...EDGE_CHARS];

  const rows = Math.ceil(glyphs.length / ATLAS_COLUMNS);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * cellW;
  canvas.height = rows * cellH;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.font = fontCss;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  const ascent = m.fontBoundingBoxAscent || size * 0.8;
  const descent = m.fontBoundingBoxDescent || size * 0.2;
  const baseline = Math.round((cellH - (ascent + descent)) / 2 + ascent);

  glyphs.forEach((ch, i) => {
    const x0 = (i % ATLAS_COLUMNS) * cellW;
    const y0 = Math.floor(i / ATLAS_COLUMNS) * cellH;

    if (ramp === null) {
      drawBraille(g, i, x0, y0, cellW, cellH);
      return;
    }
    const shade = SHADES[ch];
    if (shade) {
      for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) if (shade(x, y)) g.fillRect(x0 + x, y0 + y, 1, 1);
      return;
    }
    g.save();
    g.beginPath();
    g.rect(x0, y0, cellW, cellH);
    g.clip();
    g.fillText(ch, x0 + cellW / 2, y0 + baseline);
    g.restore();
  });

  return { key: atlasKey(ramp, fontId, size, lineHeight), canvas, cellW, cellH, glyphs, rampSize: ramp?.length ?? 0, fontCss };
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
