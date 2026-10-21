import type { AnimationFormat, FrameSequence } from '../export/animation';
import { cmykHalftoneSvg, monoHalftoneSvg, type SvgSize } from '../export/halftone-svg';
import { download, pngBlob } from '../export/png';
import { canvasToSvg } from '../export/svg';
import { baseSpread } from '../pipeline/palettes';
import { loadImageFile } from '../source/image';
import { EXPORT_FORMATS, printLength, type Params } from '../state';
import { writeZip, type ZipEntry } from '../zip';
import { exportAudio } from './audio';
import { actions, activeLayer, lanesOf, lfoActive, requestRender, rt, store, transparentAscii, transparentOutput } from './core';
import { currentAtlas } from './ascii-view';
import { currentPalette, syncSwatches } from './dither-view';
import { diffusers, renderer } from './gpu';
import { batchBtn, exportBtn, exportInfo } from './panel/export';
import { isVideo } from '../source/source';
import { draw, setOriginal, stopBoil, syncBoil, watchVideo } from './render';
import { canvas, flash, transport } from './shell';

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
    const print = p.exportPrint
      ? ` · ${[canvas.width, canvas.height].map((n) => printLength(n * p.exportScale, p.exportDpi, p.exportUnit).toFixed(1)).join(' × ')} ${p.exportUnit} at ${p.exportDpi} dpi`
      : '';
    const dots = vectorDots(p) ? ' · vector dots' : '';
    exportInfo.textContent = `→ ${size}${print}${dots}`;
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
  'exportPrint',
  'exportDpi',
  'exportUnit',
  'exportVectorDots',
  'mode',
  'algorithm',
  'animate',
  'asciiTransparent',
  'asciiOffsetLfo',
  'asciiDepthLfo',
];
store.subscribe((_, changed) => EXPORT_KEYS.includes(changed) && syncExportInfo());
transport.onTrimChange = syncExportInfo;
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
    const { start, end } = videoRange(src.element as HTMLVideoElement);
    seconds = transport.trimmed() ? end - start : Math.min(seconds, end - start);
  }
  return { count: Math.max(1, Math.round(seconds * fps)), fps };
}

/** Where a video export starts and the latest it can end: the trim, or from the playhead to the end. */
function videoRange(v: HTMLVideoElement): { start: number; end: number } {
  if (transport.trimmed()) return transport.range();
  return { start: v.currentTime >= v.duration - 0.05 ? 0 : v.currentTime, end: v.duration };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Draw synchronously and wait until the canvas really shows the result (atlas built, worker done). */
async function renderNow(): Promise<void> {
  // Both layers' atlases must be ready (layer 2 only when it is on and in ASCII mode).
  const atlasesPending = () => {
    const layer = activeLayer(store.params);
    return (
      (store.params.mode === 'ascii' && !currentAtlas(store.params)) ||
      (!!layer && layer.params.mode === 'ascii' && !currentAtlas(layer.params, 1))
    );
  };
  for (let tries = 0; atlasesPending() && tries < 100; tries++) await sleep(20);
  draw();
  await Promise.all(diffusers.map((d) => d.idle()));
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
    const { start } = videoRange(v);
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

/** SVG of Halftone dot / CMYK as vector circles (one ink colour for Halftone dot, so a 2-colour palette). */
function vectorDots(p: Params): boolean {
  if (p.exportFormat !== 'svg' || p.mode !== 'dither' || !p.exportVectorDots) return false;
  return p.algorithm === 'halftone-cmyk' || (p.algorithm === 'halftone' && currentPalette(p).colors.length === 2);
}

/** Physical SVG width / height when Print size is on. */
function svgSize(p: Params, w: number, h: number): SvgSize | undefined {
  if (!p.exportPrint) return undefined;
  const len = (n: number) =>
    p.exportUnit === 'cm'
      ? `${+(printLength(n * p.exportScale, p.exportDpi, 'cm') * 10).toFixed(2)}mm`
      : `${+printLength(n * p.exportScale, p.exportDpi, 'in').toFixed(4)}in`;
  return { width: len(w), height: len(h) };
}

/** The current frame as an SVG string, or a reason it can't be one. */
function svgOf(p: Params): string {
  if (p.mode !== 'dither') return 'SVG export is for dither mode';
  const size = svgSize(p, canvas.width, canvas.height);
  if (vectorDots(p)) {
    const [width, height] = renderer.adjustedSize;
    const px = { data: renderer.readAdjusted(), width, height };
    const rgb = (c: number[]) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
    if (p.algorithm === 'halftone-cmyk') {
      return cmykHalftoneSvg(px, {
        cell: p.cellSize,
        angles: [p.cmykAngleC, p.cmykAngleM, p.cmykAngleY, p.cmykAngleK],
        dotGain: p.cmykDotGain / 100,
        gcr: p.cmykGcr / 100,
        scale: p.exportScale,
        size,
      });
    }
    // Dark tones take the palette's first colour (a ramp runs ink → paper); a 2-colour set, the darker one.
    const pal = currentPalette(p);
    const [ink, paper] =
      pal.kind === 'ramp' ? pal.colors : [...pal.colors].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    return monoHalftoneSvg(px, {
      cell: p.cellSize,
      angle: p.angle,
      spread: (p.strength / 100) * baseSpread(pal),
      ink: rgb(ink),
      paper: rgb(paper),
      scale: p.exportScale,
      size,
    });
  }
  return canvasToSvg(canvas, p.exportScale, size) ?? 'Too many colours for SVG — use a palette with ≤ 32 colours';
}
const isSvg = (s: string) => s.startsWith('<svg');

/** The current frame as a still file (PNG, or SVG when that is the format). */
async function stillBlob(p: Params): Promise<Blob | string> {
  if (p.exportFormat === 'svg') {
    const svg = svgOf(p);
    return isSvg(svg) ? new Blob([svg], { type: 'image/svg+xml' }) : svg;
  }
  return pngBlob(canvas, p.exportScale, p.exportPrint ? p.exportDpi : undefined);
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

  if (p.exportFormat === 'png' || p.exportFormat === 'svg') {
    await renderNow();
    const blob = await stillBlob(p);
    if (typeof blob === 'string') return flash(blob);
    download(blob, `${name}.${p.exportFormat}`);
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
      // An audio file driving audio lanes becomes the soundtrack.
      audio: p.exportFormat === 'gif' ? null : exportAudio(frames.count / frames.fps),
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

/** Batch: render each image with the current look and save them all in one .zip (Export cancels). */
actions.batchExport = async (files) => {
  if (rt.exporting) return;
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return flash('Choose image files for a batch');
  const p = store.params;
  const ext = p.exportFormat === 'svg' ? 'svg' : 'png';
  if (ext === 'svg' && p.mode !== 'dither') return flash('SVG export is for dither mode');

  const job = { cancelled: false };
  rt.exporting = job;
  setOriginal(false);
  stopBoil();
  const previous = rt.current;
  const entries: ZipEntry[] = [];
  const failed: string[] = [];
  batchBtn.disabled = true;
  try {
    for (const [i, file] of images.entries()) {
      if (job.cancelled) break;
      exportBtn.textContent = `Cancel · ${i + 1}/${images.length}`;
      let src;
      try {
        src = await loadImageFile(file, Math.min(renderer.maxTextureSize, 4096));
      } catch {
        failed.push(file.name);
        continue;
      }
      // Render it in place of the current source (which stays loaded and comes back afterwards).
      rt.current = src;
      renderer.setSource(src.element, src.width, src.height);
      if (p.palette === 'image') syncSwatches();
      await renderNow();
      const blob = await stillBlob(store.params);
      src.dispose();
      if (typeof blob === 'string') {
        flash(blob);
        break;
      }
      entries.push({ name: `${src.name}-${p.mode}.${ext}`, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (entries.length && !job.cancelled) {
      download(new Blob([writeZip(entries).slice()], { type: 'application/zip' }), `batch-${p.mode}.zip`);
      const skipped = failed.length ? ` · couldn’t read ${failed.join(', ')}` : '';
      flash(`Saved ${entries.length} image${entries.length === 1 ? '' : 's'} in a .zip${skipped}`);
    } else if (job.cancelled) {
      flash('Batch cancelled');
    }
  } finally {
    rt.current = previous;
    if (previous) {
      renderer.setSource(previous.element, previous.width, previous.height);
      if (isVideo(previous)) watchVideo(previous); // its frame loop stops while it isn't current
    }
    if (p.palette === 'image') syncSwatches();
    rt.exporting = null;
    batchBtn.disabled = false;
    syncBoil();
    syncExportInfo();
    requestRender();
  }
};
