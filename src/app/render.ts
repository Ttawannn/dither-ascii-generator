import { activeEffects } from '../pipeline/effects';
import { isVideo, type Source } from '../source/source';
import type { Params } from '../state';
import { actions, animatedParams, lanesOf, lfoActive, requestRender, rt, setDrawer, store, transparentAscii } from './core';
import { drawAscii } from './ascii-view';
import { drawDither } from './dither-view';
import { renderer } from './gpu';
import { info, setStatus, stage } from './shell';

/** Draw the current source with the current (animated) settings. Synchronous. */
export function draw(): void {
  const src = rt.current;
  if (!renderer.hasSource || !src || renderer.contextLost) return;
  const p = animatedParams(store.params);
  if (isVideo(src) && src.element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    renderer.setSource(src.element, src.width, src.height);
  }
  // The original view is shown untouched; otherwise every output pass runs the effect chain.
  renderer.setEffects(rt.showOriginal ? [] : activeEffects(p), rt.seed, !(p.mode === 'ascii' && transparentAscii(p)));
  stage.classList.toggle('ascii', p.mode === 'ascii' && !rt.showOriginal);
  stage.classList.toggle('transparent', p.mode === 'ascii' && !rt.showOriginal && transparentAscii(p));

  if (rt.showOriginal) {
    renderer.renderAdjust(p, true);
    renderer.renderAdjusted();
    setStatus('');
  } else if (p.mode === 'ascii') {
    drawAscii(p);
    setStatus('');
  } else {
    drawDither(p);
  }

  const [sw, sh] = renderer.sourceSize;
  const downscaled = src.originalWidth !== sw;
  info.size.textContent = `${src.originalWidth}×${src.originalHeight}${downscaled ? ` → ${sw}×${sh}` : ''}`;
  actions.afterDraw();
}
setDrawer(draw);
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
export function watchVideo(src: Source & { element: HTMLVideoElement }): void {
  const v = src.element;
  const tick = () => {
    if (rt.current !== src) return;
    requestRender();
    schedule();
  };
  const schedule = () => {
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
  };
  schedule();
}
