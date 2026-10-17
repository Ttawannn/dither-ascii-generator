export interface Charset {
  id: string;
  label: string;
  group: string;
  /** Glyphs in any order: they are sorted by measured ink coverage when the atlas is built. Empty for braille / custom. */
  chars: string;
}

export const CHARSET_GROUPS: { id: string; label: string }[] = [
  { id: 'classic', label: 'Classic ASCII' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'lines', label: 'Lines & boxes' },
  { id: 'braille', label: 'Braille' },
  { id: 'geometric', label: 'Geometric' },
  { id: 'languages', label: 'Languages' },
  { id: 'games', label: 'Cards & games' },
  { id: 'unicode', label: 'Unicode' },
  { id: 'custom', label: 'Custom' },
];

const set = (group: string, id: string, label: string, chars: string): Charset => ({ id, label, group, chars });

// Ids of the original sets (standard, detailed, blocks, braille, binary, custom) are kept stable:
// saved presets and share links refer to them.
export const CHARSETS: Charset[] = [
  set('classic', 'standard', 'Standard', ' .:-=+*#%@'),
  set('classic', 'detailed', 'Detailed (70)', ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'),
  set('classic', 'simple', 'Simple', ' .oO@'),
  set('classic', 'minimal', 'Minimal', ' .:#'),
  set('classic', 'upper', 'Capitals', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
  set('classic', 'lower', 'Lowercase', 'abcdefghijklmnopqrstuvwxyz'),
  set('classic', 'code', 'Code', '{}[]()<>;:=/*&|'),

  set('numbers', 'binary', 'Binary', '10'),
  set('numbers', 'digits', 'Digits', '0123456789'),
  set('numbers', 'hex', 'Hexadecimal', '0123456789ABCDEF'),
  set('numbers', 'roman', 'Roman numerals', 'IVXLCDM'),
  set('numbers', 'fractions', 'Fractions', '½⅓¼⅕⅙⅛⅔¾'),

  set('symbols', 'punctuation', 'Punctuation', '.,:;\'"!?-_'),
  set('symbols', 'brackets', 'Brackets', '()[]{}<>⟨⟩'),
  set('symbols', 'math', 'Math', '+−×÷=≠<>±∑∏√∞∫'),
  set('symbols', 'currency', 'Currency', '$€£¥₩₿¢₹'),
  set('symbols', 'arrows', 'Arrows', '←↑→↓↖↗↘↙↔↕⇐⇑⇒⇓'),

  set('blocks', 'blocks', 'Shades', ' ░▒▓█'),
  set('blocks', 'quadrants', 'Quadrants', '▘▝▖▗▚▞▀▄▌▐▛▜▙▟█'),
  set('blocks', 'bars-v', 'Vertical bars', '▁▂▃▄▅▆▇█'),
  set('blocks', 'bars-h', 'Horizontal bars', '▏▎▍▌▋▊▉█'),

  set('lines', 'box', 'Box drawing', '─│┌┐└┘├┤┬┴┼'),
  set('lines', 'box-double', 'Double box', '═║╔╗╚╝╠╣╦╩╬'),
  set('lines', 'diagonals', 'Diagonals', '╱╲╳'),
  set('lines', 'slashes', 'Slashes', '/\\|-_'),
  set('lines', 'dashes', 'Dashes', '·‐–—―═'),

  set('braille', 'braille', 'Braille (2×4 dots)', ''),
  set('braille', 'braille-ramp', 'Braille ramp', '⠀⠁⠃⠇⡇⣇⣧⣷⣿'),

  set('geometric', 'circles', 'Circles', '·∘○◎●◉'),
  set('geometric', 'squares', 'Squares', '▫□▢▣■'),
  set('geometric', 'triangles', 'Triangles', '▵▴△▲'),
  set('geometric', 'diamonds', 'Diamonds', '◇◈◆'),
  set('geometric', 'stars', 'Stars', '·✧✦★✶✷✸'),
  set('geometric', 'shapes', 'Mixed shapes', '·∙•○●□■◇◆'),

  set('languages', 'katakana', 'Katakana', 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'),
  set('languages', 'greek', 'Greek', 'αβγδεζηθικλμνξοπρστυφχψω'),
  set('languages', 'cyrillic', 'Cyrillic', 'абвгдежзийклмнопрстуфхцчшщъыьэюя'),
  set('languages', 'runic', 'Runic', 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'),
  set('languages', 'hebrew', 'Hebrew', 'אבגדהוזחטיכלמנסעפצקרשת'),

  set('games', 'suits', 'Card suits', '♠♣♥♦♤♧♡♢'),
  set('games', 'chess', 'Chess', '♙♘♗♖♕♔♟♞♝♜♛♚'),
  set('games', 'dice', 'Dice', '⚀⚁⚂⚃⚄⚅'),

  set('unicode', 'weather', 'Weather', '☀☁☂☃☄★☆'),
  set('unicode', 'music', 'Music', '♩♪♫♬♭♮♯'),
  set('unicode', 'flowers', 'Flowers & snow', '✿❀❁❂❃❄❅❆'),
  set('unicode', 'crosses', 'Crosses', '✚✛✜✢✣✤✥✙✠'),
  set('unicode', 'signs', 'Signs', '☯☮☢☣⚡⚙⚛'),

  set('custom', 'custom', 'Custom', ''),
];

/** Edge glyphs appended after the ramp, indexed by direction: horizontal, rising, vertical, falling. */
export const EDGE_CHARS = ['-', '/', '|', '\\'];

/** Atlas glyph ids are stored in 8 bits, and four slots are taken by edge glyphs. */
export const MAX_RAMP = 252;
export const MAX_INJECT = 10;

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

/** Fallbacks for glyphs the chosen font lacks; only the subsets actually used are downloaded. */
export const FALLBACK_FONTS =
  '"Noto Sans Symbols 2", "Noto Sans Math", "Noto Sans Runic", "Noto Sans Hebrew", "Noto Sans JP", "Noto Sans", monospace';

export const COLOR_MODES = [
  { id: 'mono', label: 'Mono (text / background)' },
  { id: 'color', label: 'Image colour' },
  { id: 'palette', label: 'Palette colours' },
  { id: 'colorBg', label: 'Image colour background' },
];

/** Palettes offered for palette-coloured characters ("image" extracts 8 colours from the source). */
export const ASCII_PALETTES = ['pico8', 'c64', 'cga', 'gameboy', 'image'];

export function getFont(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

export function getCharset(id: string): Charset {
  return CHARSETS.find((c) => c.id === id) ?? CHARSETS[0];
}

/**
 * Glyphs for a charset before density sorting: the set (or the custom ramp), plus injected
 * characters, deduplicated. `space` adds a blank glyph, or removes it when false. Returns null for braille.
 */
export function rampFor(charset: string, custom: string, inject = '', space = true): string[] | null {
  if (charset === 'braille') return null;
  const base = charset === 'custom' ? custom : getCharset(charset).chars;
  const glyphs = [...new Set([...base, ...[...inject].slice(0, MAX_INJECT)])].filter(
    (g) => g !== '\n' && g !== '\t' && (space || g !== ' '),
  );
  if (space && !glyphs.includes(' ')) glyphs.unshift(' ');
  if (glyphs.length === 0) return [' ', '#'];
  if (glyphs.length === 1) return glyphs[0] === ' ' ? [' ', '#'] : [' ', glyphs[0]];
  return glyphs.slice(0, MAX_RAMP);
}

/**
 * Indices into a density-sorted ramp of length `n` for `depth` evenly spaced levels
 * (all of them when depth >= n), sparse → dense.
 */
export function pickLevels(n: number, depth: number): number[] {
  const count = Math.max(2, Math.min(n, Math.round(depth)));
  if (count >= n) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
}
