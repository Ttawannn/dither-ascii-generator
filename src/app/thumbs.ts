import { Renderer } from '../pipeline/gl';
import type { Source } from '../source/source';
import type { Params } from '../state';
import { actions, rt, store } from './core';
import { presetThumbs } from './panel/presets';
import { renderLook } from './render';

/**
 * Preset thumbnails: the current picture rendered small with each look. They use their own WebGL
 * renderer on an offscreen canvas, so the main preview's textures and worker results are never
 * touched, and they are drawn one at a time when the browser is idle.
 */

/** Long side of a thumbnail in output pixels. */
const SIZE = 128;
/** Attempts per thumbnail while its glyph atlas loads. */
const MAX_TRIES = 30;

const glCanvas = document.createElement('canvas');
let renderer: Renderer | null | undefined;
function thumbRenderer(): Renderer | null {
  if (renderer === undefined) {
    try {
      renderer = new Renderer(glCanvas);
    } catch {
      renderer = null; // no second WebGL context: buttons stay text-only
    }
  }
  return renderer;
}

/** Bumped whenever the picture changes, which makes every thumbnail stale. */
let generation = 0;
const drawnFor = new WeakMap<HTMLCanvasElement, number>();
const tries = new WeakMap<HTMLCanvasElement, number>();
// Downscaled copies of the source, by long side (one per pixel size in use).
let scaled = new Map<number, ImageBitmap>();
let scaledFrom: Source | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Resolves when the browser is idle, with the time (ms) that may be used. */
const idle = () =>
  new Promise<number>((r) =>
    'requestIdleCallback' in window
      ? requestIdleCallback((d) => r(Math.max(8, d.timeRemaining())), { timeout: 300 })
      : setTimeout(() => r(8), 30),
  );

async function scaledSource(src: Source, long: number): Promise<ImageBitmap | null> {
  if (scaledFrom !== src) {
    scaled.forEach((b) => b.close());
    scaled = new Map();
    scaledFrom = src;
  }
  const key = Math.min(long, Math.max(src.width, src.height));
  const hit = scaled.get(key);
  if (hit) return hit;
  if (src.element instanceof HTMLVideoElement && src.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const k = key / Math.max(src.width, src.height);
  const bitmap = await createImageBitmap(src.element, {
    resizeWidth: Math.max(1, Math.round(src.width * k)),
    resizeHeight: Math.max(1, Math.round(src.height * k)),
    resizeQuality: 'high',
  });
  scaled.set(key, bitmap);
  return bitmap;
}

/** Render one look into its thumbnail canvas; false when it has to wait (atlas or video frame). */
async function drawThumb(params: Partial<Params>, out: HTMLCanvasElement, src: Source): Promise<boolean> {
  const r = thumbRenderer();
  if (!r || r.contextLost) return true; // nothing to wait for
  const p = { ...store.params, ...params } as Params;
  // Dither looks keep their pixel size: the source is scaled so the output is about SIZE wide.
  const bitmap = await scaledSource(src, p.mode === 'ascii' ? SIZE * 3 : SIZE * p.pixelSize);
  if (!bitmap) return false;
  r.setSource(bitmap, bitmap.width, bitmap.height);
  if (!renderLook(p, { r, thumb: true, seed: 0 })) return false;
  // Copy while the drawing buffer still holds the frame (same task).
  out.width = glCanvas.width;
  out.height = glCanvas.height;
  const g = out.getContext('2d')!;
  g.clearRect(0, 0, out.width, out.height);
  g.drawImage(glCanvas, 0, 0);
  out.classList.toggle('smooth', p.mode === 'ascii');
  out.hidden = false;
  return true;
}

let running = false;
async function run(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const src = rt.current;
      if (!src) break;
      if (rt.exporting) {
        await sleep(500);
        continue;
      }
      const todo = presetThumbs().filter(
        (t) => t.canvas.isConnected && drawnFor.get(t.canvas) !== generation && (tries.get(t.canvas) ?? 0) < MAX_TRIES,
      );
      if (!todo.length) break;
      // As many as fit in the idle time (each is a few ms); waiting ones are retried a little later.
      const budget = await idle();
      const start = performance.now();
      const gen = generation;
      let waiting = 0;
      for (const job of todo) {
        if (performance.now() - start > budget) break;
        const ok = await drawThumb(job.params, job.canvas, src);
        if (gen !== generation || rt.current !== src) break;
        if (ok) drawnFor.set(job.canvas, gen);
        else {
          tries.set(job.canvas, (tries.get(job.canvas) ?? 0) + 1);
          waiting++;
        }
      }
      if (waiting === todo.length) await sleep(200);
    }
  } finally {
    running = false;
  }
}

/** New picture: every thumbnail is redrawn. Preset list changed: only the new ones are drawn. */
actions.refreshThumbs = (pictureChanged: boolean) => {
  if (pictureChanged) {
    generation++;
    for (const t of presetThumbs()) tries.delete(t.canvas);
  }
  void run();
};
