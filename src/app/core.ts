import { applyAnimation, parseLanes, type Lane } from '../anim';
import { getAlgorithm } from '../pipeline/algorithms';
import type { Source } from '../source/source';
import { animatableSpec, Store, type Params } from '../state';

/** The one settings store for the page. */
export const store = new Store();

/** Mutable runtime state shared by the app modules. */
export const rt = {
  current: null as Source | null,
  /** True while the original is shown (Space / Original button). */
  showOriginal: false,
  /** Boil seed: 0 = static; advances at `boilFps` while animating. */
  seed: 0,
  /** Frame time in seconds while exporting; null means real time. */
  clockOverride: null as number | null,
  exporting: null as { cancelled: boolean } | null,
};

/**
 * Late-bound entry points for calls that go "up" the module graph (panel buttons → features,
 * draw → export summary). Each feature module assigns its functions here when it loads, which
 * keeps the imports one-directional.
 */
export const actions = {
  openSample: async (): Promise<void> => {},
  toggleWebcam: async (): Promise<void> => {},
  exportClick: async (): Promise<void> => {},
  copyText: async (): Promise<void> => {},
  exportText: (): void => {},
  exportHtml: (): void => {},
  setOriginal: (_on: boolean): void => {},
  fit: (): void => {},
  zoom100: (): void => {},
  /** Runs after every draw (updates the export summary). */
  afterDraw: (): void => {},
};

let drawFn = () => {};
let frame = 0;

/** Register the function that draws a frame (render.ts). */
export function setDrawer(fn: () => void): void {
  drawFn = fn;
}

/** Draw on the next animation frame; repeated calls before then coalesce into one draw. */
export function requestRender(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    drawFn();
  });
}

/** Animation clock in seconds: real time, or the frame time while exporting. */
export const clock = () => rt.clockOverride ?? performance.now() / 1000;

// Parsed animation lanes, cached per stored string.
let lanesCache: { json: string; lanes: Lane[] } = { json: '', lanes: [] };
export function lanesOf(p: Params): Lane[] {
  if (lanesCache.json !== p.animLanes) lanesCache = { json: p.animLanes, lanes: parseLanes(p.animLanes, animatableSpec) };
  return lanesCache.lanes;
}

/** The params to render with: slider values, with animated settings at the current clock. */
export const animatedParams = (p: Params) => applyAnimation(p, lanesOf(p), clock(), animatableSpec);

export const group = (p: Params) => getAlgorithm(p.algorithm).group;
export const notBraille = (p: Params) => p.asciiCharset !== 'braille';
export const lfoActive = (p: Params) =>
  p.mode === 'ascii' && notBraille(p) && (p.asciiOffsetLfo !== 'off' || p.asciiDepthLfo !== 'off');
export const transparentAscii = (p: Params) => p.asciiTransparent && p.asciiColor !== 'colorBg';
