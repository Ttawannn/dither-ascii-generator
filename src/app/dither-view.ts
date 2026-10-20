import { blueNoiseTile } from '../pipeline/bluenoise';
import { extractPalette, resolvePalette, rgbToHex, type Palette, type RGB } from '../pipeline/palettes';
import type { Source } from '../source/source';
import type { Params } from '../state';
import { group, rt, store } from './core';
import { diffuser, renderer } from './gpu';
import { paletteSwatches } from './panel/dither';
import { info, setStatus } from './shell';

const MAX_SWATCHES = 32;

// Median-cut palette for "From image", cached per source + colour count (first frame for videos).
let extracted: { source: Source; count: number; colors: RGB[] } | null = null;

export function currentPalette(p: Params = store.params): Palette {
  const src = rt.current;
  if (p.palette === 'image' && src && (extracted?.source !== src || extracted.count !== p.levels)) {
    extracted = { source: src, count: p.levels, colors: extractPalette(src.element, src.width, src.height, p.levels) };
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

/** Dither mode: GPU passes for ordered/pattern algorithms, the worker for error diffusion. */
export function drawDither(p: Params): void {
  renderer.renderAdjust(p, false);
  const [ow, oh] = renderer.adjustedSize;
  info.out.textContent = `OUT ${ow}×${oh}`;

  if (group(p) === 'diffusion') {
    // Keep the previous frame on screen while the worker runs; only redraw now if a resize would blank it.
    if (!renderer.canvasMatches) renderer.renderResult();
    const pal = currentPalette(p);
    diffuser.request({
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
      noise: rt.seed ? 0.12 * (p.boilAmount / 100) : 0,
      noiseTile: p.boilPattern === 'blue' ? blueNoiseTile() : null,
      wave: p.waveStrength ? [p.waveStrength / 100, p.waveLength, p.waveBias / 100, p.waveFollow / 100] : null,
      seed: rt.seed,
    });
  } else {
    renderer.renderDither(p, currentPalette(p), rt.seed);
    setStatus('');
  }
}
