import { ASCII_PALETTES, CHARSETS, COLOR_MODES, FONTS, MAX_INJECT } from './ascii/charsets';
import { LFO_SHAPES } from './ascii/lfo';
import { ALGORITHMS } from './pipeline/algorithms';
import { DEFAULT_ORDER, normalizeOrder } from './pipeline/effects';
import { parseLanes, serializeLanes } from './anim';
import { PALETTES, parseColorList, serializeColorList } from './pipeline/palettes';

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
  mirror: boolean;
  // animation
  animate: boolean;
  boilFps: number;
  /** JSON list of animation lanes (see anim.ts). */
  animLanes: string;
  /** Timeline length in seconds for keyframe lanes. */
  animDuration: number;
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
  /** Custom palette: space-separated #rrggbb, 2–32 colours. */
  customPalette: string;
  /** Pick custom palette colours by brightness (dark → light) instead of nearest colour. */
  customRamp: boolean;
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
  asciiInject: string;
  asciiSpace: boolean;
  asciiDepth: number;
  asciiOffset: number;
  asciiOffsetLfo: string;
  asciiOffsetSpeed: number;
  asciiOffsetAmount: number;
  asciiDepthLfo: string;
  asciiDepthSpeed: number;
  asciiDepthAmount: number;
  asciiPalette: string;
  asciiTransparent: boolean;
  // post-effects
  fxOrder: string;
  fxGlow: boolean;
  fxGlowRadius: number;
  fxGlowIntensity: number;
  fxGlowThreshold: number;
  fxGlitch: boolean;
  fxGlitchAmount: number;
  fxGlitchBlock: number;
  fxChroma: boolean;
  fxChromaAmount: number;
  fxScan: boolean;
  fxScanPeriod: number;
  fxScanIntensity: number;
  fxScanCurve: number;
  fxVignette: boolean;
  fxVignetteAmount: number;
  fxGrain: boolean;
  fxGrainAmount: number;
  fxGrainSize: number;
  // export
  exportFormat: string;
  exportScale: number;
  exportDuration: number;
  exportFps: number;
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
  mirror: false,
  animate: false,
  boilFps: 8,
  animLanes: '[]',
  animDuration: 4,
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
  customPalette: '#0d0b14 #3b2a5c #b0305c #f0a04b #f4ecd8',
  customRamp: false,
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
  asciiInject: '',
  asciiSpace: true,
  asciiDepth: 64,
  asciiOffset: 0,
  asciiOffsetLfo: 'off',
  asciiOffsetSpeed: 0.5,
  asciiOffsetAmount: 50,
  asciiDepthLfo: 'off',
  asciiDepthSpeed: 0.5,
  asciiDepthAmount: 50,
  asciiPalette: 'pico8',
  asciiTransparent: false,
  fxOrder: DEFAULT_ORDER,
  fxGlow: false,
  fxGlowRadius: 6,
  fxGlowIntensity: 80,
  fxGlowThreshold: 55,
  fxGlitch: false,
  fxGlitchAmount: 30,
  fxGlitchBlock: 16,
  fxChroma: false,
  fxChromaAmount: 3,
  fxScan: false,
  fxScanPeriod: 3,
  fxScanIntensity: 40,
  fxScanCurve: 0,
  fxVignette: false,
  fxVignetteAmount: 50,
  fxGrain: false,
  fxGrainAmount: 25,
  fxGrainSize: 1,
  exportFormat: 'png',
  exportScale: 2,
  exportDuration: 4,
  exportFps: 15,
};

export const EXPORT_FORMATS = [
  { id: 'png', label: 'PNG image', animated: false },
  { id: 'svg', label: 'SVG vector (dither)', animated: false },
  { id: 'gif', label: 'GIF animation', animated: true },
  { id: 'webm', label: 'WebM video', animated: true },
  { id: 'mp4', label: 'MP4 video', animated: true },
];

export const isAnimatedFormat = (id: string) => EXPORT_FORMATS.some((f) => f.id === id && f.animated);

export const EXPORT_SLIDERS: Record<string, SliderSpec> = {
  scale: { key: 'exportScale', label: 'Scale', min: 1, max: 8, step: 1, format: (v) => `${v}×` },
  duration: { key: 'exportDuration', label: 'Duration', min: 1, max: 30, step: 1, format: (v) => `${v} s` },
  fps: { key: 'exportFps', label: 'Frame rate', min: 5, max: 30, step: 1, format: (v) => `${v} fps` },
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
  depth: { key: 'asciiDepth', label: 'Depth', min: 2, max: 64, step: 1, format: (v) => (v >= 64 ? 'All' : `${v}`) },
  offset: { key: 'asciiOffset', label: 'Offset', min: -100, max: 100, step: 1, format: (v) => `${signed(v)}%` },
  offsetSpeed: { key: 'asciiOffsetSpeed', label: 'Speed', min: 0.05, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)} Hz` },
  offsetAmount: { key: 'asciiOffsetAmount', label: 'Amount', min: 0, max: 100, step: 1, format: pct },
  depthSpeed: { key: 'asciiDepthSpeed', label: 'Speed', min: 0.05, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)} Hz` },
  depthAmount: { key: 'asciiDepthAmount', label: 'Amount', min: 0, max: 100, step: 1, format: pct },
};

/** Sliders per post-effect id (see pipeline/effects.ts). */
export const FX_SLIDERS: Record<string, SliderSpec[]> = {
  glow: [
    { key: 'fxGlowRadius', label: 'Radius', min: 1, max: 32, step: 1, format: (v) => `${v}px` },
    { key: 'fxGlowIntensity', label: 'Intensity', min: 0, max: 200, step: 1, format: pct },
    { key: 'fxGlowThreshold', label: 'Threshold', min: 0, max: 100, step: 1, format: pct },
  ],
  glitch: [
    { key: 'fxGlitchAmount', label: 'Amount', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlitchBlock', label: 'Block size', min: 4, max: 64, step: 1, format: (v) => `${v}px` },
  ],
  chroma: [{ key: 'fxChromaAmount', label: 'Shift', min: 0, max: 20, step: 0.5, format: (v) => `${v}px` }],
  scanlines: [
    { key: 'fxScanPeriod', label: 'Line spacing', min: 2, max: 8, step: 1, format: (v) => `${v}px` },
    { key: 'fxScanIntensity', label: 'Darkness', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxScanCurve', label: 'Curvature', min: 0, max: 100, step: 1, format: pct },
  ],
  vignette: [{ key: 'fxVignetteAmount', label: 'Amount', min: 0, max: 100, step: 1, format: pct }],
  grain: [
    { key: 'fxGrainAmount', label: 'Amount', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGrainSize', label: 'Size', min: 1, max: 4, step: 1, format: (v) => `${v}px` },
  ],
};

export const BOIL_SLIDER: SliderSpec = {
  key: 'boilFps',
  label: 'Speed',
  min: 1,
  max: 30,
  step: 1,
  format: (v) => `${v} fps`,
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
  'customPalette',
  'customRamp',
];

export const ANIM_DURATION_SLIDER: SliderSpec = {
  key: 'animDuration',
  label: 'Timeline length',
  min: 1,
  max: 30,
  step: 0.5,
  format: (v) => `${v} s`,
};

export const ANIM_KEYS: (keyof Params)[] = ['animate', 'boilFps', 'animLanes', 'animDuration'];

export const FX_KEYS: (keyof Params)[] = [
  'fxOrder',
  'fxGlow',
  'fxGlitch',
  'fxChroma',
  'fxScan',
  'fxVignette',
  'fxGrain',
  ...Object.values(FX_SLIDERS).flatMap((list) => list.map((s) => s.key)),
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
  'asciiInject',
  'asciiSpace',
  'asciiDepth',
  'asciiOffset',
  'asciiOffsetLfo',
  'asciiOffsetSpeed',
  'asciiOffsetAmount',
  'asciiDepthLfo',
  'asciiDepthSpeed',
  'asciiDepthAmount',
  'asciiPalette',
  'asciiTransparent',
];

/** Allowed values for string params that come from a fixed list. */
const ENUMS: Partial<Record<keyof Params, string[]>> = {
  mode: ['dither', 'ascii'],
  algorithm: ALGORITHMS.map((a) => a.id),
  palette: PALETTES.map((p) => p.id),
  asciiCharset: CHARSETS.map((c) => c.id),
  asciiFont: FONTS.map((f) => f.id),
  asciiColor: COLOR_MODES.map((c) => c.id),
  asciiOffsetLfo: LFO_SHAPES.map((s) => s.id),
  asciiDepthLfo: LFO_SHAPES.map((s) => s.id),
  asciiPalette: ASCII_PALETTES,
  exportFormat: EXPORT_FORMATS.map((f) => f.id),
};
const COLOR_KEYS: (keyof Params)[] = ['ink', 'paper', 'asciiFg', 'asciiBg'];
const HEX = /^#[0-9a-f]{6}$/i;

const STORAGE_KEY = 'dag.params.v1';

const RANGES = new Map(
  [
    ...ADJUST_SLIDERS,
    ...Object.values(DITHER_SLIDERS),
    ...Object.values(ASCII_SLIDERS),
    ...Object.values(EXPORT_SLIDERS),
    ...Object.values(FX_SLIDERS).flat(),
    BOIL_SLIDER,
    ANIM_DURATION_SLIDER,
  ].map((s) => [s.key, s] as const),
);

/**
 * Keep only known keys with valid values. Used for localStorage, saved presets and share links,
 * which may all be stale or hand-edited.
 */
/**
 * Settings that animation lanes may drive. Font size and line height are left out because
 * every change rebuilds the glyph atlas.
 */
export const ANIMATABLE: SliderSpec[] = [
  ...ADJUST_SLIDERS,
  ...Object.values(DITHER_SLIDERS),
  ...Object.values(ASCII_SLIDERS).filter((s) => s.key !== 'asciiFontSize' && s.key !== 'asciiLineHeight'),
  ...Object.values(FX_SLIDERS).flat(),
];
const ANIMATABLE_BY_KEY = new Map(ANIMATABLE.map((s) => [s.key as string, s]));
export const animatableSpec = (key: string) => ANIMATABLE_BY_KEY.get(key);

export function sanitize(data: unknown): Partial<Params> {
  if (!data || typeof data !== 'object') return {};
  const src = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULTS) as (keyof Params)[]) {
    const v = src[key];
    if (typeof v !== typeof DEFAULTS[key]) continue;
    if (ENUMS[key] && !ENUMS[key]!.includes(v as string)) continue;
    if (COLOR_KEYS.includes(key) && !HEX.test(v as string)) continue;
    if (key === 'asciiCustom' && (v as string).length > 64) continue;
    if (key === 'asciiInject' && [...(v as string)].length > MAX_INJECT) continue;
    if (key === 'animLanes') {
      out[key] = serializeLanes(parseLanes(v as string, animatableSpec));
      continue;
    }
    if (key === 'customPalette') {
      const colors = parseColorList(v as string);
      if (colors.length >= 2) out[key] = serializeColorList(colors);
      continue;
    }
    if (key === 'fxOrder') {
      out[key] = normalizeOrder(v as string);
      continue;
    }
    const range = RANGES.get(key as NumericKey);
    if (range) {
      if (!Number.isFinite(v)) continue;
      out[key] = Math.min(range.max, Math.max(range.min, v as number));
      continue;
    }
    out[key] = v;
  }
  return out as Partial<Params>;
}

function load(): Partial<Params> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : {};
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

  /** Set several params at once (already sanitized). */
  apply(values: Partial<Params>): void {
    for (const key of Object.keys(values) as (keyof Params)[]) this.set(key, values[key] as Params[typeof key]);
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
