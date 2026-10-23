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
  /** Further parameters (`u_r`) and a colour (`u_c`), for effects that need them (glow). */
  more?: [number, number, number, number];
  color?: [number, number, number];
}

/** Glow radius whose brightness Radius compensation keeps (the baseline). */
export const GLOW_BASE_RADIUS = 20;

/**
 * Radius compensation gain. A wide glow averages its bright sources over a larger area, so small
 * bright details fade while large bright areas don't. Given how bright the gathered light gets at
 * the baseline radius and at the glow's radius, this brings it back up (at most 8×, never down).
 */
export const compensationGain = (basePeak: number, widePeak: number) =>
  Math.min(8, Math.max(1, basePeak / Math.max(widePeak, 1e-3)));

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
  more?: (p: Params) => [number, number, number, number];
  color?: (p: Params) => [number, number, number];
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
  { id: 'hard-light', label: 'Hard light' },
  { id: 'difference', label: 'Difference' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'darken', label: 'Darken' },
  { id: 'color-dodge', label: 'Colour dodge' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'luminosity', label: 'Luminosity' },
  { id: 'normal', label: 'Normal' },
];

export const EFFECTS: EffectDef[] = [
  {
    id: 'reveal', label: 'ASCII Reveal', enabled: 'fxReveal', kind: 9,
    uniforms: (p) => [p.fxRevealProgress / 100, p.fxRevealSoftness / 100, p.fxRevealThreshold / 100, rad(p.fxRevealAngle)],
    extra: (p) => [p.fxRevealTarget === 'original' ? 0 : 1, p.asciiColumns, 0, 0],
  },
  {
    id: 'sort', label: 'Pixel sorting', enabled: 'fxSort', kind: 8,
    uniforms: (p) => [p.fxSortLow / 100, p.fxSortHigh / 100, p.fxSortLength, p.fxSortVertical ? 1 : 0],
    extra: (p) => [p.fxSortReverse ? 1 : 0, 0, 0, 0],
  },
  {
    id: 'glow',
    label: 'Glow',
    enabled: 'fxGlow',
    kind: 0,
    bright: true,
    uniforms: (p) => [p.fxGlowRadius, p.fxGlowIntensity / 100, p.fxGlowThreshold / 100, p.fxGlowSoftness / 100],
    // ε in the falloff 1 / ((ring · scale)^n + ε), up to 2 (the ring terms run 1 … 3^n).
    extra: (p) => [p.fxGlowAspect, rad(p.fxGlowAngle), p.fxGlowFalloff, p.fxGlowEpsilon / 50],
    // u_r.y is the compensation gain, filled in by the renderer from the bright pass (1 = none).
    more: (p) => [p.fxGlowDistance / 100, 1, p.fxGlowTint / 100, p.fxGlowCompensate ? 1 : 0],
    color: (p) => hexToRgb(p.fxGlowColor),
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
    .map((e) => ({
      kind: e.kind,
      params: e.uniforms(p),
      extra: e.extra?.(p) ?? [0, 0, 0, 0],
      bright: !!e.bright,
      ...(e.more ? { more: e.more(p) } : {}),
      ...(e.color ? { color: e.color(p) } : {}),
    }));
}
