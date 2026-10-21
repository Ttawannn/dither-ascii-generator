import { ADJUST_KEYS, ANIM_KEYS, ASCII_KEYS, DEFAULTS, DITHER_KEYS, FX_KEYS, MASK_KEYS, sanitize, type Params } from './state';

export interface Preset {
  name: string;
  params: Partial<Params>;
}

/** Keys a preset controls; source options (mirror) and export settings are left alone. */
export const PRESET_KEYS: (keyof Params)[] = [
  'mode',
  ...ADJUST_KEYS,
  ...DITHER_KEYS,
  ...ASCII_KEYS,
  ...FX_KEYS,
  ...MASK_KEYS,
  ...ANIM_KEYS,
  'layer2',
];

export const BUILT_IN: Preset[] = [
  {
    name: 'Mac 1-bit',
    params: { algorithm: 'atkinson', palette: 'mono', ink: '#1a1a1a', paper: '#e8e4d8', pixelSize: 2, contrast: 10 },
  },
  { name: 'Game Boy', params: { algorithm: 'bayer4', palette: 'gameboy', pixelSize: 3, contrast: 15 } },
  {
    name: 'Newsprint',
    params: { algorithm: 'halftone', palette: 'mono', ink: '#111111', paper: '#f1ede4', pixelSize: 1, cellSize: 6, contrast: 20 },
  },
  { name: 'PICO-8', params: { algorithm: 'floyd-steinberg', palette: 'pico8', pixelSize: 3, saturation: 130 } },
  {
    name: 'Blueprint',
    params: { algorithm: 'lines', palette: 'mono', ink: '#0b2a6b', paper: '#dbe8ff', pixelSize: 1, cellSize: 5, angle: 30 },
  },
  { name: 'Riso boil', params: { algorithm: 'bluenoise', palette: 'mono', ink: '#1d1a4d', paper: '#ff6f61', animate: true, boilFps: 8 } },
  {
    name: 'Terminal',
    params: { mode: 'ascii', asciiCharset: 'standard', asciiFg: '#33ff66', asciiBg: '#001a05', asciiColumns: 120 },
  },
  { name: 'Braille', params: { mode: 'ascii', asciiCharset: 'braille', asciiDither: true, asciiColumns: 100 } },
  {
    name: 'Matrix',
    params: {
      mode: 'ascii',
      asciiCharset: 'katakana',
      asciiFg: '#00ff41',
      asciiBg: '#000000',
      asciiDepth: 12,
      animate: true,
      boilFps: 12,
    },
  },
  { name: 'Colour ASCII', params: { mode: 'ascii', asciiCharset: 'detailed', asciiColor: 'color', asciiColumns: 160 } },
  {
    name: 'Runes',
    params: { mode: 'ascii', asciiCharset: 'runic', asciiFg: '#2b1d0e', asciiBg: '#e8dcc0', asciiColumns: 110, contrast: 20 },
  },
  {
    name: 'Glyph cycle',
    params: {
      mode: 'ascii',
      asciiCharset: 'shapes',
      asciiColor: 'palette',
      asciiPalette: 'pico8',
      asciiOffsetLfo: 'saw',
      asciiOffsetSpeed: 0.25,
      asciiOffsetAmount: 100,
    },
  },
  {
    name: 'CRT terminal',
    params: {
      mode: 'ascii',
      asciiCharset: 'standard',
      asciiFg: '#33ff66',
      asciiBg: '#001a05',
      fxGlow: true,
      fxGlowRadius: 4,
      fxGlowIntensity: 90,
      fxGlowThreshold: 40,
      fxScan: true,
      fxScanCurve: 35,
      fxVignette: true,
    },
  },
  {
    name: 'VHS glitch',
    params: {
      algorithm: 'bayer4',
      palette: 'rgb',
      levels: 3,
      pixelSize: 2,
      fxGlitch: true,
      fxGlitchAmount: 35,
      fxChroma: true,
      fxChromaAmount: 4,
      fxGrain: true,
      animate: true,
      boilFps: 10,
    },
  },
  {
    name: 'Bar chart',
    params: { mode: 'ascii', asciiCharset: 'bars-v', asciiSpace: true, asciiFg: '#ffb000', asciiBg: '#120800', asciiColumns: 140 },
  },
  {
    name: 'Woodcut',
    params: { mode: 'ascii', asciiCharset: 'standard', asciiEdges: true, asciiEdgeThreshold: 35, asciiFg: '#1a1a1a', asciiBg: '#e8e4d8', contrast: 25 },
  },
];

/** Full set of preset-controlled values: defaults overlaid with the preset. */
export function resolvePreset(p: Preset): Partial<Params> {
  const out: Partial<Params> = {};
  for (const key of PRESET_KEYS) (out as Record<string, unknown>)[key] = DEFAULTS[key];
  return { ...out, ...p.params };
}

/** The preset-controlled subset of the current params. */
export function snapshot(params: Params): Partial<Params> {
  const out: Partial<Params> = {};
  for (const key of PRESET_KEYS) (out as Record<string, unknown>)[key] = params[key];
  return out;
}

// ---------- preset files ----------

/** One look as a file, in the shape `importPreset()` reads back. */
export const presetFile = (p: Preset): string => JSON.stringify({ name: p.name, params: p.params }, null, 2);

/** Several looks in one file, as `importPresetList()` reads back. */
export const presetListFile = (list: Preset[]): string =>
  JSON.stringify({ presets: list.map((p) => ({ name: p.name, params: p.params })) }, null, 2);

/** A safe file name for a look (keeps letters in any script, drops characters filesystems reject). */
export function presetFileName(name: string): string {
  const base = name
    // Control characters are among those filesystems reject.
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${base || 'look'}.json`;
}

// ---------- saved presets ----------

const STORAGE_KEY = 'dag.presets.v1';

export function loadSaved(): Preset[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((p): p is { name: string; params: unknown } => typeof p?.name === 'string')
      .map((p) => ({ name: p.name.slice(0, 40), params: sanitize(p.params) }));
  } catch {
    return [];
  }
}

export function storeSaved(list: Preset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ---------- share links ----------

/** Only values that differ from the defaults go into the link, to keep it short. */
export function encodeShare(params: Params): string {
  const diff: Record<string, unknown> = {};
  for (const key of PRESET_KEYS) if (params[key] !== DEFAULTS[key]) diff[key] = params[key];
  const bytes = new TextEncoder().encode(JSON.stringify(diff));
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(hash: string): Partial<Params> | null {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const values = sanitize(JSON.parse(new TextDecoder().decode(bytes)));
    // A link describes a complete look: unspecified keys fall back to defaults.
    return resolvePreset({ name: 'link', params: values });
  } catch {
    return null;
  }
}
