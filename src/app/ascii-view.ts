import { SHAPE_H, SHAPE_W } from '../ascii/shape';
import { ShapeMatcher } from '../ascii/matcher';
import { atlasKey, buildAtlas, type Atlas } from '../ascii/atlas';
import { isUserFontId, pickLevels, rampFor, userFontName } from '../ascii/charsets';
import { onUserFontsChange, userFonts } from '../user-fonts';
import {
  buildGrid,
  gridToAnsi,
  gridToHtml,
  gridToText,
  type AnsiDepth,
  type AsciiGrid,
  type GridOptions,
} from '../ascii/grid';
import { modulatedDepth, modulatedOffset } from '../ascii/lfo';
import { blueNoiseTile } from '../pipeline/bluenoise';
import { download } from '../export/png';
import { extractPalette, hexToRgb, resolvePalette, type RGB } from '../pipeline/palettes';
import type { Source } from '../source/source';
import type { Params } from '../state';
import { actions, activeLayer, animatedParams, clock, requestRender, rt, store } from './core';
import { mainTarget, type RenderTarget } from './gpu';
import { glyphInfo, glyphPreview } from './panel/ascii';
import { flash, info } from './shell';

// Built atlases by key: layer 1 and layer 2 may each need their own. The oldest are dropped.
const atlases = new Map<string, Atlas>();
const loading = new Set<string>();
const MAX_ATLASES = 16; // preset thumbnails need one per ASCII look
/** Layer 1's current atlas, shown in the glyph preview. */
let atlas: Atlas | null = null;
// The grid is paired with the atlas it was built for, so exports never mix glyph sets.
let lastAscii: { grid: AsciiGrid; atlas: Atlas } | null = null;
export const shapeMatchers = [new ShapeMatcher(), new ShapeMatcher()];

/** Effective depth and offset (fraction of the ramp) at the current clock. */
function asciiModulation(p: Params): { depth: number; offset: number } {
  const t = clock();
  return {
    depth: modulatedDepth(p.asciiDepth, p.asciiDepthLfo, t, p.asciiDepthSpeed, p.asciiDepthAmount / 100),
    offset: modulatedOffset(p.asciiOffset / 100, p.asciiOffsetLfo, t, p.asciiOffsetSpeed, p.asciiOffsetAmount / 100),
  };
}

// Palette for palette-coloured characters; "From image" extracts 8 colours once per source.
let asciiExtracted: { source: Source; colors: RGB[] } | null = null;
function asciiPaletteColors(p: Params): Float32Array | null {
  if (p.asciiColor !== 'palette') return null;
  const src = rt.current;
  if (p.asciiPalette === 'image' && src && asciiExtracted?.source !== src) {
    asciiExtracted = { source: src, colors: extractPalette(src.element, src.width, src.height, 8) };
  }
  const pal = resolvePalette(p.asciiPalette, {
    levels: 8,
    ink: p.asciiBg,
    paper: p.asciiFg,
    extracted: p.asciiPalette === 'image' ? (asciiExtracted?.colors ?? null) : null,
    custom: p.customPalette,
    customRamp: p.customRamp,
  });
  return new Float32Array(pal.colors.flat());
}

function syncGlyphPreview(p: Params): void {
  if (!atlas || p.mode !== 'ascii') return;
  const [, weight, family] = /^(bold )?\S+\s(.*)$/.exec(atlas.fontCss) ?? [];
  glyphPreview.style.fontFamily = family ?? '';
  glyphPreview.style.fontWeight = weight ? 'bold' : '';
  if (atlas.rampSize === 0) {
    glyphPreview.textContent = '⠁⠃⠇⡇⣇⣧⣷⣿';
    glyphInfo.textContent = '256 dot patterns · 2×4 pixels per character';
    return;
  }
  const ramp = atlas.glyphs.slice(0, atlas.rampSize);
  const used = pickLevels(ramp.length, p.asciiDepth).map((i) => ramp[i]);
  glyphPreview.textContent = used.join('');
  const missing = atlas.missing.length
    ? ` · ${atlas.missing.length} skipped (can’t be drawn at this size or font)`
    : '';
  glyphInfo.textContent = `${used.length} of ${ramp.length} glyphs, sparse → dense${missing}`;
}
store.subscribe((p, changed) => (changed === 'asciiDepth' || changed === 'mode') && syncGlyphPreview(p));

const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// An atlas built before a user font finished loading used a fallback: rebuild when fonts change.
onUserFontsChange(() => {
  atlases.clear();
  atlas = null;
  requestRender();
});

let fontsReady = false;
/** Tell the user when the look asks for a font that was added in another browser. */
export function checkUserFont(): void {
  if (!fontsReady) return;
  const id = store.params.asciiFont;
  if (store.params.mode === 'ascii' && isUserFontId(id) && !userFonts().includes(userFontName(id))) {
    // After the current task, so a "Loaded shared settings" message doesn't hide it.
    setTimeout(() =>
      flash(`Font “${userFontName(id)}” isn’t in this browser — add it under ASCII › Font, or a fallback is used`),
    );
  }
}
export function userFontsLoaded(): void {
  fontsReady = true;
  checkUserFont();
}
store.subscribe((_, changed) => (changed === 'asciiFont' || changed === 'mode') && checkUserFont());

/**
 * The glyph atlas for these settings, or null while it is being built (a render follows).
 * With `preview`, it also drives the glyph preview in the panel (layer 1 of the main view).
 */
export function currentAtlas(p: Params, layer = 0, preview = layer === 0): Atlas | null {
  const ramp = rampFor(p.asciiCharset, p.asciiCustom, p.asciiInject, p.asciiSpace);
  const key = atlasKey(ramp, p.asciiFont, p.asciiFontSize, p.asciiLineHeight, p.asciiBold);
  const hit = atlases.get(key);
  if (hit) {
    if (preview && atlas !== hit) {
      atlas = hit;
      syncGlyphPreview(store.params);
    }
    return hit;
  }
  if (!loading.has(key)) {
    loading.add(key);
    void buildAtlas(ramp, p.asciiFont, p.asciiFontSize, p.asciiLineHeight, p.asciiBold).then((a) => {
      loading.delete(key);
      atlases.set(a.key, a);
      while (atlases.size > MAX_ATLASES) atlases.delete(atlases.keys().next().value!);
      requestRender();
    });
  }
  return null;
}

/**
 * ASCII mode: adjusted image at grid size → glyph grid on the CPU → atlas pass on the GPU (into
 * `layer`). Thumbnails use fewer columns, so the characters still show at that size.
 */
export function drawAscii(p: Params, layer = 0, t: RenderTarget = mainTarget()): boolean {
  const a = currentAtlas(p, layer, layer === 0 && !t.thumb);
  if (!a) return false;
  const renderer = t.r;
  const [sw, sh] = renderer.sourceSize;
  const cols = t.thumb ? Math.min(p.asciiColumns, 40) : p.asciiColumns;
  const rows = Math.max(1, Math.round(cols * (sh / sw) * (a.cellW / a.cellH)));
  const braille = a.rampSize === 0;
  renderer.renderAdjust(
    p,
    false,
    braille ? [cols * 2, rows * 4] : p.asciiShape > 0 ? [cols * SHAPE_W, rows * SHAPE_H] : [cols, rows],
  );

  // Dense glyphs go where the image is closest to the glyph colour.
  const lightOnDark =
    p.asciiColor === 'color' || p.asciiColor === 'palette'
      ? luma(p.asciiBg) < 0.5
      : p.asciiColor === 'colorBg'
        ? luma(p.asciiFg) >= 0.5
        : luma(p.asciiFg) > luma(p.asciiBg);
  const { depth, offset } = asciiModulation(p);
  const opts: GridOptions = {
    shape: !braille && p.asciiShape > 0 ? { amount: p.asciiShape / 100, masks: a.shapes } : undefined,
    levels: braille ? null : pickLevels(a.rampSize, depth),
    edgeBase: a.rampSize,
    offset,
    palette: asciiPaletteColors(p),
    perceptual: p.perceptual,
    edges: p.asciiEdges,
    edgeThreshold: p.asciiEdgeThreshold / 100,
    dither: p.asciiDither,
    lightOnDark,
    seed: t.seed,
    boilAmount: p.boilAmount / 50,
    noiseTile: p.boilPattern === 'blue' ? blueNoiseTile() : null,
  };
  const source = rt.current;
  const renderGrid = (grid: AsciiGrid) => {
    const lp = layer === 0 ? store.params : activeLayer(store.params)?.params;
    if (!t.thumb) {
      if (rt.showOriginal || source !== rt.current || renderer.contextLost || !lp || lp.mode !== 'ascii') return;
      const latest = animatedParams(lp);
      if ((opts.shape && latest.asciiShape <= 0) || currentAtlas(latest, layer, false)?.key !== a.key) return;
    }
    const layered = !t.thumb && !!activeLayer(store.params);
    if (layered) renderer.setLayerTarget(layer, true);
    renderer.renderAscii(grid, a, p.asciiColor, p.asciiFg, p.asciiBg, p.asciiTransparent, layer);
    if (layered) {
      renderer.setLayerTarget(null);
      renderer.recomposite();
    }
    if (layer === 0 && !t.thumb) {
      lastAscii = { grid, atlas: a };
      info.out.textContent = `${cols}×${rows} chars`;
      actions.drawSplit();
      actions.afterDraw();
    }
  };
  const data = renderer.readAdjusted();
  if (opts.shape && !t.thumb) shapeMatchers[layer].request(data, cols, rows, opts, renderGrid);
  else renderGrid(buildGrid(data, cols, rows, opts));
  return true;
}

// ---------- text exports ----------

async function asciiText(): Promise<string | null> {
  await actions.renderReady();
  return lastAscii ? gridToText(lastAscii.grid, lastAscii.atlas.glyphs) : null;
}

/** The last grid as ANSI text, in the colours of the current settings. */
async function asciiAnsi(): Promise<string | null> {
  await actions.renderReady();
  if (!lastAscii) return null;
  const p = store.params;
  return gridToAnsi(lastAscii.grid, lastAscii.atlas.glyphs, {
    mode: p.asciiColor,
    fg: p.asciiFg,
    bg: p.asciiBg,
    transparent: p.asciiTransparent,
    depth: p.exportAnsi as AnsiDepth,
  });
}

async function copy(text: string | null): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flash('Copied to clipboard');
  } catch {
    flash('Clipboard unavailable');
  }
}

actions.copyText = async () => copy(await asciiText());
actions.copyAnsi = async () => copy(await asciiAnsi());

actions.exportAnsi = async () => {
  const text = await asciiAnsi();
  if (!text || !rt.current) return;
  download(new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' }), `${rt.current.name}-ascii.ans`);
};

actions.exportText = async () => {
  const text = await asciiText();
  if (!text || !rt.current) return;
  download(new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' }), `${rt.current.name}-ascii.txt`);
};

actions.exportHtml = async () => {
  await actions.renderReady();
  if (!lastAscii || !rt.current) return;
  const p = store.params;
  const html = gridToHtml(lastAscii.grid, lastAscii.atlas.glyphs, {
    title: `${rt.current.name} — ASCII`,
    fontCss: lastAscii.atlas.fontCss,
    lineHeight: p.asciiLineHeight,
    mode: p.asciiColor,
    fg: p.asciiFg,
    bg: p.asciiTransparent && p.asciiColor !== 'colorBg' ? 'transparent' : p.asciiBg,
  });
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${rt.current.name}-ascii.html`);
};
