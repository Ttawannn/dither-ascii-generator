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
  previewTime: 0,
  previewPaused: false,
  previewStarted: performance.now() / 1000,
  exporting: null as { cancelled: boolean } | null,
  /** Suppress queued/live redraws while an export waits for a complete full-resolution frame. */
  renderingFull: false,
};

/**
 * Late-bound entry points for calls that go "up" the module graph (panel buttons → features,
 * draw → export summary). Each feature module assigns its functions here when it loads, which
 * keeps the imports one-directional.
 */
export const stippleProgress = {
  busy: false,
  value: 0,
  listeners: new Set<(busy: boolean, progress: number) => void>(),
};

/** Called after a new source is set (the panel refreshes lists that depend on the picture). */
export const sourceListeners = new Set<() => void>();

export const actions = {
  syncAudioClock: (_time: number, _playing: boolean): void => {},
  beginUndo: (): void => {},
  beginUndoGesture: (): void => {},
  endUndoGesture: (): void => {},
  resetHistory: (): void => {},
  saveProject: async (): Promise<void> => {},
  openProject: async (_file: File): Promise<void> => {},
  cancelProject: (): void => {},
  projectStatus: (_message: string, _busy: boolean): void => {},
  generateStipple: async (_p: Params): Promise<void> => {},
  cancelStipple: (): void => {},
  openSample: async (): Promise<void> => {},
  toggleWebcam: async (): Promise<void> => {},
  exportClick: async (): Promise<void> => {},
  /** Draw now at full resolution (ends a fast playback preview), for exports that read the result. */
  renderFull: (): void => {},
  /** Render at full resolution and wait for all asynchronous glyph and diffusion work. */
  renderReady: async (): Promise<void> => {},
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
  if (rt.renderingFull) return;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!rt.renderingFull) drawFn();
  });
}

/** Animation clock in seconds: real time, or the frame time while exporting. */
export const clock = () => rt.clockOverride ?? (rt.current?.kind === 'video' ? (rt.current.element as HTMLVideoElement).currentTime
  : rt.previewPaused ? rt.previewTime : rt.previewTime + performance.now() / 1000 - rt.previewStarted);
export const animationPaused = () => rt.current?.kind === 'video' ? (rt.current.element as HTMLVideoElement).paused : rt.previewPaused;
export function seekAnimation(time: number): void {
  rt.previewTime = Math.max(0, time); rt.previewPaused = true; rt.clockOverride = null; requestRender();
  if (rt.current?.kind === 'video') {
    const video = rt.current.element as HTMLVideoElement;
    video.pause();
    const at = Math.min(video.duration, Math.max(0, time));
    if (Math.abs(video.currentTime - at) > 1e-4) video.currentTime = at;
  }
  actions.syncAudioClock(clock(), false);
  rt.seed = store.params.animate && store.params.temporalPattern === 'off' ? Math.floor(time * store.params.boilFps) + 1 : 0;
}
export function toggleAnimation(): void {
  if (animationPaused()) {
    rt.previewStarted = performance.now() / 1000; rt.previewPaused = false;
    if (rt.current?.kind === 'video') void (rt.current.element as HTMLVideoElement).play().catch(() => undefined);
    actions.syncAudioClock(clock(), true);
  }
  else seekAnimation(clock());
  requestRender();
}

// Parsed animation lanes, cached per stored string.
let lanesCache: { json: string; lanes: Lane[] } = { json: '', lanes: [] };
export function lanesOf(p: Params): Lane[] {
  if (lanesCache.json !== p.animLanes)
    lanesCache = { json: p.animLanes, lanes: parseLanes(p.animLanes, animatableSpec) };
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
  (p.mode === 'ascii' && transparentAscii(p)) || (p.mode === 'dither' && p.algorithm === 'luma-shapes' && p.shapeTransparent)
  || p.fxReveal || (p.maskMode !== 'off' && p.maskOutside === 'transparent');
