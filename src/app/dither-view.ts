import { blueNoiseTile } from '../pipeline/bluenoise';
import { diffuse, type DiffusionJob } from '../pipeline/diffuse';
import { extractPalette, resolvePalette, rgbToHex, type Palette, type RGB } from '../pipeline/palettes';
import type { Source } from '../source/source';
import type { Params } from '../state';
import { group, rt, store } from './core';
import { diffusers, mainTarget, type RenderTarget } from './gpu';
import { paletteSwatches } from './panel/dither';
import { info, setStatus } from './shell';
import { drawStipple } from './stippling';

const MAX_SWATCHES = 32;

// Median-cut palette for "From image", cached per source + colour count (first frame for videos).
let extracted: { source: Source; count: number; colors: RGB[] } | null = null;

export function currentPalette(p: Params = store.params): Palette {
  const src = rt.current;
  if (p.palette === 'image' && src && (extracted?.source !== src || extracted.count !== p.levels)) {
    extracted = { source: src, count: p.levels, colors: extractPalette(src.paletteElement ?? src.element, src.width, src.height, p.levels) };
  }
  return resolvePalette(p.palette, {
    levels: p.levels,
    ink: p.ink,
    paper: p.paper,
    extracted: p.palette === 'image' ? (extracted?.colors ?? null) : null,
    custom: p.customPalette,
    customRamp: p.customRamp,
  });
}

export function syncSwatches(): void {
  const pal = currentPalette();
  const shown = pal.colors.slice(0, MAX_SWATCHES).map(rgbToHex);
  const more = pal.colors.length - shown.length;
  paletteSwatches.update(shown, more > 0 ? `+${more}` : `${pal.colors.length}`);
}
const PALETTE_KEYS: (keyof Params)[] = ['palette', 'levels', 'ink', 'paper', 'customPalette', 'customRamp'];
store.subscribe((_, changed) => PALETTE_KEYS.includes(changed) && syncSwatches());
syncSwatches();

/**
 * Dither mode: GPU passes for ordered/pattern algorithms, the worker for error diffusion (into
 * `layer`). Thumbnails diffuse synchronously; they are small.
 */
export function drawDither(p: Params, layer = 0, t: RenderTarget = mainTarget()): void {
  const renderer = t.r;
  renderer.renderAdjust(p, false);
  const [ow, oh] = renderer.adjustedSize;
  if (layer === 0 && !t.thumb) info.out.textContent = `OUT ${ow}×${oh}`;

  if (p.algorithm === 'stippling') {
    drawStipple(p, layer, t);
    return;
  }
  if (group(p) === 'diffusion') {
    const pal = currentPalette(p);
    const job: Omit<DiffusionJob, 'id'> = {
      width: ow,
      height: oh,
      data: renderer.readAdjusted(),
      kernel: p.algorithm,
      serpentine: p.serpentine,
      strength: p.diffusion / 100,
      kind: pal.kind,
      colors: new Float32Array(pal.colors.flat()),
      levels: pal.levels,
      perceptual: p.perceptual,
      linearLight: p.linearLight,
      noise: t.seed ? 0.12 * (p.boilAmount / 100) : 0,
      noiseTile: p.boilPattern === 'blue' ? blueNoiseTile() : null,
      wave: p.waveStrength ? [p.waveStrength / 100, p.waveLength, p.waveBias / 100, p.waveFollow / 100] : null,
      shape: {
        sigma: 0.5 + (p.gaussSpread / 100) * 2.5,
        noise: p.gaussNoise / 100,
        crack: p.edgeCrack / 100,
        vertical: p.axisVertical,
        bleed: p.axisBleed / 100,
        smooth: p.axisSmooth / 100,
      },
      seed: t.seed,
    };
    if (t.thumb) {
      renderer.renderResult({ width: ow, height: oh, data: diffuse({ ...job, id: 0 }) }, layer);
      return;
    }
    // Keep the previous frame on screen while the worker runs; only redraw now if a resize would blank it.
    if (!renderer.canvasMatches) renderer.renderResult(undefined, layer);
    diffusers[layer].request(job);
  } else {
    renderer.renderDither(p, currentPalette(p), t.seed);
    if (layer === 0 && !t.thumb) setStatus('');
  }
}
