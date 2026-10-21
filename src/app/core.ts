import { applyAnimation, parseLanes, type AudioLevel, type Lane } from '../anim';
import { AutoScale } from '../auto-scale';
import { getAlgorithm } from '../pipeline/algorithms';
import type { Source } from '../source/source';
import type { Layer } from '../layers';
import { animatableSpec, layerParams, readLayer, Store, type Params } from '../state';

/** The one settings store for the page. */
export const store = new Store();

/** Mutable runtime state shared by the app modules. */
export const rt = {
  current: null as Source | null,
  /** True while the original is shown (Space / Original button). */
  showOriginal: false,
  /** Show the mask itself instead of the result (Mask section). */
  showMask: false,
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
  /** Draw now at full resolution (ends a fast playback preview), for exports that read the result. */
  renderFull: (): void => {},
  /** Render each image file with the current look and save them in one .zip. */
  batchExport: async (_files: File[]): Promise<void> => {},
  copyText: async (): Promise<void> => {},
  exportText: (): void => {},
  exportHtml: (): void => {},
  copyAnsi: async (): Promise<void> => {},
  exportAnsi: (): void => {},
  setOriginal: (_on: boolean): void => {},
  fit: (): void => {},
  zoom100: (): void => {},
  /** Runs after every draw (updates the export summary). */
  afterDraw: (): void => {},
  /** Redraws the before/after split overlay. */
  drawSplit: (): void => {},
  /** Redraw preset thumbnails: all of them for a new picture, otherwise only missing ones. */
  refreshThumbs: (_pictureChanged: boolean): void => {},
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

// Parsed layer 2, cached per stored string.
let layerCache: { json: string; layer: Layer | null } = { json: '', layer: null };

/** Layer 2 when it is switched on, with the params it renders with (shared settings taken from `p`). */
export function activeLayer(p: Params): { layer: Layer; params: Params } | null {
  if (layerCache.json !== p.layer2) layerCache = { json: p.layer2, layer: readLayer(p) };
  const layer = layerCache.layer;
  return layer?.on ? { layer, params: layerParams(p, layer) } : null;
}

/** Preview resolution while a video or the webcam plays (see auto-scale.ts). */
export const autoScale = new AutoScale();

/** A video playing or the webcam streaming, outside an export: the preview may go coarser. */
export function isPlaying(): boolean {
  const src = rt.current;
  if (!src || src.kind === 'image' || rt.exporting) return false;
  return src.kind === 'webcam' || !(src.element as HTMLVideoElement).paused;
}

/** Audio input for audio lanes; app/audio.ts replaces `level` when a microphone or file is in use. */
export const audioInput: { level: AudioLevel } = { level: () => 0 };

/** The params to render with: slider values, with animated settings at the current clock. */
export const animatedParams = (p: Params) =>
  applyAnimation(p, lanesOf(p), clock(), animatableSpec, (band, window) => audioInput.level(band, window));

export const group = (p: Params) => getAlgorithm(p.algorithm).group;
export const notBraille = (p: Params) => p.asciiCharset !== 'braille';
export const lfoActive = (p: Params) =>
  p.mode === 'ascii' && notBraille(p) && (p.asciiOffsetLfo !== 'off' || p.asciiDepthLfo !== 'off');
export const transparentAscii = (p: Params) => p.asciiTransparent && p.asciiColor !== 'colorBg';
/** The output has transparent areas: an ASCII background, or what lies outside the mask. */
export const transparentOutput = (p: Params) =>
  (p.mode === 'ascii' && transparentAscii(p)) || (p.maskMode !== 'off' && p.maskOutside === 'transparent');
