import { CHARSETS, COLOR_MODES, FONTS } from './ascii/charsets';
import { ALGORITHMS } from './pipeline/algorithms';
import { PALETTES } from './pipeline/palettes';

export type Mode = 'dither' | 'ascii';

export interface Params {
  mode: Mode;
  // adjust
  pixelSize: number;
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  sharpen: number;
  invert: boolean;
  // dither
  algorithm: string;
  strength: number;
  threshold: number;
  cellSize: number;
  angle: number;
  diffusion: number;
  serpentine: boolean;
  palette: string;
  levels: number;
  ink: string;
  paper: string;
  // ascii
  asciiCharset: string;
  asciiCustom: string;
  asciiColumns: number;
  asciiFont: string;
  asciiFontSize: number;
  asciiLineHeight: number;
  asciiColor: string;
  asciiFg: string;
  asciiBg: string;
  asciiEdges: boolean;
  asciiEdgeThreshold: number;
  asciiDither: boolean;
}

export const DEFAULTS: Params = {
  mode: 'dither',
  pixelSize: 2,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  saturation: 100,
  sharpen: 0,
  invert: false,
  algorithm: 'atkinson',
  strength: 100,
  threshold: 50,
  cellSize: 6,
  angle: 45,
  diffusion: 100,
  serpentine: true,
  palette: 'mono',
  levels: 2,
  ink: '#000000',
  paper: '#ffffff',
  asciiCharset: 'standard',
  asciiCustom: ' .oO@',
  asciiColumns: 120,
  asciiFont: 'jetbrains',
  asciiFontSize: 12,
  asciiLineHeight: 1,
  asciiColor: 'mono',
  asciiFg: '#f2f2f2',
  asciiBg: '#0a0a0a',
  asciiEdges: false,
  asciiEdgeThreshold: 50,
  asciiDither: false,
};

type KeysOfType<T> = { [K in keyof Params]: Params[K] extends T ? K : never }[keyof Params];
export type NumericKey = KeysOfType<number>;
export type BooleanKey = KeysOfType<boolean>;
export type StringKey = KeysOfType<string>;

export interface SliderSpec {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const pct = (v: number) => `${v}%`;

export const ADJUST_SLIDERS: SliderSpec[] = [
  { key: 'pixelSize', label: 'Pixel size', min: 1, max: 16, step: 1, format: (v) => `${v}px` },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, format: signed },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, format: signed },
  { key: 'gamma', label: 'Gamma', min: 0.2, max: 3, step: 0.01, format: (v) => v.toFixed(2) },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, format: pct },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, step: 1 },
];

export const DITHER_SLIDERS: Record<string, SliderSpec> = {
  strength: { key: 'strength', label: 'Strength', min: 0, max: 200, step: 1, format: pct },
  threshold: { key: 'threshold', label: 'Threshold', min: 0, max: 100, step: 1, format: pct },
  cellSize: { key: 'cellSize', label: 'Cell size', min: 2, max: 32, step: 1, format: (v) => `${v}px` },
  angle: { key: 'angle', label: 'Angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  diffusion: { key: 'diffusion', label: 'Diffusion', min: 0, max: 100, step: 1, format: pct },
  levels: { key: 'levels', label: 'Levels', min: 2, max: 16, step: 1 },
};

export const ASCII_SLIDERS: Record<string, SliderSpec> = {
  columns: { key: 'asciiColumns', label: 'Columns', min: 20, max: 300, step: 1 },
  fontSize: { key: 'asciiFontSize', label: 'Font size', min: 6, max: 24, step: 1, format: (v) => `${v}px` },
  lineHeight: {
    key: 'asciiLineHeight',
    label: 'Line height',
    min: 0.8,
    max: 1.6,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}×`,
  },
  edgeThreshold: { key: 'asciiEdgeThreshold', label: 'Edge threshold', min: 0, max: 100, step: 1, format: pct },
};

export const ADJUST_KEYS: (keyof Params)[] = [...ADJUST_SLIDERS.map((s) => s.key), 'invert'];
export const DITHER_KEYS: (keyof Params)[] = [
  'algorithm',
  'strength',
  'threshold',
  'cellSize',
  'angle',
  'diffusion',
  'serpentine',
  'palette',
  'levels',
  'ink',
  'paper',
];

export const ASCII_KEYS: (keyof Params)[] = [
  'asciiCharset',
  'asciiCustom',
  'asciiColumns',
  'asciiFont',
  'asciiFontSize',
  'asciiLineHeight',
  'asciiColor',
  'asciiFg',
  'asciiBg',
  'asciiEdges',
  'asciiEdgeThreshold',
  'asciiDither',
];

/** Allowed values for string params that come from a fixed list. */
const ENUMS: Partial<Record<keyof Params, string[]>> = {
  mode: ['dither', 'ascii'],
  algorithm: ALGORITHMS.map((a) => a.id),
  palette: PALETTES.map((p) => p.id),
  asciiCharset: CHARSETS.map((c) => c.id),
  asciiFont: FONTS.map((f) => f.id),
  asciiColor: COLOR_MODES.map((c) => c.id),
};
const COLOR_KEYS: (keyof Params)[] = ['ink', 'paper', 'asciiFg', 'asciiBg'];
const HEX = /^#[0-9a-f]{6}$/i;

const STORAGE_KEY = 'dag.params.v1';

function load(): Partial<Params> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    // Only accept keys we know, with the same type as the default.
    for (const key of Object.keys(DEFAULTS) as (keyof Params)[]) {
      const v = data[key];
      if (typeof v !== typeof DEFAULTS[key]) continue;
      if (ENUMS[key] && !ENUMS[key]!.includes(v as string)) continue;
      if (COLOR_KEYS.includes(key) && !HEX.test(v as string)) continue;
      out[key] = v;
    }
    return out as Partial<Params>;
  } catch {
    return {};
  }
}

type Listener = (params: Params, changed: keyof Params) => void;

export class Store {
  params: Params = { ...DEFAULTS, ...load() };
  private listeners = new Set<Listener>();
  private saveTimer = 0;

  set<K extends keyof Params>(key: K, value: Params[K]): void {
    if (this.params[key] === value) return;
    this.params = { ...this.params, [key]: value };
    for (const fn of this.listeners) fn(this.params, key);
    this.scheduleSave();
  }

  reset(keys: (keyof Params)[]): void {
    for (const key of keys) this.set(key, DEFAULTS[key]);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.params));
      } catch {
        // Storage can be unavailable (private mode, blocked site data); settings just won't persist.
      }
    }, 200);
  }
}
