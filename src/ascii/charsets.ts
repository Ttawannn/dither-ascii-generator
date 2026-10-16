export interface Charset {
  id: string;
  label: string;
  /** Glyphs ordered sparse → dense. Empty for special sets (braille, custom). */
  chars: string;
}

export const CHARSETS: Charset[] = [
  { id: 'standard', label: 'Standard', chars: ' .:-=+*#%@' },
  {
    id: 'detailed',
    label: 'Detailed (70)',
    chars: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  },
  { id: 'blocks', label: 'Blocks', chars: ' ░▒▓█' },
  { id: 'braille', label: 'Braille (2×4 dots)', chars: '' },
  { id: 'binary', label: 'Binary', chars: '10' },
  { id: 'custom', label: 'Custom', chars: '' },
];

/** Edge glyphs appended after the ramp, indexed by direction: horizontal, rising, vertical, falling. */
export const EDGE_CHARS = ['-', '/', '|', '\\'];

export interface FontDef {
  id: string;
  label: string;
  family: string;
}

export const FONTS: FontDef[] = [
  { id: 'jetbrains', label: 'JetBrains Mono', family: '"JetBrains Mono"' },
  { id: 'plex', label: 'IBM Plex Mono', family: '"IBM Plex Mono"' },
  { id: 'vt323', label: 'VT323 (pixel)', family: '"VT323"' },
  { id: 'courier', label: 'Courier', family: '"Courier New", Courier' },
];

export const COLOR_MODES = [
  { id: 'mono', label: 'Mono (foreground / background)' },
  { id: 'color', label: 'Image colour' },
  { id: 'colorBg', label: 'Image colour background' },
];

export function getFont(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** Ramp glyphs for a charset id ('braille' returns null). Always at least two glyphs. */
export function rampFor(charset: string, custom: string): string[] | null {
  if (charset === 'braille') return null;
  const chars = charset === 'custom' ? custom : (CHARSETS.find((c) => c.id === charset) ?? CHARSETS[0]).chars;
  const glyphs = [...new Set([...chars])]; // dedupe, keep order; handles non-BMP characters
  if (glyphs.length === 0) return [' ', '#'];
  if (glyphs.length === 1) return glyphs[0] === ' ' ? [' ', '#'] : [' ', glyphs[0]];
  return glyphs;
}
