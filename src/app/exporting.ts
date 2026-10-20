import type { AnimationFormat, FrameSequence } from '../export/animation';
import { download, exportPng } from '../export/png';
import { canvasToSvg } from '../export/svg';
import { EXPORT_FORMATS, type Params } from '../state';
import { actions, lanesOf, lfoActive, requestRender, rt, store, transparentAscii, transparentOutput } from './core';
import { currentAtlas } from './ascii-view';
import { diffuser } from './gpu';
import { exportBtn, exportInfo } from './panel/export';
import { draw, setOriginal, stopBoil, syncBoil } from './render';
import { canvas, flash } from './shell';

/** Update the export button label and the size / frame-count summary. */
function syncExportInfo(): void {
  const p = store.params;
  const format = EXPORT_FORMATS.find((f) => f.id === p.exportFormat)!;
  exportBtn.textContent = rt.exporting ? exportBtn.textContent : `Export ${p.exportFormat.toUpperCase()}`;
  if (!rt.current) {
    exportInfo.textContent = '';
    return;
  }
  const size = `${canvas.width * p.exportScale}×${canvas.height * p.exportScale}`;
  if (!format.animated) {
    exportInfo.textContent = `→ ${size}`;
    return;
  }
  const plan = animationLength();
  const alphaNote =
    transparentOutput(p) && p.exportFormat === 'mp4'
      ? ' · MP4 can’t keep transparency: the background colour is used'
      : '';
  exportInfo.textContent =
    typeof plan === 'string'
      ? plan
      : `→ ${size} · ${plan.count} frames · ${(plan.count / plan.fps).toFixed(1)} s${alphaNote}`;
}
const EXPORT_KEYS: (keyof Params)[] = [
  'animLanes',
  'animDuration',
  'exportFormat',
  'exportScale',
  'exportDuration',
  'exportFps',
  'animate',
  'asciiTransparent',
  'asciiOffsetLfo',
  'asciiDepthLfo',
];
store.subscribe((_, changed) => EXPORT_KEYS.includes(changed) && syncExportInfo());
actions.afterDraw = syncExportInfo;
syncExportInfo();

/** Frame count for an animated export, or a reason it is not possible. */
function animationLength(): { count: number; fps: number } | string {
  const p = store.params;
  const src = rt.current;
  const fps = p.exportFps;
  if (!src) return 'Load a source first';
  if (src.kind === 'image' && !p.animate && !lfoActive(p) && !lanesOf(p).length) {
    return 'Static image — animate a setting, turn on Boil, or load a video';
  }
  let seconds = p.exportDuration;
  if (src.kind === 'video') {
    const v = src.element as HTMLVideoElement;
    const start = v.currentTime >= v.duration - 0.05 ? 0 : v.currentTime;
    seconds = Math.min(seconds, v.duration - start);
  }
  return { count: Math.max(1, Math.round(seconds * fps)), fps };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Draw synchronously and wait until the canvas really shows the result (atlas built, worker done). */
async function renderNow(): Promise<void> {
  for (let tries = 0; store.params.mode === 'ascii' && !currentAtlas(store.params) && tries < 100; tries++) {
    await sleep(20);
  }
  draw();
  await diffuser.idle();
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(v.currentTime - t) < 1e-4) return Promise.resolve();
  return new Promise((resolve) => {
    v.addEventListener('seeked', () => resolve(), { once: true });
    v.currentTime = t;
  });
}

/** How to render frame i: seek video files, wait for the webcam, or step the clock for stills. */
function frameSequence(): FrameSequence | string {
  const plan = animationLength();
  if (typeof plan === 'string') return plan;
  const src = rt.current!;
  const { fps, count } = plan;
  const { animate, boilFps } = store.params;
  // Boil keeps its own pace regardless of the export frame rate.
  const boilSeed = (i: number) => (animate ? Math.floor((i * boilFps) / fps) + 1 : 0);
  const at = (i: number) => {
    rt.seed = boilSeed(i);
    rt.clockOverride = i / fps;
  };

  if (src.kind === 'video') {
    const v = src.element as HTMLVideoElement;
    const start = v.currentTime >= v.duration - 0.05 ? 0 : v.currentTime;
    return {
      count,
      fps,
      render: async (i) => {
        await seek(v, start + i / fps);
        at(i);
        await renderNow();
      },
    };
  }
  if (src.kind === 'webcam') {
    const t0 = performance.now();
    return {
      count,
      fps,
      render: async (i) => {
        const wait = t0 + (i * 1000) / fps - performance.now();
        if (wait > 0) await sleep(wait);
        at(i);
        await renderNow();
      },
    };
  }
  return {
    count,
    fps,
    render: async (i) => {
      at(i);
      await renderNow();
    },
  };
}

/** The Export button: saves a still, or renders an animation (clicking again cancels). */
actions.exportClick = async () => {
  if (rt.exporting) {
    rt.exporting.cancelled = true;
    return;
  }
  const src = rt.current;
  if (!src) return;
  const p = store.params;
  const name = `${src.name}-${p.mode}`;
  setOriginal(false);

  if (p.exportFormat === 'png') {
    await renderNow();
    await exportPng(canvas, p.exportScale, `${name}.png`);
    return;
  }
  if (p.exportFormat === 'svg') {
    if (p.mode !== 'dither') return flash('SVG export is for dither mode');
    await renderNow();
    const svg = canvasToSvg(canvas, p.exportScale);
    if (!svg) return flash('Too many colours for SVG — use a palette with ≤ 32 colours');
    download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
    return;
  }

  const frames = frameSequence();
  if (typeof frames === 'string') return flash(frames);

  const job = { cancelled: false };
  rt.exporting = job;
  // Video files are stepped frame by frame; the webcam keeps streaming in real time.
  const video = src.kind === 'video' ? (src.element as HTMLVideoElement) : null;
  const wasPlaying = video ? !video.paused : false;
  const resumeAt = video?.currentTime ?? 0;
  video?.pause();
  stopBoil(); // export drives the seed itself
  exportBtn.textContent = 'Cancel';
  // Encoders are loaded on first use to keep the initial page light.
  const { exportAnimation, ExportCancelled } = await import('../export/animation');
  try {
    const blob = await exportAnimation({
      format: p.exportFormat as AnimationFormat,
      source: canvas,
      scale: p.exportScale,
      frames,
      onProgress: (done, total) => (exportBtn.textContent = `Cancel · ${done}/${total}`),
      isCancelled: () => job.cancelled,
      transparent: transparentOutput(p),
      // Transparent ASCII backgrounds fill with the background colour, masked-out areas with the mask colour.
      matte: p.mode === 'ascii' && transparentAscii(p) ? p.asciiBg : p.maskColor,
      onNote: flash,
    });
    download(blob, `${name}.${p.exportFormat}`);
    flash(`Saved ${(blob.size / 1e6).toFixed(1)} MB`);
  } catch (err) {
    if (err instanceof ExportCancelled) flash('Export cancelled');
    else {
      console.error(err);
      flash((err as Error).message || 'Export failed');
    }
  } finally {
    rt.exporting = null;
    rt.clockOverride = null;
    syncBoil();
    if (video) video.currentTime = resumeAt;
    if (wasPlaying) void video!.play().catch(() => undefined);
    syncExportInfo();
    requestRender();
  }
};
