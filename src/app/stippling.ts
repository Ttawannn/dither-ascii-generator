import { ADJUST_KEYS, type Params } from '../state';
import type { Source } from '../source/source';
import type { StippleJob, StippleResult } from '../pipeline/stipple';
import { actions, requestRender, rt, stippleProgress } from './core';
import { renderer, type RenderTarget } from './gpu';
import { flash } from './shell';

interface Cached {
  key: string;
  result: StippleResult;
  data: Uint8Array;
}
const cache = new WeakMap<Source, Cached[]>();
let running: { worker: Worker; reject: (error: Error) => void } | null = null;
const notify = (busy: boolean, progress: number) => {
  stippleProgress.busy = busy;
  stippleProgress.value = progress;
  stippleProgress.listeners.forEach((f) => f(busy, progress));
};
const keyOf = (p: Params) =>
  JSON.stringify(
    [...ADJUST_KEYS, 'mirror', 'stippleCount', 'stippleIterations', 'stippleSize', 'stippleSeed', 'ink', 'paper'].map(
      (k) => p[k as keyof Params],
    ),
  );
export function currentStipple(p: Params): Cached | undefined {
  return rt.current ? cache.get(rt.current)?.find((c) => c.key === keyOf(p)) : undefined;
}

/** Explicit generation, shared by the panel and still/batch export. Changing settings leaves a stale result out. */
export async function generateStipple(p: Params): Promise<void> {
  const src = rt.current;
  if (!src || src.kind !== 'image') throw new Error('Stippling needs a still image');
  if (currentStipple(p)) return;
  running?.worker.terminate();
  running?.reject(new Error('Stippling cancelled'));
  renderer.renderAdjust(p, false);
  const [width, height] = renderer.adjustedSize;
  const data = renderer.readAdjusted();
  const key = keyOf(p);
  const worker = new Worker(new URL('../pipeline/stipple.worker.ts', import.meta.url), { type: 'module' });
  notify(true, 0);
  try {
    const result = await new Promise<StippleResult>((resolve, reject) => {
      running = { worker, reject };
      worker.onmessage = (e: MessageEvent<{ progress?: number; result?: StippleResult; error?: string }>) => {
        if (e.data.progress !== undefined) notify(true, e.data.progress);
        if (e.data.result) resolve(e.data.result);
        if (e.data.error) reject(new Error(e.data.error));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Stippling failed'));
      const job: StippleJob = {
        width,
        height,
        data,
        count: p.stippleCount,
        iterations: p.stippleIterations,
        size: p.stippleSize,
        seed: p.stippleSeed,
      };
      worker.postMessage(job, [data.buffer]);
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = p.paper;
    g.fillRect(0, 0, width, height);
    g.fillStyle = p.ink;
    for (let i = 0; i < result.points.length; i += 3) {
      g.beginPath();
      g.arc(result.points[i], result.points[i + 1], result.points[i + 2], 0, Math.PI * 2);
      g.fill();
    }
    const px = g.getImageData(0, 0, width, height).data,
      out = new Uint8Array(px.length);
    for (let y = 0; y < height; y++)
      out.set(px.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
    const entries = cache.get(src) ?? [];
    entries.push({ key, result, data: out });
    while (entries.length > 4) entries.shift();
    cache.set(src, entries);
  } finally {
    worker.terminate();
    if (running?.worker === worker) {
      running = null;
      notify(false, 0);
    }
    requestRender();
  }
}

export function drawStipple(p: Params, layer: number, t: RenderTarget): void {
  const hit = currentStipple(p);
  // Keep the input visible until Generate is pressed. Thumbnail previews follow the same rule.
  if (hit) t.r.renderResult({ width: hit.result.width, height: hit.result.height, data: hit.data }, layer);
  else t.r.renderAdjusted();
}
actions.generateStipple = async (p) => {
  try {
    await generateStipple(p);
  } catch (error) {
    flash((error as Error).message);
  }
};
actions.cancelStipple = () => {
  running?.worker.terminate();
  running?.reject(new Error('Stippling cancelled'));
};
