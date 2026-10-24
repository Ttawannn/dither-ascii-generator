import { ASCII_PALETTES, CHARSETS, COLOR_MODES, isFontId, MAX_INJECT } from './ascii/charsets';
import { LFO_SHAPES } from './ascii/lfo';
import { ALGORITHMS } from './pipeline/algorithms';
import { DEFAULT_ORDER, normalizeOrder, parseStack, serializeStack, TINT_MODES } from './pipeline/effects';
import { parseLanes, serializeLanes } from './anim';
import { parseLayer, serializeLayer, type Layer } from './layers';
import { PALETTES, parseColorList, serializeColorList } from './pipeline/palettes';
import { PALETTE_SETS } from './pipeline/palette-sets';

const SET_IDS = PALETTE_SETS.map((p) => `set:${p.id}`);
import { DEFAULT_SHAPE_BANDS, parseShapeBands } from './pipeline/shape-bands';
import { TEMPORAL_PATTERNS, TEMPORAL_SLIDERS } from './temporal';

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
  /** Warp before dithering: rows shifted along a curve (-100..100), and a swirl around the centre. */
  warpCurve: number;
  warpSwirl: number;
  /** Swirl reach, % of the half-diagonal. */
  warpSwirlRadius: number;
  invert: boolean;
  mirror: boolean;
  // animation
  animate: boolean;
  boilFps: number;
  /** Boil jitter for error diffusion and ASCII: 'random' (white noise) or 'blue' (blue noise). */
  boilPattern: string;
  /** Boil jitter strength, 0..100 (50 = the original amount). */
  boilAmount: number;
  temporalPattern: string;
  temporalAmount: number;
  temporalSpeed: number;
  temporalScale: number;
  temporalAngle: number;
  temporalSeed: number;
  temporalLoop: boolean;
  /** JSON list of animation lanes (see anim.ts). */
  animLanes: string;
  /** Timeline length in seconds for keyframe lanes. */
  animDuration: number;
  // dither
  paletteMixing: string;
  linearLight: boolean;
  halftoneShape: string;
  shapeBands: string;
  shapeFeather: number;
  shapeFeatherPattern: string;
  shapeBackground: string;
  shapeLayout: string;
  shapeJitter: number;
  shapeSizeJitter: number;
  shapeAngleJitter: number;
  shapeSeed: number;
  shapeTransparent: boolean;
  modulationAmount: number;
  modulationWidth: number;
  modulationPhase: number;
  /** Contour: lines per full brightness range, and how much the brightness is smoothed first (0..100). */
  contourLevels: number;
  contourSmooth: number;
  /** Sine moiré: second screen's wavelength (% of the cell) and angle (degrees from the first). */
  moireRatio: number;
  moireAngle: number;
  /** Radial: centre as % of width / height, and spiral arms (0 = rings). */
  radialX: number;
  radialY: number;
  radialArms: number;
  /** Polygon looks: border width as % of the cell's inner radius, its colour, and Voronoi jitter 0..100. */
  polyBorder: number;
  polyBorderColor: string;
  polyJitter: number;
  /** Gaussian diffusion: spread 0..100 (σ 0.5–3 px) and threshold noise 0..100. */
  gaussSpread: number;
  gaussNoise: number;
  /** Edge-directed diffusion: 0 splits the error evenly, 100 sends it all along the edge. */
  edgeCrack: number;
  /** Single-axis diffusion: columns instead of rows, leak to the next line and spread along it (0..100). */
  axisVertical: boolean;
  axisBleed: number;
  axisSmooth: number;
  stippleCount: number;
  stippleIterations: number;
  stippleSize: number;
  stippleSeed: number;
  algorithm: string;
  strength: number;
  threshold: number;
  cellSize: number;
  angle: number;
  diffusion: number;
  serpentine: boolean;
  /** Wave diffusion: threshold sine strength 0..100, wavelength in px, tilt −100..100, follow image 0..100. */
  waveStrength: number;
  waveLength: number;
  waveBias: number;
  waveFollow: number;
  /** Honeycomb: concentric rings inside each cell, 0..100. */
  hexRings: number;
  /** Halftone / line / crosshatch / honeycomb: how far smoothed brightness bends the pattern, 0..100. */
  patternFollow: number;
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
  asciiBold: boolean;
  asciiFontSize: number;
  asciiLineHeight: number;
  asciiColor: string;
  asciiFg: string;
  asciiBg: string;
  asciiShape: number;
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
  /**
   * Effect layers as JSON (see FxLayer in effects.ts). Empty for looks made before layers: the
   * stack then comes from the flat fx* settings and `fxOrder`.
   */
  fxStack: string;
  fxReveal: boolean;
  fxRevealProgress: number;
  fxRevealSoftness: number;
  fxRevealThreshold: number;
  fxRevealAngle: number;
  fxRevealTarget: string;
  fxGlow: boolean;
  fxGlowRadius: number;
  fxGlowIntensity: number;
  fxGlowThreshold: number;
  fxGlowSoftness: number;
  fxGlowAspect: number;
  fxGlowAngle: number;
  fxGlowFalloff: number;
  /** Glow falloff curve: ε flattens the core (0..100), distance scale stretches distances in it (25..400 %). */
  fxGlowEpsilon: number;
  fxGlowDistance: number;
  /** Keep wide glows as bright as narrow ones. */
  fxGlowCompensate: boolean;
  /** Glow colour, mixed in by Tint (0 = the picture's own colours). */
  fxGlowColor: string;
  fxGlowTint: number;
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
  fxSort: boolean;
  fxSortLow: number;
  fxSortHigh: number;
  fxSortLength: number;
  fxSortVertical: boolean;
  fxSortReverse: boolean;
  fxFinish: boolean;
  fxFinishBlur: number;
  fxFinishSharpen: number;
  fxFinishHue: number;
  // mask
  /** 'off', 'luma' (brightness range) or 'hue' (colour range), measured on the source. */
  maskMode: string;
  maskLow: number;
  maskHigh: number;
  maskHue: number;
  maskHueWidth: number;
  maskFeather: number;
  maskInvert: boolean;
  /** What shows outside the mask: 'original', 'color' or 'transparent'. */
  maskOutside: string;
  maskColor: string;
  /** Layer 2 as JSON (see layers.ts); empty when never set up. */
  layer2: string;
  // export
  exportFormat: string;
  exportScale: number;
  exportDuration: number;
  exportFps: number;
  /** Print size: PNG carries `exportDpi`, SVG gets physical width / height. */
  exportPrint: boolean;
  exportDpi: number;
  /** 'cm' or 'in', for the size shown and the SVG's width / height. */
  exportUnit: string;
  /** SVG of Halftone dot / CMYK as one vector circle per cell instead of pixel runs. */
  exportVectorDots: boolean;
  /** ANSI text export colours: 'truecolor' or '256'. */
  exportAnsi: string;
  /** Halftone CMYK SVG as four plates (one file per ink) in a .zip. */
  exportSeparations: boolean;
  /** Registration marks and plate names on separations. */
  exportMarks: boolean;
  /** JPEG / WebP quality, 10–100. */
  exportQuality: number;
  /** File name template: {name} {mode} {algo} {date} {time}. */
  exportName: string;
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
  warpCurve: 0,
  warpSwirl: 0,
  warpSwirlRadius: 100,
  invert: false,
  mirror: false,
  animate: false,
  boilFps: 8,
  boilPattern: 'random',
  boilAmount: 50,
  temporalPattern: 'off', temporalAmount: 20, temporalSpeed: 1, temporalScale: 12,
  temporalAngle: 0, temporalSeed: 1, temporalLoop: true,
  animLanes: '[]',
  animDuration: 4,
  paletteMixing: 'nearest',
  linearLight: false,
  halftoneShape: 'round',
  shapeBands: DEFAULT_SHAPE_BANDS,
  shapeFeather: 0,
  shapeFeatherPattern: 'ordered',
  shapeBackground: '#101218',
  shapeLayout: 'grid', shapeJitter: 0, shapeSizeJitter: 0, shapeAngleJitter: 0, shapeSeed: 1,
  shapeTransparent: false,
  modulationAmount: 50, modulationWidth: 50, modulationPhase: 0,
  contourLevels: 12, contourSmooth: 30,
  moireRatio: 110, moireAngle: 8,
  radialX: 50, radialY: 50, radialArms: 0,
  polyBorder: 0, polyBorderColor: '#000000', polyJitter: 80,
  gaussSpread: 40, gaussNoise: 0, edgeCrack: 50,
  axisVertical: false, axisBleed: 0, axisSmooth: 0,
  stippleCount: 10000,
  stippleIterations: 8,
  stippleSize: 100,
  stippleSeed: 1,
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
  waveFollow: 0,
  hexRings: 0,
  patternFollow: 0,
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
  asciiBold: false,
  asciiFontSize: 12,
  asciiLineHeight: 1,
  asciiColor: 'mono',
  asciiFg: '#f2f2f2',
  asciiBg: '#0a0a0a',
  asciiShape: 0,
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
  fxStack: '',
  fxReveal: false, fxRevealProgress: 0, fxRevealSoftness: 10, fxRevealThreshold: 50, fxRevealAngle: 0, fxRevealTarget: 'original',
  fxGlow: false,
  fxGlowRadius: 6,
  fxGlowIntensity: 80,
  fxGlowThreshold: 55,
  fxGlowSoftness: 0,
  fxGlowAspect: 1,
  fxGlowAngle: 0,
  fxGlowFalloff: 1,
  fxGlowEpsilon: 0,
  fxGlowDistance: 100,
  fxGlowCompensate: false,
  fxGlowColor: '#ffffff',
  fxGlowTint: 0,
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
  fxSort: false,
  fxSortLow: 10,
  fxSortHigh: 90,
  fxSortLength: 64,
  fxSortVertical: false,
  fxSortReverse: false,
  fxFinish: false,
  fxFinishBlur: 0,
  fxFinishSharpen: 0,
  fxFinishHue: 0,
  maskMode: 'off',
  maskLow: 0,
  maskHigh: 50,
  maskHue: 30,
  maskHueWidth: 30,
  maskFeather: 20,
  maskInvert: false,
  maskOutside: 'original',
  maskColor: '#000000',
  layer2: '',
  exportFormat: 'png',
  exportScale: 2,
  exportDuration: 4,
  exportFps: 15,
  exportPrint: false,
  exportDpi: 300,
  exportUnit: 'cm',
  exportVectorDots: true,
  exportAnsi: 'truecolor',
  exportSeparations: false,
  exportMarks: true,
  exportQuality: 92,
  exportName: '{name}-{mode}',
};

export const EXPORT_FORMATS = [
  { id: 'png', label: 'PNG image', animated: false },
  { id: 'svg', label: 'SVG vector (dither)', animated: false },
  { id: 'jpg', label: 'JPEG image', animated: false },
  { id: 'webp', label: 'WebP image', animated: false },
  { id: 'gif', label: 'GIF animation', animated: true },
  { id: 'webm', label: 'WebM video', animated: true },
  { id: 'mp4', label: 'MP4 video', animated: true },
];

export const MAX_EXPORT_NAME = 80;

/** Ready-made export settings. `long`: wanted long side in pixels (Scale is chosen to get near it). */
export interface ReadyExport {
  id: string;
  label: string;
  format: string;
  long?: number;
  print?: boolean;
  quality?: number;
  duration?: number;
  fps?: number;
}

export const READY_EXPORTS: ReadyExport[] = [
  { id: 'social', label: 'Social post · 1080 px', format: 'png', long: 1080 },
  { id: 'story', label: 'Tall story · 1920 px', format: 'png', long: 1920 },
  { id: 'web', label: 'Web image · WebP 1600 px', format: 'webp', long: 1600, quality: 85 },
  { id: 'a4', label: 'Print A4 · 300 dpi', format: 'png', long: 3508, print: true },
  { id: 'a3', label: 'Poster A3 · 300 dpi', format: 'png', long: 4961, print: true },
  { id: 'svg', label: 'Vector SVG', format: 'svg' },
  { id: 'gif', label: 'Looping GIF · 3 s', format: 'gif', duration: 3, fps: 15 },
  { id: 'video', label: 'Video MP4 · 10 s', format: 'mp4', long: 1080, duration: 10, fps: 30 },
];

/**
 * The export settings for a ready-made entry, for an output of `outW` × `outH` pixels. Scale is
 * the whole number that gets the long side nearest the wanted size (1–8); `reached` is the long
 * side that gives, which can fall short of the wanted size for small outputs.
 */
export function readyExport(r: ReadyExport, outW: number, outH: number): { params: Partial<Params>; reached: number } {
  const long = Math.max(1, outW, outH);
  const scale = r.long ? Math.min(8, Math.max(1, Math.round(r.long / long))) : 1;
  return {
    params: {
      exportFormat: r.format,
      exportScale: scale,
      exportPrint: !!r.print,
      ...(r.print ? { exportDpi: 300 } : {}),
      ...(r.quality ? { exportQuality: r.quality } : {}),
      ...(r.duration ? { exportDuration: r.duration } : {}),
      ...(r.fps ? { exportFps: r.fps } : {}),
    },
    reached: long * scale,
  };
}

export const isAnimatedFormat = (id: string) => EXPORT_FORMATS.some((f) => f.id === id && f.animated);

export const EXPORT_SLIDERS: Record<string, SliderSpec> = {
  scale: { key: 'exportScale', label: 'Scale', min: 1, max: 8, step: 1, format: (v) => `${v}×` },
  duration: { key: 'exportDuration', label: 'Duration', min: 1, max: 30, step: 1, format: (v) => `${v} s` },
  fps: { key: 'exportFps', label: 'Frame rate', min: 5, max: 30, step: 1, format: (v) => `${v} fps` },
  dpi: { key: 'exportDpi', label: 'Resolution', min: 72, max: 1200, step: 1, format: (v) => `${v} dpi` },
  quality: { key: 'exportQuality', label: 'Quality', min: 10, max: 100, step: 1, format: (v) => `${v}%` },
};

export const ANSI_DEPTHS = [
  { id: 'truecolor', label: 'Truecolor' },
  { id: '256', label: '256 colours' },
];

export const EXPORT_UNITS = [
  { id: 'cm', label: 'Centimetres' },
  { id: 'in', label: 'Inches' },
];

/** Physical size of `px` pixels at `dpi`, in the unit ('cm' or 'in'). */
export const printLength = (px: number, dpi: number, unit: string) => (px / dpi) * (unit === 'cm' ? 2.54 : 1);

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
  { key: 'warpCurve', label: 'Curve', min: -100, max: 100, step: 1, format: signed },
  { key: 'warpSwirl', label: 'Swirl', min: -100, max: 100, step: 1, format: signed },
  { key: 'warpSwirlRadius', label: 'Swirl radius', min: 10, max: 100, step: 1, format: pct },
];

export const PALETTE_MIXING = [{ id: 'nearest', label: 'Nearest' }, { id: 'pattern', label: 'Pattern' }];
export const HALFTONE_SHAPES = [
  { id: 'round', label: 'Round' }, { id: 'ellipse', label: 'Ellipse' },
  { id: 'square', label: 'Square' }, { id: 'diamond', label: 'Diamond' },
];

export const DITHER_SLIDERS: Record<string, SliderSpec> = {
  modulationAmount: { key: 'modulationAmount', label: 'Modulation', min: 0, max: 100, step: 1 },
  modulationWidth: { key: 'modulationWidth', label: 'Line width', min: 1, max: 100, step: 1 },
  modulationPhase: { key: 'modulationPhase', label: 'Phase', min: 0, max: 100, step: 1 },
  contourLevels: { key: 'contourLevels', label: 'Lines', min: 2, max: 48, step: 1 },
  contourSmooth: { key: 'contourSmooth', label: 'Smoothness', min: 0, max: 100, step: 1, format: pct },
  moireRatio: { key: 'moireRatio', label: 'Second wavelength', min: 50, max: 200, step: 1, format: pct },
  moireAngle: { key: 'moireAngle', label: 'Second angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  radialX: { key: 'radialX', label: 'Centre X', min: 0, max: 100, step: 1, format: pct },
  radialY: { key: 'radialY', label: 'Centre Y', min: 0, max: 100, step: 1, format: pct },
  radialArms: { key: 'radialArms', label: 'Spiral arms', min: -8, max: 8, step: 1, format: signed },
  polyBorder: { key: 'polyBorder', label: 'Border', min: 0, max: 50, step: 1, format: pct },
  polyJitter: { key: 'polyJitter', label: 'Jitter', min: 0, max: 100, step: 1, format: pct },
  gaussSpread: { key: 'gaussSpread', label: 'Spread', min: 0, max: 100, step: 1, format: pct },
  gaussNoise: { key: 'gaussNoise', label: 'Noise', min: 0, max: 100, step: 1, format: pct },
  edgeCrack: { key: 'edgeCrack', label: 'Crack', min: 0, max: 100, step: 1, format: pct },
  axisBleed: { key: 'axisBleed', label: 'Bleed', min: 0, max: 100, step: 1, format: pct },
  axisSmooth: { key: 'axisSmooth', label: 'Smoothing', min: 0, max: 100, step: 1, format: pct },
  shapeJitter: { key: 'shapeJitter', label: 'Position variation', min: 0, max: 100, step: 1 },
  shapeSizeJitter: { key: 'shapeSizeJitter', label: 'Size variation', min: 0, max: 100, step: 1 },
  shapeAngleJitter: { key: 'shapeAngleJitter', label: 'Rotation variation', min: 0, max: 180, step: 1 },
  shapeSeed: { key: 'shapeSeed', label: 'Shape seed', min: 1, max: 9999, step: 1 },
  shapeFeather: { key: 'shapeFeather', label: 'Band feather', min: 0, max: 100, step: 1, format: pct },
  stippleCount: { key: 'stippleCount', label: 'Dots', min: 100, max: 30000, step: 100 },
  stippleIterations: { key: 'stippleIterations', label: 'Relaxation', min: 0, max: 20, step: 1 },
  stippleSize: { key: 'stippleSize', label: 'Dot size', min: 10, max: 200, step: 1, format: pct },
  stippleSeed: { key: 'stippleSeed', label: 'Seed', min: 1, max: 9999, step: 1 },
  strength: { key: 'strength', label: 'Strength', min: 0, max: 200, step: 1, format: pct },
  threshold: { key: 'threshold', label: 'Threshold', min: 0, max: 100, step: 1, format: pct },
  cellSize: { key: 'cellSize', label: 'Cell size', min: 2, max: 32, step: 1, format: (v) => `${v}px` },
  angle: { key: 'angle', label: 'Angle', min: 0, max: 90, step: 1, format: (v) => `${v}°` },
  diffusion: { key: 'diffusion', label: 'Diffusion', min: 0, max: 100, step: 1, format: pct },
  levels: { key: 'levels', label: 'Levels', min: 2, max: 32, step: 1 },
  waveStrength: { key: 'waveStrength', label: 'Wave', min: 0, max: 100, step: 1, format: pct },
  waveLength: { key: 'waveLength', label: 'Wavelength', min: 2, max: 64, step: 1, format: (v) => `${v}px` },
  waveBias: { key: 'waveBias', label: 'Tilt', min: -100, max: 100, step: 1, format: (v) => `${signed(v)}%` },
  waveFollow: { key: 'waveFollow', label: 'Follow image', min: 0, max: 100, step: 1, format: pct },
  hexRings: { key: 'hexRings', label: 'Rings', min: 0, max: 100, step: 1, format: pct },
  patternFollow: { key: 'patternFollow', label: 'Follow image', min: 0, max: 100, step: 1, format: pct },
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
  shape: { key: 'asciiShape', label: 'Shape matching', min: 0, max: 100, step: 1, format: pct },
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
  reveal: [
    { key: 'fxRevealProgress', label: 'Reveal progress', min: 0, max: 100, step: 1 },
    { key: 'fxRevealSoftness', label: 'Reveal softness', min: 0, max: 100, step: 1 },
    { key: 'fxRevealThreshold', label: 'Reveal threshold', min: 0, max: 100, step: 1 },
    { key: 'fxRevealAngle', label: 'Reveal direction', min: 0, max: 360, step: 1 },
  ],
  glow: [
    { key: 'fxGlowRadius', label: 'Radius', min: 1, max: 200, step: 1, format: (v) => `${v}px` },
    { key: 'fxGlowIntensity', label: 'Intensity', min: 0, max: 200, step: 1, format: pct },
    { key: 'fxGlowThreshold', label: 'Threshold', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlowSoftness', label: 'Softness', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxGlowAspect', label: 'Stretch', min: 0.25, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
    { key: 'fxGlowAngle', label: 'Angle', min: 0, max: 180, step: 1, format: (v) => `${v}°` },
    { key: 'fxGlowFalloff', label: 'Falloff', min: 0, max: 3, step: 0.1, format: (v) => v.toFixed(1) },
    { key: 'fxGlowEpsilon', label: 'Epsilon', min: 0, max: 100, step: 1 },
    { key: 'fxGlowDistance', label: 'Distance scale', min: 25, max: 400, step: 1, format: pct },
    { key: 'fxGlowTint', label: 'Glow tint', min: 0, max: 100, step: 1, format: pct },
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
  sort: [
    { key: 'fxSortLow', label: 'Sort from', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxSortHigh', label: 'Sort to', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxSortLength', label: 'Max length', min: 2, max: 512, step: 1, format: (v) => `${v}px` },
  ],
  finish: [
    { key: 'fxFinishBlur', label: 'Soften', min: 0, max: 10, step: 0.5, format: (v) => `${v}px` },
    { key: 'fxFinishSharpen', label: 'Sharpen', min: 0, max: 100, step: 1, format: pct },
    { key: 'fxFinishHue', label: 'Hue', min: -180, max: 180, step: 1, format: (v) => `${signed(v)}°` },
  ],
};

export const MASK_MODES = [
  { id: 'off', label: 'Off' },
  { id: 'luma', label: 'Brightness range' },
  { id: 'hue', label: 'Colour range' },
];

export const MASK_OUTSIDE = [
  { id: 'original', label: 'Original' },
  { id: 'color', label: 'Colour' },
  { id: 'transparent', label: 'Transparent' },
];

export const MASK_SLIDERS: Record<string, SliderSpec> = {
  low: { key: 'maskLow', label: 'From', min: 0, max: 100, step: 1, format: pct },
  high: { key: 'maskHigh', label: 'To', min: 0, max: 100, step: 1, format: pct },
  hue: { key: 'maskHue', label: 'Hue', min: 0, max: 360, step: 1, format: (v) => `${v}°` },
  hueWidth: { key: 'maskHueWidth', label: 'Width', min: 5, max: 180, step: 1, format: (v) => `±${v}°` },
  feather: { key: 'maskFeather', label: 'Feather', min: 0, max: 100, step: 1, format: pct },
};

export const MASK_KEYS: (keyof Params)[] = [
  'maskMode',
  'maskInvert',
  'maskOutside',
  'maskColor',
  ...Object.values(MASK_SLIDERS).map((s) => s.key),
];

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
  'shapeLayout', 'shapeJitter', 'shapeSizeJitter', 'shapeAngleJitter', 'shapeSeed', 'shapeTransparent',
  'modulationAmount', 'modulationWidth', 'modulationPhase',
  'contourLevels', 'contourSmooth', 'moireRatio', 'moireAngle', 'radialX', 'radialY', 'radialArms',
  'polyBorder', 'polyBorderColor', 'polyJitter',
  'gaussSpread', 'gaussNoise', 'edgeCrack', 'axisVertical', 'axisBleed', 'axisSmooth',
  'shapeBands', 'shapeFeather', 'shapeFeatherPattern', 'shapeBackground',
  'paletteMixing', 'linearLight', 'halftoneShape',
  'stippleCount', 'stippleIterations', 'stippleSize', 'stippleSeed',
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
  'waveFollow',
  'hexRings',
  'patternFollow',
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

export const ANIM_KEYS: (keyof Params)[] = ['animate', 'boilFps', 'boilPattern', 'boilAmount', 'animLanes', 'animDuration',
  'temporalPattern', 'temporalLoop', ...TEMPORAL_SLIDERS.map((s) => s.key)];

export const FX_KEYS: (keyof Params)[] = [
  'fxReveal', 'fxRevealTarget',
  'fxSort', 'fxSortVertical', 'fxSortReverse',
  'fxOrder', 'fxStack',
  'fxGlow', 'fxGlowCompensate', 'fxGlowColor',
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

/** Settings of an effect besides its sliders. */
const FX_EXTRA_KEYS: Record<string, (keyof Params)[]> = {
  reveal: ['fxRevealTarget'],
  sort: ['fxSortVertical', 'fxSortReverse'],
  glow: ['fxGlowCompensate', 'fxGlowColor'],
  tint: ['fxTintColor', 'fxTintMode'],
};

/** The settings each effect owns (its layers carry their own copy of these). */
export const FX_TYPE_KEYS: Record<string, (keyof Params)[]> = Object.fromEntries(
  Object.entries(FX_SLIDERS).map(([id, list]) => [id, [...list.map((spec) => spec.key), ...(FX_EXTRA_KEYS[id] ?? [])]]),
);

/** One effect layer's settings: only that effect's keys, each sanitized like any param. */
function cleanFxSettings(type: string, settings: unknown): Partial<Params> {
  const clean = sanitize(settings);
  const out: Partial<Params> = {};
  for (const key of FX_TYPE_KEYS[type] ?? []) if (clean[key] !== undefined) Object.assign(out, { [key]: clean[key] });
  return out;
}

export const ASCII_KEYS: (keyof Params)[] = [
  'asciiShape',
  'asciiCharset',
  'asciiCustom',
  'asciiColumns',
  'asciiFont',
  'asciiBold',
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

/** Settings layer 2 has of its own; the rest (adjust, effects, mask, animation) is shared. */
export const LAYER_KEYS: (keyof Params)[] = ['mode', 'pixelSize', ...DITHER_KEYS, ...ASCII_KEYS];

/** Keep only a layer's own settings, sanitized. */
function cleanLayerParams(data: unknown): Record<string, unknown> {
  const clean = sanitize(data) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of LAYER_KEYS) if (key in clean) out[key] = clean[key];
  return out;
}

/** Layer 2 of these params, or null when there is none. */
export const readLayer = (p: Params): Layer | null => parseLayer(p.layer2, cleanLayerParams);

/** The params layer 2 renders with: shared settings from `p`, its own from defaults + the layer. */
export function layerParams(p: Params, layer: Layer): Params {
  const own: Record<string, unknown> = {};
  for (const key of LAYER_KEYS) own[key] = DEFAULTS[key];
  return { ...p, ...own, ...layer.params } as Params;
}

/** Allowed values for string params that come from a fixed list. */
const ENUMS: Partial<Record<keyof Params, string[]>> = {
  temporalPattern: TEMPORAL_PATTERNS.map((p) => p.id),
  shapeLayout: ['grid', 'staggered', 'scatter'],
  fxRevealTarget: ['original', 'processed'],
  shapeFeatherPattern: ['ordered', 'scatter'],
  paletteMixing: PALETTE_MIXING.map((x) => x.id),
  halftoneShape: HALFTONE_SHAPES.map((x) => x.id),
  mode: ['dither', 'ascii'],
  algorithm: ALGORITHMS.map((a) => a.id),
  palette: [...PALETTES.map((p) => p.id), ...SET_IDS],
  asciiCharset: CHARSETS.map((c) => c.id),
  asciiColor: COLOR_MODES.map((c) => c.id),
  asciiOffsetLfo: LFO_SHAPES.map((s) => s.id),
  asciiDepthLfo: LFO_SHAPES.map((s) => s.id),
  asciiPalette: [...ASCII_PALETTES, ...SET_IDS],
  exportFormat: EXPORT_FORMATS.map((f) => f.id),
  exportUnit: EXPORT_UNITS.map((u) => u.id),
  exportAnsi: ANSI_DEPTHS.map((d) => d.id),
  fxTintMode: TINT_MODES.map((m) => m.id),
  boilPattern: BOIL_PATTERNS.map((b) => b.id),
  maskMode: MASK_MODES.map((m) => m.id),
  maskOutside: MASK_OUTSIDE.map((m) => m.id),
};
const COLOR_KEYS: (keyof Params)[] = [
  'ink', 'paper', 'asciiFg', 'asciiBg', 'fxTintColor', 'maskColor', 'shapeBackground', 'polyBorderColor', 'fxGlowColor',
];
const HEX = /^#[0-9a-f]{6}$/i;

const STORAGE_KEY = 'dag.params.v1';

const RANGES = new Map(
  [
    ...ADJUST_SLIDERS,
    ...Object.values(DITHER_SLIDERS),
    ...Object.values(ASCII_SLIDERS),
    ...Object.values(EXPORT_SLIDERS),
    ...Object.values(FX_SLIDERS).flat(),
    ...Object.values(MASK_SLIDERS),
    BOIL_SLIDER,
    BOIL_AMOUNT_SLIDER,
    ANIM_DURATION_SLIDER,
    ...TEMPORAL_SLIDERS,
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
  ...TEMPORAL_SLIDERS.filter((s) => s.key !== 'temporalSeed'),
  ...ADJUST_SLIDERS,
  ...Object.values(DITHER_SLIDERS).filter((s) => !s.key.startsWith('stipple')),
  ...Object.values(ASCII_SLIDERS).filter((s) => s.key !== 'asciiFontSize' && s.key !== 'asciiLineHeight'),
  ...Object.values(FX_SLIDERS).flat(),
  ...Object.values(MASK_SLIDERS),
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
    if (key === 'exportName' && (v as string).length > MAX_EXPORT_NAME) continue;
    if (key === 'asciiInject' && [...(v as string)].length > MAX_INJECT) continue;
    if (key === 'asciiFont') {
      // Built-in ids, or a font the user added ('user:<name>'), which may only exist in their browser.
      if (isFontId(v as string)) out[key] = v;
      continue;
    }
    if (key === 'layer2') {
      const layer = parseLayer(v as string, cleanLayerParams);
      out[key] = layer ? serializeLayer(layer) : '';
      continue;
    }
    if (key === 'animLanes') {
      out[key] = serializeLanes(parseLanes(v as string, animatableSpec));
      continue;
    }
    if (key === 'customPalette') {
      const colors = parseColorList(v as string);
      if (colors.length >= 2) out[key] = serializeColorList(colors);
      continue;
    }
    if (key === 'shapeBands') {
      const bands = parseShapeBands(v as string);
      if (bands) out[key] = JSON.stringify(bands);
      continue;
    }
    if (key === 'fxStack') {
      const list = (v as string) ? parseStack(v as string, cleanFxSettings) : null;
      out[key] = list ? serializeStack(list) : '';
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

export type Listener = (params: Params, changed: keyof Params) => void;

/** What controls bind to: the page's Store, or a view of it such as layer 2's settings. */
export interface ParamStore {
  readonly params: Params;
  set<K extends keyof Params>(key: K, value: Params[K]): void;
  subscribe(fn: Listener): () => void;
}

export class Store implements ParamStore {
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
