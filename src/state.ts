import { ASCII_PALETTES, CHARSETS, COLOR_MODES, FONTS, MAX_INJECT } from './ascii/charsets';
import { LFO_SHAPES } from './ascii/lfo';
import { ALGORITHMS } from './pipeline/algorithms';
import { DEFAULT_ORDER, normalizeOrder, TINT_MODES } from './pipeline/effects';
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
  /** Tone curve bands, -100..100 (0 = unchanged). */
  shadows: number;
  midtones: number;
  highlights: number;
  saturation: number;
  /** Hue rotation in degrees. */
  hue: number;
  sharpen: number;
  /** Blur radius as 0..100 (100 = 3% of the longer side), applied before dithering. */
  blur: number;
  /** Edge-preserving smoothing strength, 0..100. */
  denoise: number;
  invert: boolean;
  mirror: boolean;
  // animation
  animate: boolean;
  boilFps: number;
  /** Boil jitter for error diffusion and ASCII: 'random' (white noise) or 'blue' (blue noise). */
  boilPattern: string;
  /** Boil jitter strength, 0..100 (50 = the original amount). */
  boilAmount: number;
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
  /** Wave diffusion: threshold sine strength 0..100, wavelength in px, tilt −100..100. */
  waveStrength: number;
  waveLength: number;
  waveBias: number;
  /** Honeycomb: concentric rings inside each cell, 0..100. */
  hexRings: number;
  /** Orbs: radius px, how many, how strongly they shift the threshold, size variation, smear axis. */
  orbSize: number;
  orbCount: number;
  orbIntensity: number;
  orbRandom: number;
  orbVertical: boolean;
  /** Halftone CMYK: screen angle per ink, dot gain, grey component replacement, samples per side. */
  cmykAngleC: number;
  cmykAngleM: number;
  cmykAngleY: number;
  cmykAngleK: number;
  cmykDotGain: number;
  cmykGcr: number;
  cmykSupersample: number;
  palette: string;
  levels: number;
  ink: string;
  paper: string;
  /** Custom palette: space-separated #rrggbb, 2–32 colours. */
  customPalette: string;
  /** Pick custom palette colours by brightness (dark → light) instead of nearest colour. */
  customRamp: boolean;
  /** Match nearest palette colours in OKLab instead of weighted RGB. */
  perceptual: boolean;
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
  fxGlowSoftness: number;
  fxGlowAspect: number;
  fxGlowAngle: number;
  fxGlowFalloff: number;
  fxGlitch: boolean;
  fxGlitchAmount: number;
  fxGlitchBlock: number;
  fxGlitchShift: number;
  fxGlitchCrush: number;
  fxGlitchSwap: number;
  fxGlitchScan: number;
  fxGlitchScramble: number;
  fxGlitchInterlace: number;
  fxChroma: boolean;
  fxChromaAmount: number;
  fxChromaR: number;
  fxChromaG: number;
  fxChromaB: number;
  fxScan: boolean;
  fxScanPeriod: number;
  fxScanIntensity: number;
  fxScanCurve: number;
  fxVignette: boolean;
  fxVignetteAmount: number;
  fxGrain: boolean;
  fxGrainAmount: number;
  fxGrainSize: number;
  fxTint: boolean;
  fxTintColor: string;
  fxTintMode: string;
  fxTintOpacity: number;
  fxFinish: boolean;
  fxFinishBlur: number;
  fxFinishSharpen: number;
  fxFinishHue: number;
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
  shadows: 0,
  midtones: 0,
  highlights: 0,
  saturation: 100,
  hue: 0,
  sharpen: 0,
  blur: 0,
  denoise: 0,
  invert: false,
  mirror: false,
  animate: false,
  boilFps: 8,
  boilPattern: 'random',
  boilAmount: 50,
  animLanes: '[]',
  animDuration: 4,
  algorithm: 'atkinson',
  strength: 100,
  threshold: 50,
  cellSize: 6,
  angle: 45,
  diffusion: 100,
  serpentine: true,
  waveStrength: 0,
  waveLength: 12,
  waveBias: 0,
  hexRings: 0,
  orbSize: 40,
  orbCount: 16,
  orbIntensity: 60,
  orbRandom: 50,
  orbVertical: false,
  cmykAngleC: 15,
  cmykAngleM: 75,
  cmykAngleY: 0,
  cmykAngleK: 45,
  cmykDotGain: 20,
  cmykGcr: 100,
  cmykSupersample: 2,
  palette: 'mono',
  levels: 2,
  ink: '#000000',
  paper: '#ffffff',
  customPalette: '#0d0b14 #3b2a5c #b0305c #f0a04b #f4ecd8',
  customRamp: false,
  perceptual: false,
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
  fxGlowSoftness: 0,
  fxGlowAspect: 1,
  fxGlowAngle: 0,
  fxGlowFalloff: 1,
  fxGlitch: false,
  fxGlitchAmount: 30,
  fxGlitchBlock: 16,
  fxGlitchShift: 100,
  fxGlitchCrush: 100,
  fxGlitchSwap: 100,
  fxGlitchScan: 0,
  fxGlitchScramble: 0,
  fxGlitchInterlace: 0,
  fxChroma: false,
  fxChromaAmount: 3,
  fxChromaR: 100,
  fxChromaG: 0,
  fxChromaB: -100,
  fxScan: false,
  fxScanPeriod: 3,
  fxScanIntensity: 40,
  fxScanCurve: 0,
  fxVignette: false,
  fxVignetteAmount: 50,
  fxGrain: false,
  fxGrainAmount: 25,
  fxGrainSize: 1,
  fxTint: false,
  fxTintColor: '#ff7a3d',
  fxTintMode: 'overlay',
  fxTintOpacity: 60,
  fxFinish: false,
  fxFinishBlur: 0,
  fxFinishSharpen: 0,
  fxFinishHue: 0,
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
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, format: signed },
  { key: 'midtones', label: 'Midtones', min: -100, max: 100, step: 1, format: signed },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, format: signed },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, format: pct },
  { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, format: (v) => `${signed(v)}°` },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, step: 1 },
  { key: 'blur', label: 'Blur', min: 0, max: 100, step: 1 },
  { key: 'denoise', label: 'Denoise', min: 0, max: 100, step: 1 },
];

export const DITHER_SLIDERS: Record<string, SliderSpec> = {
  strength: { key: 'strength', label: 'Strength', min: 0, max: 200, step: 1, format: pct },
  threshold: { key: 'threshold', label: 'Threshold', min: 0, max: 100, step: 1, format: pct },
  cellSize: { key: 'cellSize', label: 'Cell size', min: 2, max: 32, step: 1, format: (v) => `${v}px` },
  angle: { key: 'angle', label: 'Angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  diffusion: { key: 'diffusion', label: 'Diffusion', min: 0, max: 100, step: 1, format: pct },
  levels: { key: 'levels', label: 'Levels', min: 2, max: 16, step: 1 },
  waveStrength: { key: 'waveStrength', label: 'Wave', min: 0, max: 100, step: 1, format: pct },
  waveLength: { key: 'waveLength', label: 'Wavelength', min: 2, max: 64, step: 1, format: (v) => `${v}px` },
  waveBias: { key: 'waveBias', label: 'Tilt', min: -100, max: 100, step: 1, format: (v) => `${signed(v)}%` },
  hexRings: { key: 'hexRings', label: 'Rings', min: 0, max: 100, step: 1, format: pct },
  orbSize: { key: 'orbSize', label: 'Orb size', min: 2, max: 200, step: 1, format: (v) => `${v}px` },
  orbCount: { key: 'orbCount', label: 'Count', min: 1, max: 64, step: 1 },
  orbIntensity: { key: 'orbIntensity', label: 'Intensity', min: 0, max: 100, step: 1, format: pct },
  orbRandom: { key: 'orbRandom', label: 'Size variation', min: 0, max: 100, step: 1, format: pct },
  cmykAngleC: { key: 'cmykAngleC', label: 'Cyan angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  cmykAngleM: { key: 'cmykAngleM', label: 'Magenta angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  cmykAngleY: { key: 'cmykAngleY', label: 'Yellow angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  cmykAngleK: { key: 'cmykAngleK', label: 'Black angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  cmykDotGain: { key: 'cmykDotGain', label: 'Dot gain', min: 0, max: 100, step: 1, format: pct },
  cmykGcr: { key: 'cmykGcr', label: 'Black replacement', min: 0, max: 100, step: 1, format: pct },
  cmykSupersample: { key: 'cmykSupersample', label: 'Smoothing', min: 1, max: 4, step: 1, format: (v) => `${v}×${v}` },
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
    { key: 'fxGlowRadius', label: 'Radius', min: 1, max: 200, step: 1, format: (v) => `${v}px` },
    { key: 'fxGlowIntensity', label: 'Intensity', min: 0, max: 200, step: 1, format: pct },
    { key: 'fxGlowThreshold', label: 'Threshold', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlowSoftness', label: 'Softness', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlowAspect', label: 'Stretch', min: 0.25, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
    { key: 'fxGlowAngle', label: 'Angle', min: 0, max: 180, step: 1, format: (v) => `${v}°` },
    { key: 'fxGlowFalloff', label: 'Falloff', min: 0, max: 3, step: 0.1, format: (v) => v.toFixed(1) },
  ],
  glitch: [
    { key: 'fxGlitchAmount', label: 'Amount', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlitchBlock', label: 'Block size', min: 4, max: 64, step: 1, format: (v) => `${v}px` },
    { key: 'fxGlitchShift', label: 'Block shift', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlitchCrush', label: 'Colour crush', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlitchSwap', label: 'Channel swap', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlitchScan', label: 'Scanline offset', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlitchScramble', label: 'Block scramble', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlitchInterlace', label: 'Interlace', min: 0, max: 100, step: 1, format: pct },
  ],
  chroma: [
    { key: 'fxChromaAmount', label: 'Max shift', min: 0, max: 40, step: 0.5, format: (v) => `${v}px` },
    { key: 'fxChromaR', label: 'Red', min: -100, max: 100, step: 1, format: (v) => `${signed(v)}%` },
    { key: 'fxChromaG', label: 'Green', min: -100, max: 100, step: 1, format: (v) => `${signed(v)}%` },
    { key: 'fxChromaB', label: 'Blue', min: -100, max: 100, step: 1, format: (v) => `${signed(v)}%` },
  ],
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
  tint: [{ key: 'fxTintOpacity', label: 'Opacity', min: 0, max: 100, step: 1, format: pct }],
  finish: [
    { key: 'fxFinishBlur', label: 'Soften', min: 0, max: 10, step: 0.5, format: (v) => `${v}px` },
    { key: 'fxFinishSharpen', label: 'Sharpen', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxFinishHue', label: 'Hue', min: -180, max: 180, step: 1, format: (v) => `${signed(v)}°` },
  ],
};

export const BOIL_PATTERNS = [
  { id: 'random', label: 'Random' },
  { id: 'blue', label: 'Blue noise' },
];

export const BOIL_AMOUNT_SLIDER: SliderSpec = {
  key: 'boilAmount',
  label: 'Amount',
  min: 0,
  max: 100,
  step: 1,
  format: pct,
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
  'waveStrength',
  'waveLength',
  'waveBias',
  'hexRings',
  'orbSize',
  'orbCount',
  'orbIntensity',
  'orbRandom',
  'orbVertical',
  'cmykAngleC',
  'cmykAngleM',
  'cmykAngleY',
  'cmykAngleK',
  'cmykDotGain',
  'cmykGcr',
  'cmykSupersample',
  'palette',
  'levels',
  'ink',
  'paper',
  'customPalette',
  'customRamp',
  'perceptual',
];

export const ANIM_DURATION_SLIDER: SliderSpec = {
  key: 'animDuration',
  label: 'Timeline length',
  min: 1,
  max: 30,
  step: 0.5,
  format: (v) => `${v} s`,
};

export const ANIM_KEYS: (keyof Params)[] = ['animate', 'boilFps', 'boilPattern', 'boilAmount', 'animLanes', 'animDuration'];

export const FX_KEYS: (keyof Params)[] = [
  'fxOrder',
  'fxGlow',
  'fxGlitch',
  'fxChroma',
  'fxScan',
  'fxVignette',
  'fxGrain',
  'fxTint',
  'fxTintColor',
  'fxTintMode',
  'fxFinish',
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
  fxTintMode: TINT_MODES.map((m) => m.id),
  boilPattern: BOIL_PATTERNS.map((b) => b.id),
};
const COLOR_KEYS: (keyof Params)[] = ['ink', 'paper', 'asciiFg', 'asciiBg', 'fxTintColor'];
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
    BOIL_AMOUNT_SLIDER,
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
