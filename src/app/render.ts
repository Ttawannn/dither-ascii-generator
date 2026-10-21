import { activeEffects, maskEffect } from '../pipeline/effects';
import { isVideo, type Source } from '../source/source';
import type { Params } from '../state';
import { LAYER_BLENDS } from '../layers';
import { coarser } from '../auto-scale';
import {
  actions,
  activeLayer,
  animatedParams,
  autoScale,
  group,
  isPlaying,
  lanesOf,
  lfoActive,
  requestRender,
  rt,
  setDrawer,
  store,
  transparentOutput,
} from './core';
import { drawAscii } from './ascii-view';
import { drawDither } from './dither-view';
import { mainTarget, renderer, type RenderTarget } from './gpu';
import { info, setStatus, stage } from './shell';

/** Draw the current source with the current (animated) settings. Synchronous. */
export function draw(): void {
  const src = rt.current;
  if (!renderer.hasSource || !src || renderer.contextLost) return;
  const p = animatedParams(store.params);
  if (isVideo(src) && src.element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    renderer.setSource(src.element, src.width, src.height);
  }
  stage.classList.toggle('ascii', p.mode === 'ascii' && !rt.showOriginal);
  stage.classList.toggle('transparent', !rt.showOriginal && !rt.showMask && transparentOutput(p));

  if (rt.showOriginal) {
    // The original view is shown untouched.
    renderer.setEffects([], rt.seed, !transparentOutput(p));
    renderer.renderAdjust(p, true);
    renderer.renderAdjusted();
    setStatus('');
  } else {
    // While playing, a slow look renders coarser (never in exports or when paused).
    const playing = isPlaying();
    if (!playing) autoScale.reset();
    const k = autoScale.factor;
    const t0 = performance.now();
    renderLook(coarser(p, k), mainTarget(), rt.showMask);
    // Error diffusion is timed in the worker (gpu.ts); the draw itself is cheap then.
    const layer = activeLayer(p);
    const usesWorker = [p, layer?.params].some((lp) => lp && lp.mode === 'dither' && group(lp) === 'diffusion');
    if (playing && !usesWorker && autoScale.sample(performance.now() - t0)) requestRender();
    if (k > 1) info.out.textContent += ' · fast preview';
    if (p.mode === 'ascii') setStatus('');
  }

  const [sw, sh] = renderer.sourceSize;
  const downscaled = src.originalWidth !== sw;
  info.size.textContent = `${src.originalWidth}×${src.originalHeight}${downscaled ? ` → ${sw}×${sh}` : ''}`;
  actions.drawSplit();
  actions.afterDraw();
}
setDrawer(draw);

/**
 * Render `p` to a target: layers, mode, effects and mask. Returns false when an ASCII atlas is
 * still loading (nothing new was drawn).
 */
export function renderLook(p: Params, t: RenderTarget, showMask = false): boolean {
  const r = t.r;
  const layer = activeLayer(p);
  const mask = maskEffect(p, showMask);
  // The mask limits layer 2 only when asked (but "Show mask" always shows it full screen).
  const maskOnLayer = !!layer && layer.layer.maskOnly && !!mask && !showMask;
  r.setEffects([...activeEffects(p), ...(mask && !maskOnLayer ? [mask] : [])], t.seed, !transparentOutput(p));
  const drawMode = (lp: Params, i: number) => (lp.mode === 'ascii' ? drawAscii(lp, i, t) : (drawDither(lp, i, t), true));

  if (!layer) return drawMode(p, 0);
  // Each layer renders into its own texture; then layer 2 is blended over layer 1.
  r.setLayerTarget(0, p.mode === 'ascii');
  const a = drawMode(p, 0);
  r.setLayerTarget(1, layer.params.mode === 'ascii');
  const b = drawMode(layer.params, 1);
  r.setLayerTarget(null);
  r.compositeLayers({
    blend: Math.max(0, LAYER_BLENDS.findIndex((bl) => bl.id === layer.layer.blend)),
    opacity: layer.layer.opacity / 100,
    mask: maskOnLayer ? mask : null,
  });
  return a && b;
}
store.subscribe(requestRender);

/** Show the unprocessed source (Space / Original button) or go back to the effect. */
export function setOriginal(on: boolean): void {
  if (rt.showOriginal === on) return;
  rt.showOriginal = on;
  stage.classList.toggle('original', on);
  requestRender();
}
actions.setOriginal = setOriginal;

// ---------- boil ----------

let boilTimer = 0;

/** Restart the boil timer from the current settings (seed back to 0). */
export function syncBoil(): void {
  clearInterval(boilTimer);
  rt.seed = 0;
  const { animate, boilFps } = store.params;
  if (animate) {
    boilTimer = window.setInterval(() => {
      rt.seed = (rt.seed % 100000) + 1;
      requestRender();
    }, 1000 / boilFps);
  }
  requestRender();
}
/** Stop advancing the boil seed (export drives it frame by frame instead). */
export const stopBoil = () => clearInterval(boilTimer);
store.subscribe((_, changed) => (changed === 'animate' || changed === 'boilFps') && syncBoil());
syncBoil();

// ---------- continuous redraw for LFOs and animation lanes ----------

let lfoFrame = 0;
export function syncLfoLoop(): void {
  cancelAnimationFrame(lfoFrame);
  if (!lfoActive(store.params) && !lanesOf(store.params).length) return;
  const tick = () => {
    if (!rt.exporting) requestRender();
    lfoFrame = requestAnimationFrame(tick);
  };
  lfoFrame = requestAnimationFrame(tick);
}
const LFO_KEYS: (keyof Params)[] = ['mode', 'asciiCharset', 'asciiOffsetLfo', 'asciiDepthLfo', 'animLanes'];
store.subscribe((_, changed) => LFO_KEYS.includes(changed) && syncLfoLoop());

/** Redraw on every decoded video frame (or every animation frame where rVFC is missing). */
const watching = new WeakSet<Source>();

/** Redraw on every new video frame while `src` is the current source (safe to call again). */
export function watchVideo(src: Source & { element: HTMLVideoElement }): void {
  if (watching.has(src)) return;
  watching.add(src);
  const v = src.element;
  // Pausing ends any fast preview: draw once more at full resolution.
  v.addEventListener('pause', requestRender);
  const tick = () => {
    if (rt.current !== src) {
      watching.delete(src);
      return;
    }
    requestRender();
    schedule();
  };
  const schedule = () => {
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
  };
  schedule();
}
