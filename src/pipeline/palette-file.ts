import { HEX_IN_TEXT, MAX_PALETTE, normalizeHex } from './palettes';

/**
 * Reads palette files: JSON in any shape that holds a list of colours, `.hex` (one colour per
 * line), GIMP `.gpl`, or any text containing `#rrggbb` codes.
 */

const byte = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 255;
const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** One colour from a JSON value: a hex string, or an object with 0–255 `r`, `g`, `b`. */
function jsonColor(v: unknown): string | null {
  if (typeof v === 'string') return normalizeHex(v);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const { r, g, b } = v as Record<string, unknown>;
    if (byte(r) && byte(g) && byte(b)) return toHex(r, g, b);
    const hex = (v as Record<string, unknown>).hex ?? (v as Record<string, unknown>).color;
    if (typeof hex === 'string') return normalizeHex(hex);
  }
  return null;
}

/** First array (breadth-first) whose items are all colours, with at least two of them. */
function findColorArray(root: unknown): string[] | null {
  const queue: unknown[] = [root];
  while (queue.length) {
    const v = queue.shift();
    if (Array.isArray(v)) {
      const colors = v.map(jsonColor);
      if (v.length >= 2 && colors.every((c) => c !== null)) return colors as string[];
      queue.push(...v);
    } else if (v && typeof v === 'object') {
      queue.push(...Object.values(v));
    }
  }
  return null;
}

export interface PaletteFile {
  name: string | null;
  colors: string[];
  /** Colours dropped because the file had more than MAX_PALETTE. */
  dropped: number;
}

function result(name: string | null, colors: string[]): PaletteFile | null {
  if (colors.length < 2) return null;
  return { name, colors: colors.slice(0, MAX_PALETTE), dropped: Math.max(0, colors.length - MAX_PALETTE) };
}

/** Read a palette file's text. Returns null when it holds fewer than two colours. */
export function parsePaletteFile(text: string): PaletteFile | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      const name = data && typeof data === 'object' && 'name' in data && typeof data.name === 'string' ? data.name : null;
      return result(name, findColorArray(data) ?? []);
    } catch {
      // Not JSON after all; fall through to the text formats.
    }
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim());

  if (/^GIMP Palette/i.test(lines[0] ?? '')) {
    const name = lines.find((l) => /^Name:/i.test(l))?.replace(/^Name:\s*/i, '') || null;
    const colors: string[] = [];
    for (const line of lines.slice(1)) {
      const m = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/.exec(line);
      if (!m) continue;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (byte(r) && byte(g) && byte(b)) colors.push(toHex(r, g, b));
    }
    return result(name, colors);
  }

  // `.hex`: one bare `rrggbb` per line.
  const bare = lines.filter(Boolean);
  if (bare.length >= 2 && bare.every((l) => /^#?[0-9a-f]{6}$/i.test(l))) {
    return result(null, bare.map((l) => normalizeHex(l)!));
  }

  return result(null, [...trimmed.matchAll(HEX_IN_TEXT)].map((m) => normalizeHex(m[0])!));
}
