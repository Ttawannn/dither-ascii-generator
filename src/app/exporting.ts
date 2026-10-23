import { stippleSvg } from '../export/stipple-svg';
import { lumaShapesSvg } from '../export/luma-shapes-svg';
import { decodeBandImage, parseShapeBands, BAND_IMAGE_SIZE } from '../pipeline/shape-bands';
import { hexToRgb } from '../pipeline/palettes';
import { currentStipple, generateStipple } from './stippling';
import type { AnimationFormat, FrameSequence } from '../export/animation';
import { cmykHalftoneSvg, cmykSeparations, monoHalftoneSvg, type CmykOptions, type SvgSize } from '../export/halftone-svg';
import { exportFileName } from '../export/file-name';
import { polygonSvg, type PolygonKind } from '../export/polygon-svg';
import { getAlgorithm } from '../pipeline/algorithms';
import { download, imageBlob } from '../export/png';
import { canvasToSvg } from '../export/svg';
import { activeEffects } from '../pipeline/effects';
import { baseSpread } from '../pipeline/palettes';
import { loadImageFile } from '../source/image';
import { EXPORT_FORMATS, isAnimatedFormat, printLength, type Params } from '../state';
import { writeZip, type ZipEntry } from '../zip';
import { exportAudio } from './audio';
import {
  actions,
  activeLayer,
  animatedParams,
  autoScale,
  lanesOf,
  lfoActive,
  requestRender,
  rt,
  store,
  transparentAscii,
  transparentOutput,
} from './core';
import { currentAtlas, shapeMatchers } from './ascii-view';
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
    const dots = separationsOn(p) ? ' · 4 plates in a .zip' : vectorDots(p) ? ' · vector dots' : '';
    const note =
      p.exportFormat === 'jpg' && transparentOutput(p)
        ? ' · JPEG can’t keep transparency: the background colour is used'
        : p.exportFormat === 'webp' && p.exportPrint
          ? ' · WebP files don’t store a print resolution'
          : '';
    exportInfo.textContent = `→ ${size}${print}${dots}${note}`;
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
  'exportSeparations',
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
  if ([p, activeLayer(p)?.params].some((lp) => lp?.mode === 'dither' && lp.algorithm === 'stippling'))
    return 'Stippling needs a still image';
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

/** Draw synchronously at full resolution (never the fast playback preview). */
actions.renderFull = () => {
  autoScale.reset();
  draw();
};

/** Draw synchronously and wait until the canvas really shows the result (atlas built, worker done). */
let pendingFullRender: Promise<void> | null = null;
function renderNow(): Promise<void> {
  if (pendingFullRender) return pendingFullRender;
  rt.renderingFull = true;
  pendingFullRender = renderCompleteFrame().finally(() => {
    rt.renderingFull = false;
    pendingFullRender = null;
    if (!rt.exporting) requestRender();
  });
  return pendingFullRender;
}

async function renderCompleteFrame(): Promise<void> {
  for (const p of [store.params, activeLayer(store.params)?.params])
    if (p?.mode === 'dither' && p.algorithm === 'stippling') await generateStipple(p);
  // Both layers' atlases must be ready (layer 2 only when it is on and in ASCII mode).
  const atlasesPending = () => {
    const layer = activeLayer(store.params);
    return (
      (store.params.mode === 'ascii' && !currentAtlas(store.params)) ||
      (!!layer && layer.params.mode === 'ascii' && !currentAtlas(layer.params, 1))
    );
  };
  for (let tries = 0; atlasesPending() && tries < 100; tries++) await sleep(20);
  actions.renderFull();
  await Promise.all(diffusers.map((d) => d.idle()));
  await Promise.all(shapeMatchers.map((d) => d.idle()));
}
actions.renderReady = renderNow;

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
  const boilSeed = (i: number) => (animate && store.params.temporalPattern === 'off' ? Math.floor((i * boilFps) / fps) + 1 : 0);
  const at = (i: number, start = 0) => {
    rt.seed = boilSeed(i);
    rt.clockOverride = start + i / fps;
  };

  if (src.kind === 'video') {
    const v = src.element as HTMLVideoElement;
    const { start } = videoRange(v);
    return {
      count,
      fps,
      render: async (i) => {
        await seek(v, start + i / fps);
        at(i, start);
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
  if (
    p.exportFormat !== 'svg' ||
    p.mode !== 'dither' ||
    !p.exportVectorDots ||
    activeLayer(p) ||
    activeEffects(p).length ||
    p.maskMode !== 'off'
  )
    return false;
  if (p.animate || p.patternFollow > 0) return false;
  return p.algorithm === 'halftone-cmyk' || (p.algorithm === 'halftone' && currentPalette(p).colors.length === 2);
}

/** Halftone CMYK saved as four plates in a .zip. */
const separationsOn = (p: Params) => vectorDots(p) && p.algorithm === 'halftone-cmyk' && p.exportSeparations;

/** The four ink plates as SVG files, plus the combined image as PNG. */
async function separationFiles(p: Params): Promise<ZipEntry[]> {
  const [width, height] = renderer.adjustedSize;
  const plates = cmykSeparations(
    { data: renderer.readAdjusted(), width, height },
    { ...cmykOptions(p), size: svgSize(p, width, height), marks: p.exportMarks },
  );
  const text = new TextEncoder();
  const composite = await imageBlob(canvas, p.exportScale, { dpi: p.exportPrint ? p.exportDpi : undefined });
  return [
    ...plates.map((plate) => ({ name: `${plate.name}.svg`, data: text.encode(plate.svg) })),
    { name: 'composite.png', data: new Uint8Array(await composite.arrayBuffer()) },
  ];
}

const cmykOptions = (p: Params): CmykOptions => ({
  cell: p.cellSize,
  shape: p.halftoneShape,
  angles: [p.cmykAngleC, p.cmykAngleM, p.cmykAngleY, p.cmykAngleK],
  dotGain: p.cmykDotGain / 100,
  gcr: p.cmykGcr / 100,
  scale: p.exportScale,
});

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
  if (p.algorithm === 'luma-shapes') {
    if (activeLayer(p) || activeEffects(p).length || p.maskMode !== 'off')
      return 'Vector shapes need a single layer without effects or a mask — use PNG for the complete image';
    const images = new Map<number, string>();
    (parseShapeBands(p.shapeBands) ?? []).forEach((band, i) => {
      if (!band.image) return;
      const bytes = new Uint8ClampedArray(decodeBandImage(band.image));
      const tint = hexToRgb(band.color);
      for (let j = 0; j < bytes.length; j += 4) for (let c = 0; c < 3; c++) bytes[j + c] = Math.round(bytes[j + c] * tint[c]);
      const tile = document.createElement('canvas'); tile.width = tile.height = BAND_IMAGE_SIZE;
      tile.getContext('2d')!.putImageData(new ImageData(bytes, BAND_IMAGE_SIZE, BAND_IMAGE_SIZE), 0, 0);
      images.set(i, tile.toDataURL('image/png'));
    });
    const [w, h] = renderer.adjustedSize;
    try { return lumaShapesSvg(renderer.readAdjusted(), w, h, p, images, size, rt.seed); }
    catch (error) { return (error as Error).message; }
  }
  if (getAlgorithm(p.algorithm).group === 'polygon' && !activeLayer(p) && !activeEffects(p).length && p.maskMode === 'off') {
    const [width, height] = renderer.adjustedSize;
    return polygonSvg({ data: renderer.readAdjusted(), width, height }, {
      kind: p.algorithm as PolygonKind,
      cell: p.cellSize,
      angle: p.angle,
      border: p.polyBorder / 100,
      borderColor: p.polyBorderColor,
      jitter: p.polyJitter / 100,
      offset: [(rt.seed * 29) % 64, (rt.seed * 47) % 64],
      palette: currentPalette(p),
      perceptual: p.perceptual,
      scale: p.exportScale,
      size,
    });
  }
  if (p.algorithm === 'stippling' && !activeLayer(p) && !p.fxSort && !activeEffects(p).length && p.maskMode === 'off') {
    const cached = currentStipple(p);
    if (cached) return stippleSvg(cached.result, p.ink, p.paper, p.exportScale, size);
  }
  if (vectorDots(p)) {
    const [width, height] = renderer.adjustedSize;
    const px = { data: renderer.readAdjusted(), width, height };
    const rgb = (c: number[]) =>
      `#${c
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
    if (p.algorithm === 'halftone-cmyk') return cmykHalftoneSvg(px, { ...cmykOptions(p), size });
    // Dark tones take the palette's first colour (a ramp runs ink → paper); a 2-colour set, the darker one.
    const pal = currentPalette(p);
    const [ink, paper] =
      pal.kind === 'ramp' ? pal.colors : [...pal.colors].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    return monoHalftoneSvg(px, {
      cell: p.cellSize,
      angle: p.angle,
      shape: p.halftoneShape,
      linearLight: p.linearLight,
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

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Background for formats without transparency: the ASCII background, or the mask colour outside a mask. */
const matteOf = (p: Params) => (p.mode === 'ascii' && transparentAscii(p) ? p.asciiBg : p.maskColor);

/** The current frame as a still file in the chosen format (PNG, SVG, JPEG or WebP). */
async function stillBlob(p: Params): Promise<Blob | string> {
  if (p.exportFormat === 'svg') {
    const svg = svgOf(animatedParams(p));
    return isSvg(svg) ? new Blob([svg], { type: 'image/svg+xml' }) : svg;
  }
  const type = IMAGE_TYPES[p.exportFormat];
  try {
    return await imageBlob(canvas, p.exportScale, {
      type,
      quality: p.exportQuality / 100,
      dpi: p.exportPrint ? p.exportDpi : undefined,
      matte: type === 'image/jpeg' && transparentOutput(p) ? matteOf(p) : undefined,
    });
  } catch (error) {
    return (error as Error).message;
  }
}

/** File name for an export of `src` with the current template. */
const fileName = (p: Params, name: string, ext: string) =>
  exportFileName(p.exportName, { name, mode: p.mode, algo: p.mode === 'ascii' ? p.asciiCharset : p.algorithm, date: new Date() }, ext);

/** The Export button: saves a still, or renders an animation (clicking again cancels). */
actions.exportClick = async () => {
  if (rt.exporting) {
    rt.exporting.cancelled = true;
    return;
  }
  const src = rt.current;
  if (!src) return;
  const p = store.params;
  const name = fileName(p, src.name, p.exportFormat);
  setOriginal(false);

  if (!isAnimatedFormat(p.exportFormat)) {
    try {
      await renderNow();
    } catch (error) {
      flash((error as Error).message);
      return;
    }
    if (separationsOn(p)) {
      const zip = writeZip(await separationFiles(animatedParams(p)));
      download(new Blob([zip.slice()], { type: 'application/zip' }), fileName(p, src.name, 'zip'));
      return flash('Saved 4 plates and the combined image in a .zip');
    }
    const blob = await stillBlob(p);
    if (typeof blob === 'string') return flash(blob);
    download(blob, name);
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
      matte: matteOf(p),
      onNote: flash,
      // An audio file driving audio lanes becomes the soundtrack.
      audio: p.exportFormat === 'gif' ? null : exportAudio(frames.count / frames.fps, video ? videoRange(video).start : 0),
    });
    download(blob, name);
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
  const ext = isAnimatedFormat(p.exportFormat) ? 'png' : p.exportFormat;
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
      const blob = await stillBlob({ ...store.params, exportFormat: ext });
      src.dispose();
      if (typeof blob === 'string') {
        flash(blob);
        break;
      }
      entries.push({ name: fileName(p, src.name, ext), data: new Uint8Array(await blob.arrayBuffer()) });
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
