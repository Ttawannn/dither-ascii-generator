import type { Params } from '../state';
import { hexToRgb } from './palettes';

/** One pass of the post-effect chain, as sent to post.frag. */
export interface PostEffect {
  /** `u_kind` in post.frag. */
  kind: number;
  /** Effect parameters in shader units (`u_p`). */
  params: [number, number, number, number];
  /** More parameters for effects that need them (`u_q`). */
  extra: [number, number, number, number];
  /** Run the bright pass first and pass its mipmapped result as `u_glow` (glow). */
  bright: boolean;
  /** Mask pass only: colour shown outside the mask, and whether to show the mask itself. */
  mask?: { color: [number, number, number]; view: boolean };
}

/** `u_kind` of the mask pass, which always runs last. */
export const MASK_KIND = 101;
const MASK_OUTSIDE_IDS = ['original', 'color', 'transparent'];

/**
 * The mask as a final pass, or null when it is off. u_p: from, to, feather, invert;
 * u_q: hue, hue width (turns), mode (1 brightness, 2 colour), outside index.
 */
export function maskEffect(p: Params, view = false): PostEffect | null {
  if (p.maskMode === 'off') return null;
  return {
    kind: MASK_KIND,
    params: [p.maskLow / 100, p.maskHigh / 100, p.maskFeather / 100, p.maskInvert ? 1 : 0],
    extra: [p.maskHue / 360, p.maskHueWidth / 360, p.maskMode === 'hue' ? 2 : 1, Math.max(0, MASK_OUTSIDE_IDS.indexOf(p.maskOutside))],
    bright: false,
    mask: { color: hexToRgb(p.maskColor), view },
  };
}

export interface EffectDef {
  id: string;
  label: string;
  /** Boolean param that switches the effect on. */
  enabled: keyof Params;
  kind: number;
  /** Shown under the toggle: true when the effect moves with Boil. */
  animated?: boolean;
  uniforms: (p: Params) => [number, number, number, number];
  extra?: (p: Params) => [number, number, number, number];
  bright?: boolean;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Blend modes for the Tint effect, in `u_q.x` order. */
export const TINT_MODES = [
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'soft-light', label: 'Soft light' },
  { id: 'color', label: 'Colour' },
  { id: 'color-burn', label: 'Colour burn' },
];

export const EFFECTS: EffectDef[] = [
  {
    id: 'glow',
    label: 'Glow',
    enabled: 'fxGlow',
    kind: 0,
    bright: true,
    uniforms: (p) => [p.fxGlowRadius, p.fxGlowIntensity / 100, p.fxGlowThreshold / 100, p.fxGlowSoftness / 100],
    extra: (p) => [p.fxGlowAspect, rad(p.fxGlowAngle), p.fxGlowFalloff, 0],
  },
  {
    id: 'glitch',
    label: 'JPEG glitch',
    enabled: 'fxGlitch',
    kind: 3,
    animated: true,
    uniforms: (p) => [p.fxGlitchAmount / 100, p.fxGlitchBlock, p.fxGlitchShift / 100, p.fxGlitchCrush / 100],
    extra: (p) => [p.fxGlitchSwap / 100, p.fxGlitchScan / 100, p.fxGlitchScramble / 100, p.fxGlitchInterlace / 100],
  },
  {
    id: 'chroma',
    label: 'Chromatic aberration',
    enabled: 'fxChroma',
    kind: 1,
    uniforms: (p) => [p.fxChromaAmount, p.fxChromaR / 100, p.fxChromaG / 100, p.fxChromaB / 100],
  },
  {
    id: 'scanlines',
    label: 'Scanlines / CRT',
    enabled: 'fxScan',
    kind: 2,
    uniforms: (p) => [p.fxScanPeriod, p.fxScanIntensity / 100, p.fxScanCurve / 100, 0],
  },
  {
    id: 'vignette',
    label: 'Vignette',
    enabled: 'fxVignette',
    kind: 4,
    uniforms: (p) => [p.fxVignetteAmount / 100, 0, 0, 0],
  },
  {
    id: 'grain',
    label: 'Film grain',
    enabled: 'fxGrain',
    kind: 5,
    animated: true,
    uniforms: (p) => [p.fxGrainAmount / 100, p.fxGrainSize, 0, 0],
  },
  {
    id: 'tint',
    label: 'Tint',
    enabled: 'fxTint',
    kind: 6,
    uniforms: (p) => [...hexToRgb(p.fxTintColor), p.fxTintOpacity / 100],
    extra: (p) => [Math.max(0, TINT_MODES.findIndex((m) => m.id === p.fxTintMode)), 0, 0, 0],
  },
  {
    id: 'finish',
    label: 'Finish',
    enabled: 'fxFinish',
    kind: 7,
    uniforms: (p) => [p.fxFinishBlur, p.fxFinishSharpen / 100, rad(p.fxFinishHue), 0],
  },
];

export const EFFECT_IDS = EFFECTS.map((e) => e.id);
export const DEFAULT_ORDER = EFFECT_IDS.join(',');

/**
 * Turn any string into a valid effect order: known ids in the given order, without duplicates,
 * followed by any ids it left out (in their default order).
 */
export function normalizeOrder(order: string): string {
  const seen = order
    .split(',')
    .map((s) => s.trim())
    .filter((id, i, all) => EFFECT_IDS.includes(id) && all.indexOf(id) === i);
  return [...seen, ...EFFECT_IDS.filter((id) => !seen.includes(id))].join(',');
}

export function getEffect(id: string): EffectDef {
  return EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];
}

/** Move an effect one step earlier (-1) or later (+1) in the order string. */
export function moveEffect(order: string, id: string, step: -1 | 1): string {
  const ids = normalizeOrder(order).split(',');
  const i = ids.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= ids.length) return ids.join(',');
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids.join(',');
}

/** The enabled effects in chain order, ready for the renderer. */
export function activeEffects(p: Params): PostEffect[] {
  return normalizeOrder(p.fxOrder)
    .split(',')
    .map(getEffect)
    .filter((e) => p[e.enabled] === true)
    .map((e) => ({ kind: e.kind, params: e.uniforms(p), extra: e.extra?.(p) ?? [0, 0, 0, 0], bright: !!e.bright }));
}
