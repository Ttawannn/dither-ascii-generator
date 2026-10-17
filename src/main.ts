import './styles.css';
import { atlasKey, buildAtlas, type Atlas } from './ascii/atlas';
import {
  ASCII_PALETTES,
  CHARSET_GROUPS,
  CHARSETS,
  COLOR_MODES,
  FONTS,
  MAX_INJECT,
  pickLevels,
  rampFor,
} from './ascii/charsets';
import { LFO_SHAPES, modulatedDepth, modulatedOffset } from './ascii/lfo';
import { buildGrid, gridToHtml, gridToText, type AsciiGrid } from './ascii/grid';
import type { AnimationFormat, FrameSequence } from './export/animation';
import { download, exportPng } from './export/png';
import { canvasToSvg } from './export/svg';
import { ALGORITHMS, GROUP_LABELS, getAlgorithm } from './pipeline/algorithms';
import { Diffuser } from './pipeline/diffuser';
import { Renderer } from './pipeline/gl';
import {
  extractPalette,
  getPaletteDef,
  MONO_PRESETS,
  PALETTES,
  resolvePalette,
  hexToRgb,
  rgbToHex,
  type Palette,
  type RGB,
} from './pipeline/palettes';
import { BUILT_IN, decodeShare, encodeShare, loadSaved, resolvePreset, snapshot, storeSaved, type Preset } from './presets';
import { isImageFile, loadImageFile, sampleImage } from './source/image';
import { isVideo, type Source } from './source/source';
import { isVideoFile, loadVideoFile, openWebcam } from './source/video';
import {
  ADJUST_KEYS,
  ADJUST_SLIDERS,
  ASCII_KEYS,
  ASCII_SLIDERS,
  BOIL_SLIDER,
  DITHER_KEYS,
  DITHER_SLIDERS,
  EXPORT_FORMATS,
  EXPORT_SLIDERS,
  FX_KEYS,
  FX_SLIDERS,
  isAnimatedFormat,
  Store,
  type BooleanKey,
  type Params,
} from './state';
import { activeEffects, EFFECTS, moveEffect, normalizeOrder } from './pipeline/effects';
import {
  button,
  colorInput,
  colorPresets,
  el,
  section,
  segmented,
  select,
  showWhen,
  slider,
  swatches,
  textInput,
  toggle,
} from './ui/controls';
import { Transport } from './ui/transport';
import { Viewer } from './ui/viewer';

const MAX_SOURCE_SIZE = 4096;
const MAX_SWATCHES = 32;

const store = new Store();
const group = (p: Params) => getAlgorithm(p.algorithm).group;

// ---------- DOM ----------

const canvas = el('canvas');
const fileInput = el('input', { type: 'file', accept: 'image/*,video/*', hidden: '' });

const stage = el(
  'main',
  { class: 'stage empty' },
  canvas,
  el(
    'div',
    { class: 'empty-state' },
    el('div', { class: 'big' }, 'Drop an image or video'),
    el('div', {}, 'or paste · browse · webcam'),
    el(
      'div',
      { class: 'row' },
      button('Browse', () => fileInput.click()),
      button('Sample', () => void openSample()),
      button('Webcam', () => void toggleWebcam()),
    ),
  ),
  el('div', { class: 'drop-overlay' }, 'DROP TO LOAD'),
  el('div', { class: 'badge' }, 'ORIGINAL'),
);

const header = el(
  'header',
  { class: 'header' },
  el('div', { class: 'logo' }, 'DITHER', el('span', {}, '/'), 'ASCII'),
  segmented(
    'mode',
    [
      { value: 'dither', label: 'Dither' },
      { value: 'ascii', label: 'ASCII' },
    ],
    store,
  ),
  el('div', { class: 'hint' }, 'Hold Space — original'),
  button('?', () => toggleHelp(), 'btn small help-btn'),
);

const transport = new Transport();

const info = {
  name: el('span', { class: 'name' }, '—'),
  size: el('span', { class: 'hide-sm' }),
  out: el('span'),
  zoom: el('span', { class: 'hide-sm' }),
  status: el('span', { class: 'busy' }),
};
const footer = el(
  'footer',
  { class: 'footer' },
  info.name,
  transport.root,
  info.size,
  info.out,
  info.status,
  el('span', { class: 'spacer' }),
  info.zoom,
  holdOriginalButton(),
  button('Fit', () => viewer.fit(), 'btn small'),
  button('1:1', () => viewer.setZoom(1), 'btn small hide-sm'),
);

// Panel

const webcamBtn = button('Webcam', () => void toggleWebcam(), 'btn wide');

const source = section(
  'Source',
  el(
    'div',
    { class: 'btn-row' },
    button('Upload', () => fileInput.click()),
    button('Sample', () => void openSample()),
    webcamBtn,
  ),
  el('div', { class: 'note source-note' }, 'Images or videos · drop, paste or upload'),
  toggle('mirror', 'Mirror', store),
);

// ---------- presets ----------

let saved = loadSaved();
const builtInGrid = el('div', { class: 'preset-grid' });
const savedGrid = el('div', { class: 'preset-grid' });
const savedHead = el('div', { class: 'subhead' }, 'Saved');
const presetName = el('input', { type: 'text', maxlength: '40', placeholder: 'Name this look', 'aria-label': 'Preset name' });

const chip = (preset: Preset) => button(preset.name, () => store.apply(resolvePreset(preset)), 'chip');

function renderPresets(): void {
  builtInGrid.replaceChildren(...BUILT_IN.map(chip));
  savedGrid.replaceChildren(
    ...saved.map((preset) =>
      el(
        'span',
        { class: 'chip-wrap' },
        chip(preset),
        button('×', () => {
          saved = saved.filter((s) => s !== preset);
          storeSaved(saved);
          renderPresets();
        }, 'chip chip-x'),
      ),
    ),
  );
  savedHead.hidden = savedGrid.hidden = saved.length === 0;
}

function savePreset(): void {
  const name = presetName.value.trim() || `Look ${saved.length + 1}`;
  saved = [...saved.filter((s) => s.name !== name), { name, params: snapshot(store.params) }];
  if (!storeSaved(saved)) flash('Could not save — browser storage is blocked');
  presetName.value = '';
  renderPresets();
}
presetName.addEventListener('keydown', (e) => e.key === 'Enter' && savePreset());

async function copyShareLink(): Promise<void> {
  const hash = `#s=${encodeShare(store.params)}`;
  history.replaceState(null, '', hash);
  try {
    await navigator.clipboard.writeText(location.href);
    flash('Share link copied');
  } catch {
    flash('Link is in the address bar');
  }
}

const presets = section(
  'Presets',
  builtInGrid,
  savedHead,
  savedGrid,
  el('div', { class: 'save-row' }, presetName, button('Save', savePreset, 'btn small')),
  button('Copy share link', () => void copyShareLink(), 'btn small share-btn'),
);
renderPresets();

// ---------- post-effects ----------

const effectList = el('div', { class: 'effect-list' });
const effectCards = new Map<string, { card: HTMLElement; up: HTMLButtonElement; down: HTMLButtonElement }>();
for (const fx of EFFECTS) {
  const up = button('↑', () => store.set('fxOrder', moveEffect(store.params.fxOrder, fx.id, -1)), 'chip chip-icon');
  const down = button('↓', () => store.set('fxOrder', moveEffect(store.params.fxOrder, fx.id, 1)), 'chip chip-icon');
  up.title = 'Apply earlier';
  down.title = 'Apply later';
  const body = showWhen(
    el(
      'div',
      { class: 'effect-body' },
      ...FX_SLIDERS[fx.id].map((s) => slider(s, store)),
      ...(fx.animated ? [el('div', { class: 'note' }, 'Moves when Boil is on')] : []),
    ),
    store,
    (p) => p[fx.enabled] === true,
  );
  const card = el(
    'div',
    { class: 'effect-card' },
    el('div', { class: 'effect-head' }, toggle(fx.enabled as BooleanKey, fx.label, store), up, down),
    body,
  );
  effectCards.set(fx.id, { card, up, down });
}

function syncEffectOrder(p: Params): void {
  const ids = normalizeOrder(p.fxOrder).split(',');
  effectList.replaceChildren(...ids.map((id) => effectCards.get(id)!.card));
  ids.forEach((id, i) => {
    const { up, down } = effectCards.get(id)!;
    up.disabled = i === 0;
    down.disabled = i === ids.length - 1;
  });
}
store.subscribe((p, changed) => changed === 'fxOrder' && syncEffectOrder(p));
syncEffectOrder(store.params);

const effectsSection = section(
  'Effects',
  el('div', { class: 'note effects-note' }, 'Applied top to bottom, after Dither or ASCII'),
  effectList,
);
effectsSection.head.append(button('Reset', () => store.reset(FX_KEYS), 'link'));

const animation = section(
  'Animation',
  toggle('animate', 'Boil', store),
  showWhen(slider(BOIL_SLIDER, store), store, (p) => p.animate),
);

const adjust = section(
  'Adjust',
  ...ADJUST_SLIDERS.map((s) =>
    s.key === 'pixelSize' ? showWhen(slider(s, store), store, (p) => p.mode === 'dither') : slider(s, store),
  ),
  toggle('invert', 'Invert', store),
);
adjust.head.append(button('Reset', () => store.reset(ADJUST_KEYS), 'link'));

const ditherSlider = (key: keyof typeof DITHER_SLIDERS, when: (p: Params) => boolean) =>
  showWhen(slider(DITHER_SLIDERS[key], store), store, when);

const paletteSwatches = swatches();

const monoPresets = colorPresets(MONO_PRESETS, (ink, paper) => {
  store.set('ink', ink);
  store.set('paper', paper);
});

const ditherControls = showWhen(
  el(
    'div',
    {},
    select(
      'algorithm',
      'Algorithm',
      ALGORITHMS.map((a) => ({ value: a.id, label: a.label, group: GROUP_LABELS[a.group] })),
      store,
    ),
    ditherSlider('strength', (p) => group(p) === 'ordered' || group(p) === 'pattern' || p.algorithm === 'noise'),
    ditherSlider('cellSize', (p) => group(p) === 'pattern'),
    ditherSlider('angle', (p) => group(p) === 'pattern'),
    ditherSlider('threshold', (p) => p.algorithm === 'threshold'),
    ditherSlider('diffusion', (p) => group(p) === 'diffusion'),
    showWhen(toggle('serpentine', 'Serpentine', store), store, (p) => group(p) === 'diffusion'),
    el('div', { class: 'subhead' }, 'Palette'),
    select(
      'palette',
      'Palette',
      PALETTES.map((p) => ({ value: p.id, label: p.label })),
      store,
    ),
    paletteSwatches.root,
    ditherSlider('levels', (p) => !!getPaletteDef(p.palette).uses.levels),
    showWhen(
      el(
        'div',
        {},
        el('div', { class: 'color-row' }, colorInput('ink', 'Ink', store), colorInput('paper', 'Paper', store)),
        monoPresets,
      ),
      store,
      (p) => !!getPaletteDef(p.palette).uses.inkPaper,
    ),
  ),
  store,
  (p) => p.mode === 'dither',
);

const asciiSlider = (key: keyof typeof ASCII_SLIDERS, when?: (p: Params) => boolean) =>
  when ? showWhen(slider(ASCII_SLIDERS[key], store), store, when) : slider(ASCII_SLIDERS[key], store);

// Terminal-style presets: light glyphs on a dark background.
const asciiPresets = colorPresets(MONO_PRESETS, (ink, paper) => {
  store.set('asciiFg', paper);
  store.set('asciiBg', ink);
});
asciiPresets.append(
  button(
    '⇄ swap',
    () => {
      const { asciiFg, asciiBg } = store.params;
      store.set('asciiFg', asciiBg);
      store.set('asciiBg', asciiFg);
    },
    'preset swap',
  ),
);

const notBraille = (p: Params) => p.asciiCharset !== 'braille';
const groupLabel = (id: string) => CHARSET_GROUPS.find((g) => g.id === id)?.label ?? id;

// Sorted glyphs of the current set, as they will be used (updated when the atlas is built).
const glyphPreview = el('div', { class: 'glyph-preview', 'aria-label': 'Characters in use, sparse to dense' });
const glyphInfo = el('div', { class: 'note glyph-info' });

const lfoControls = (title: string, shape: 'asciiOffsetLfo' | 'asciiDepthLfo', speed: string, amount: string) =>
  showWhen(
    el(
      'div',
      {},
      select(
        shape,
        title,
        LFO_SHAPES.map((l) => ({ value: l.id, label: l.label })),
        store,
      ),
      asciiSlider(speed as keyof typeof ASCII_SLIDERS, (p) => p[shape] !== 'off'),
      asciiSlider(amount as keyof typeof ASCII_SLIDERS, (p) => p[shape] !== 'off'),
    ),
    store,
    notBraille,
  );

const asciiControls = showWhen(
  el(
    'div',
    {},
    select(
      'asciiCharset',
      'Characters',
      CHARSETS.map((c) => ({ value: c.id, label: c.label, group: groupLabel(c.group) })),
      store,
    ),
    glyphPreview,
    glyphInfo,
    showWhen(textInput('asciiCustom', 'Custom ramp', store), store, (p) => p.asciiCharset === 'custom'),
    showWhen(textInput('asciiInject', `Add characters (up to ${MAX_INJECT})`, store, MAX_INJECT), store, notBraille),
    showWhen(toggle('asciiSpace', 'Include space', store), store, notBraille),
    asciiSlider('depth', notBraille),
    asciiSlider('offset', notBraille),
    asciiSlider('columns'),
    select(
      'asciiFont',
      'Font',
      FONTS.map((f) => ({ value: f.id, label: f.label })),
      store,
    ),
    asciiSlider('fontSize'),
    asciiSlider('lineHeight'),
    toggle('asciiDither', 'Dither', store),
    showWhen(toggle('asciiEdges', 'Edge glyphs', store), store, notBraille),
    asciiSlider('edgeThreshold', (p) => p.asciiEdges && notBraille(p)),
    showWhen(el('div', { class: 'subhead' }, 'Animate'), store, notBraille),
    lfoControls('Offset LFO', 'asciiOffsetLfo', 'offsetSpeed', 'offsetAmount'),
    lfoControls('Depth LFO', 'asciiDepthLfo', 'depthSpeed', 'depthAmount'),
    el('div', { class: 'subhead' }, 'Colour'),
    select(
      'asciiColor',
      'Mode',
      COLOR_MODES.map((c) => ({ value: c.id, label: c.label })),
      store,
    ),
    showWhen(
      select(
        'asciiPalette',
        'Colour palette',
        ASCII_PALETTES.map((id) => ({ value: id, label: getPaletteDef(id).label })),
        store,
      ),
      store,
      (p) => p.asciiColor === 'palette',
    ),
    el(
      'div',
      { class: 'color-row' },
      showWhen(colorInput('asciiFg', 'Text', store), store, (p) => p.asciiColor === 'mono' || p.asciiColor === 'colorBg'),
      showWhen(colorInput('asciiBg', 'Background', store), store, (p) => p.asciiColor !== 'colorBg'),
    ),
    asciiPresets,
    showWhen(toggle('asciiTransparent', 'Transparent background', store), store, (p) => p.asciiColor !== 'colorBg'),
  ),
  store,
  (p) => p.mode === 'ascii',
);

const effect = section('Effect', ditherControls, asciiControls);
effect.head.append(
  button('Reset', () => store.reset(store.params.mode === 'ascii' ? ASCII_KEYS : DITHER_KEYS), 'link'),
);

const exportInfo = el('div', { class: 'note export-info' });
const exportSection = section(
  'Export',
  select(
    'exportFormat',
    'Format',
    EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label })),
    store,
  ),
  slider(EXPORT_SLIDERS.scale, store),
  showWhen(slider(EXPORT_SLIDERS.duration, store), store, (p) => isAnimatedFormat(p.exportFormat)),
  showWhen(slider(EXPORT_SLIDERS.fps, store), store, (p) => isAnimatedFormat(p.exportFormat)),
  exportInfo,
);

const exportBtn = button('Export', () => void onExportClick(), 'btn primary');
const textExports = [
  button('Copy', () => void copyText(), 'btn small'),
  button('.txt', () => exportText(), 'btn small'),
  button('.html', () => exportHtml(), 'btn small'),
];
for (const b of [exportBtn, ...textExports]) b.disabled = true;

const panel = el(
  'aside',
  { class: 'panel' },
  el(
    'div',
    { class: 'panel-scroll' },
    source.root,
    presets.root,
    adjust.root,
    effect.root,
    animation.root,
    effectsSection.root,
    exportSection.root,
  ),
  el(
    'div',
    { class: 'panel-foot' },
    exportBtn,
    showWhen(el('div', { class: 'export-row' }, ...textExports), store, (p) => p.mode === 'ascii'),
  ),
);

const SHORTCUTS: [string, string][] = [
  ['Space (hold)', 'Show original'],
  ['F · double-click', 'Fit to view'],
  ['1', '100% zoom'],
  ['Wheel · drag', 'Zoom · pan'],
  ['D · A', 'Dither · ASCII mode'],
  ['K', 'Play / pause video'],
  ['B', 'Toggle boil'],
  ['O', 'Open file'],
  ['E', 'Export'],
  ['Ctrl+V', 'Paste image'],
  ['?', 'This help'],
];
const help = el(
  'div',
  { class: 'help', hidden: '', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
  el(
    'div',
    { class: 'help-card' },
    el(
      'div',
      { class: 'section-head' },
      el('span', { class: 'section-title' }, 'Shortcuts'),
      button('Close', () => toggleHelp(false), 'link'),
    ),
    el('dl', {}, ...SHORTCUTS.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
  ),
);
help.addEventListener('click', (e) => e.target === help && toggleHelp(false));
function toggleHelp(on = help.hidden): void {
  help.hidden = !on;
}

document.querySelector('#app')!.append(el('div', { class: 'app' }, header, stage, footer, panel), fileInput, help);

// ---------- renderer ----------

let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (err) {
  stage.classList.remove('empty');
  stage.replaceChildren(el('div', { class: 'error' }, (err as Error).message));
  throw err;
}

// Mobile browsers and GPU driver resets can take the WebGL context away. preventDefault()
// asks for it back; on restore every GPU object is rebuilt and the source re-uploaded.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  flash('GPU reset — restoring…');
});
canvas.addEventListener('webglcontextrestored', () => {
  renderer.restore();
  if (current) renderer.setSource(current.element, current.width, current.height);
  requestRender();
  flash('Preview restored');
});

const viewer = new Viewer(stage, canvas);
viewer.onChange = () => {
  info.zoom.textContent = renderer.hasSource ? `${Math.round(viewer.zoom * 100)}%` : '';
};

const diffuser = new Diffuser((result) => {
  const p = store.params;
  if (showOriginal || p.mode !== 'dither' || group(p) !== 'diffusion') return;
  renderer.renderResult(result);
  info.status.textContent = `${Math.round(result.ms)} ms`;
});

let current: Source | null = null;
let showOriginal = false;
let frame = 0;

// Median-cut palette for "From image", cached per source + colour count (first frame for videos).
let extracted: { source: Source; count: number; colors: RGB[] } | null = null;

function currentPalette(): Palette {
  const p = store.params;
  if (p.palette === 'image' && current && (extracted?.source !== current || extracted.count !== p.levels)) {
    const { element, width, height } = current;
    extracted = { source: current, count: p.levels, colors: extractPalette(element, width, height, p.levels) };
  }
  return resolvePalette(p.palette, {
    levels: p.levels,
    ink: p.ink,
    paper: p.paper,
    extracted: p.palette === 'image' ? (extracted?.colors ?? null) : null,
  });
}

function syncSwatches(): void {
  const pal = currentPalette();
  const shown = pal.colors.slice(0, MAX_SWATCHES).map(rgbToHex);
  const more = pal.colors.length - shown.length;
  paletteSwatches.update(shown, more > 0 ? `+${more}` : `${pal.colors.length}`);
}
const PALETTE_KEYS: (keyof Params)[] = ['palette', 'levels', 'ink', 'paper'];
store.subscribe((_, changed) => PALETTE_KEYS.includes(changed) && syncSwatches());
syncSwatches();

function requestRender(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
  });
}

// ---------- animation ----------

/** Boil seed: 0 = static; advances at `boilFps` while animating. */
let seed = 0;
let boilTimer = 0;

function syncBoil(): void {
  clearInterval(boilTimer);
  seed = 0;
  const { animate, boilFps } = store.params;
  if (animate) {
    boilTimer = window.setInterval(() => {
      seed = (seed % 100000) + 1;
      requestRender();
    }, 1000 / boilFps);
  }
  requestRender();
}
store.subscribe((_, changed) => (changed === 'animate' || changed === 'boilFps') && syncBoil());
syncBoil();

/** Redraw on every decoded video frame (or every animation frame where rVFC is missing). */
function watchVideo(src: Source & { element: HTMLVideoElement }): void {
  const v = src.element;
  const tick = () => {
    if (current !== src) return;
    requestRender();
    schedule();
  };
  const schedule = () => {
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
  };
  schedule();
}

// ---------- ASCII ----------

let atlas: Atlas | null = null;
let atlasLoading = '';

/** Animation clock in seconds: real time, or the frame time while exporting. */
let clockOverride: number | null = null;
const clock = () => clockOverride ?? performance.now() / 1000;

const lfoActive = (p: Params) =>
  p.mode === 'ascii' && notBraille(p) && (p.asciiOffsetLfo !== 'off' || p.asciiDepthLfo !== 'off');

// LFOs need a redraw every frame while they run.
let lfoFrame = 0;
function syncLfoLoop(): void {
  cancelAnimationFrame(lfoFrame);
  if (!lfoActive(store.params)) return;
  const tick = () => {
    if (!exporting) requestRender();
    lfoFrame = requestAnimationFrame(tick);
  };
  lfoFrame = requestAnimationFrame(tick);
}
const LFO_KEYS: (keyof Params)[] = ['mode', 'asciiCharset', 'asciiOffsetLfo', 'asciiDepthLfo'];
store.subscribe((_, changed) => LFO_KEYS.includes(changed) && syncLfoLoop());

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
  if (p.asciiPalette === 'image' && current && asciiExtracted?.source !== current) {
    asciiExtracted = { source: current, colors: extractPalette(current.element, current.width, current.height, 8) };
  }
  const pal = resolvePalette(p.asciiPalette, {
    levels: 8,
    ink: p.asciiBg,
    paper: p.asciiFg,
    extracted: p.asciiPalette === 'image' ? (asciiExtracted?.colors ?? null) : null,
  });
  return new Float32Array(pal.colors.flat());
}

function syncGlyphPreview(p: Params): void {
  if (!atlas || p.mode !== 'ascii') return;
  glyphPreview.style.fontFamily = atlas.fontCss.replace(/^\S+\s/, '');
  if (atlas.rampSize === 0) {
    glyphPreview.textContent = '⠁⠃⠇⡇⣇⣧⣷⣿';
    glyphInfo.textContent = '256 dot patterns · 2×4 pixels per character';
    return;
  }
  const ramp = atlas.glyphs.slice(0, atlas.rampSize);
  const used = pickLevels(ramp.length, p.asciiDepth).map((i) => ramp[i]);
  glyphPreview.textContent = used.join('');
  const missing = atlas.missing.length ? ` · ${atlas.missing.length} skipped (can’t be drawn at this size or font)` : '';
  glyphInfo.textContent = `${used.length} of ${ramp.length} glyphs, sparse → dense${missing}`;
}
store.subscribe((p, changed) => (changed === 'asciiDepth' || changed === 'mode') && syncGlyphPreview(p));
// The grid is paired with the atlas it was built for, so exports never mix glyph sets.
let lastAscii: { grid: AsciiGrid; atlas: Atlas } | null = null;

const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The glyph atlas for the current settings, or null while it is being built (a render follows). */
function currentAtlas(p: Params): Atlas | null {
  const ramp = rampFor(p.asciiCharset, p.asciiCustom, p.asciiInject, p.asciiSpace);
  const key = atlasKey(ramp, p.asciiFont, p.asciiFontSize, p.asciiLineHeight);
  if (atlas?.key === key) return atlas;
  if (atlasLoading !== key) {
    atlasLoading = key;
    void buildAtlas(ramp, p.asciiFont, p.asciiFontSize, p.asciiLineHeight).then((a) => {
      if (atlasLoading !== a.key) return; // settings moved on while fonts loaded
      atlas = a;
      atlasLoading = '';
      syncGlyphPreview(store.params);
      requestRender();
    });
  }
  return null;
}

function drawAscii(p: Params): void {
  const a = currentAtlas(p);
  if (!a) return;
  const [sw, sh] = renderer.sourceSize;
  const cols = p.asciiColumns;
  const rows = Math.max(1, Math.round(cols * (sh / sw) * (a.cellW / a.cellH)));
  const braille = a.rampSize === 0;
  renderer.renderAdjust(p, false, braille ? [cols * 2, rows * 4] : [cols, rows]);

  // Dense glyphs go where the image is closest to the glyph colour.
  const lightOnDark =
    p.asciiColor === 'color' || p.asciiColor === 'palette'
      ? luma(p.asciiBg) < 0.5
      : p.asciiColor === 'colorBg'
        ? luma(p.asciiFg) >= 0.5
        : luma(p.asciiFg) > luma(p.asciiBg);
  const { depth, offset } = asciiModulation(p);
  const grid = buildGrid(renderer.readAdjusted(), cols, rows, {
    levels: braille ? null : pickLevels(a.rampSize, depth),
    edgeBase: a.rampSize,
    offset,
    palette: asciiPaletteColors(p),
    edges: p.asciiEdges,
    edgeThreshold: p.asciiEdgeThreshold / 100,
    dither: p.asciiDither,
    lightOnDark,
    seed,
  });
  lastAscii = { grid, atlas: a };
  renderer.renderAscii(grid, a, p.asciiColor, p.asciiFg, p.asciiBg, p.asciiTransparent);
  info.out.textContent = `${cols}×${rows} chars`;
}

function asciiText(): string | null {
  return lastAscii ? gridToText(lastAscii.grid, lastAscii.atlas.glyphs) : null;
}

async function copyText(): Promise<void> {
  const text = asciiText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flash('Copied to clipboard');
  } catch {
    flash('Clipboard unavailable');
  }
}

function exportText(): void {
  const text = asciiText();
  if (!text || !current) return;
  download(new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' }), `${current.name}-ascii.txt`);
}

function exportHtml(): void {
  if (!lastAscii || !current) return;
  const p = store.params;
  const html = gridToHtml(lastAscii.grid, lastAscii.atlas.glyphs, {
    title: `${current.name} — ASCII`,
    fontCss: lastAscii.atlas.fontCss,
    lineHeight: p.asciiLineHeight,
    mode: p.asciiColor,
    fg: p.asciiFg,
    bg: p.asciiTransparent && p.asciiColor !== 'colorBg' ? 'transparent' : p.asciiBg,
  });
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${current.name}-ascii.html`);
}

const transparentAscii = (p: Params) => p.asciiTransparent && p.asciiColor !== 'colorBg';

// ---------- draw ----------

function draw(): void {
  if (!renderer.hasSource || !current || renderer.contextLost) return;
  const p = store.params;
  if (isVideo(current) && current.element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    renderer.setSource(current.element, current.width, current.height);
  }
  // The original view is shown untouched; otherwise every output pass runs the effect chain.
  renderer.setEffects(showOriginal ? [] : activeEffects(p), seed, !(p.mode === 'ascii' && transparentAscii(p)));
  stage.classList.toggle('ascii', p.mode === 'ascii' && !showOriginal);
  stage.classList.toggle('transparent', p.mode === 'ascii' && !showOriginal && transparentAscii(p));

  if (showOriginal) {
    renderer.renderAdjust(p, true);
    renderer.renderAdjusted();
    info.status.textContent = '';
  } else if (p.mode === 'ascii') {
    drawAscii(p);
    info.status.textContent = '';
  } else {
    drawDither(p);
  }

  const [sw, sh] = renderer.sourceSize;
  const downscaled = current.originalWidth !== sw;
  info.size.textContent = `${current.originalWidth}×${current.originalHeight}${downscaled ? ` → ${sw}×${sh}` : ''}`;
  syncExportInfo();
}

function drawDither(p: Params): void {
  renderer.renderAdjust(p, false);
  const [ow, oh] = renderer.adjustedSize;
  info.out.textContent = `OUT ${ow}×${oh}`;

  if (group(p) === 'diffusion') {
    // Keep the previous frame on screen while the worker runs; only redraw now if a resize would blank it.
    if (!renderer.canvasMatches) renderer.renderResult();
    const pal = currentPalette();
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
      noise: seed ? 0.06 : 0,
      seed,
    });
  } else {
    renderer.renderDither(p, currentPalette(), seed);
    info.status.textContent = '';
  }
}

store.subscribe(requestRender);

let statusTimer = 0;
function flash(msg: string): void {
  info.status.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => (info.status.textContent = ''), 3000);
}

function setSource(src: Source): void {
  current?.dispose();
  current = src;
  renderer.setSource(src.element, src.width, src.height);
  if (store.params.palette === 'image') syncSwatches();
  stage.classList.remove('empty');
  info.name.textContent = src.name;
  for (const b of [exportBtn, ...textExports]) b.disabled = false;
  webcamBtn.textContent = src.kind === 'webcam' ? 'Stop webcam' : 'Webcam';
  webcamBtn.classList.toggle('active', src.kind === 'webcam');
  transport.attach(src);
  viewer.setImageSize(src.width, src.height);
  if (isVideo(src)) watchVideo(src);
  requestRender();
}

function clearSource(): void {
  current?.dispose();
  current = null;
  transport.attach(null);
  webcamBtn.textContent = 'Webcam';
  webcamBtn.classList.remove('active');
  stage.classList.add('empty');
  info.name.textContent = '—';
  for (const node of [info.size, info.out, info.status, info.zoom]) node.textContent = '';
  for (const b of [exportBtn, ...textExports]) b.disabled = true;
}

async function openFile(file: File | undefined): Promise<void> {
  if (!file) return;
  const video = isVideoFile(file);
  if (!video && !isImageFile(file)) {
    flash(`Unsupported file: ${file.type || file.name}`);
    return;
  }
  try {
    setSource(
      video ? await loadVideoFile(file) : await loadImageFile(file, Math.min(renderer.maxTextureSize, MAX_SOURCE_SIZE)),
    );
  } catch (err) {
    console.error(err);
    flash(video ? 'Could not play this video' : 'Could not decode image');
  }
}

async function openSample(): Promise<void> {
  setSource(await sampleImage());
}

async function toggleWebcam(): Promise<void> {
  if (current?.kind === 'webcam') {
    clearSource();
    return;
  }
  try {
    const cam = await openWebcam();
    store.set('mirror', true); // selfie view feels natural; the toggle stays available
    setSource(cam);
  } catch (err) {
    console.error(err);
    const denied = err instanceof DOMException && err.name === 'NotAllowedError';
    flash(denied ? 'Camera permission denied' : 'No camera available');
  }
}

// ---------- export ----------

let exporting: { cancelled: boolean } | null = null;

function syncExportInfo(): void {
  const p = store.params;
  const format = EXPORT_FORMATS.find((f) => f.id === p.exportFormat)!;
  exportBtn.textContent = exporting ? exportBtn.textContent : `Export ${p.exportFormat.toUpperCase()}`;
  if (!current) {
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
    p.mode === 'ascii' && transparentAscii(p) && p.exportFormat === 'mp4'
      ? ' · MP4 can’t keep transparency: the background colour is used'
      : '';
  exportInfo.textContent =
    typeof plan === 'string'
      ? plan
      : `→ ${size} · ${plan.count} frames · ${(plan.count / plan.fps).toFixed(1)} s${alphaNote}`;
}
const EXPORT_KEYS: (keyof Params)[] = [
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
syncExportInfo();

/** Frame count for an animated export, or a reason it is not possible. */
function animationLength(): { count: number; fps: number } | string {
  const p = store.params;
  const fps = p.exportFps;
  if (!current) return 'Load a source first';
  if (current.kind === 'image' && !p.animate && !lfoActive(p)) {
    return 'Static image — turn on Boil or an ASCII LFO, or load a video';
  }
  let seconds = p.exportDuration;
  if (current.kind === 'video') {
    const v = current.element as HTMLVideoElement;
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

function frameSequence(): FrameSequence | string {
  const plan = animationLength();
  if (typeof plan === 'string') return plan;
  const src = current!;
  const { fps, count } = plan;
  const { animate, boilFps } = store.params;
  // Boil keeps its own pace regardless of the export frame rate.
  const boilSeed = (i: number) => (animate ? Math.floor((i * boilFps) / fps) + 1 : 0);

  if (src.kind === 'video') {
    const v = src.element as HTMLVideoElement;
    const start = v.currentTime >= v.duration - 0.05 ? 0 : v.currentTime;
    return {
      count,
      fps,
      render: async (i) => {
        await seek(v, start + i / fps);
        seed = boilSeed(i);
        clockOverride = i / fps;
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
        seed = boilSeed(i);
        clockOverride = i / fps;
        await renderNow();
      },
    };
  }
  return {
    count,
    fps,
    render: async (i) => {
      seed = boilSeed(i);
      clockOverride = i / fps;
      await renderNow();
    },
  };
}

async function onExportClick(): Promise<void> {
  if (exporting) {
    exporting.cancelled = true;
    return;
  }
  if (!current) return;
  const p = store.params;
  const name = `${current.name}-${p.mode}`;
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
  exporting = job;
  // Video files are stepped frame by frame; the webcam keeps streaming in real time.
  const video = current.kind === 'video' ? (current.element as HTMLVideoElement) : null;
  const wasPlaying = video ? !video.paused : false;
  const resumeAt = video?.currentTime ?? 0;
  video?.pause();
  clearInterval(boilTimer); // export drives the seed itself
  exportBtn.textContent = 'Cancel';
  // Encoders are loaded on first use to keep the initial page light.
  const { exportAnimation, ExportCancelled } = await import('./export/animation');
  try {
    const blob = await exportAnimation({
      format: p.exportFormat as AnimationFormat,
      source: canvas,
      scale: p.exportScale,
      frames,
      onProgress: (done, total) => (exportBtn.textContent = `Cancel · ${done}/${total}`),
      isCancelled: () => job.cancelled,
      transparent: p.mode === 'ascii' && transparentAscii(p),
      matte: p.asciiBg,
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
    exporting = null;
    clockOverride = null;
    syncBoil();
    if (video) video.currentTime = resumeAt;
    if (wasPlaying) void video!.play().catch(() => undefined);
    syncExportInfo();
    requestRender();
  }
}

// ---------- input ----------

fileInput.addEventListener('change', () => {
  void openFile(fileInput.files?.[0]);
  fileInput.value = '';
});

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  stage.classList.add('dragover');
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) stage.classList.remove('dragover');
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  stage.classList.remove('dragover');
  void openFile(e.dataTransfer?.files[0]);
});

window.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files ?? [])].find(isImageFile);
  if (file) void openFile(file);
});

/** Press-and-hold comparison for touch screens (Space does the same on a keyboard). */
function holdOriginalButton(): HTMLButtonElement {
  const b = button('Original', () => {}, 'btn small hold');
  b.title = 'Hold to compare with the original (Space)';
  b.addEventListener('pointerdown', (e) => {
    if (!current) return;
    b.setPointerCapture(e.pointerId);
    setOriginal(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => setOriginal(false));
  return b;
}

function setOriginal(on: boolean): void {
  if (showOriginal === on) return;
  showOriginal = on;
  stage.classList.toggle('original', on);
  requestRender();
}

// Keys typed into these elements belong to them, not to our shortcuts.
const ownsKeys = (t: EventTarget | null) =>
  t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type !== 'range' && t.type !== 'checkbox');

window.addEventListener('keydown', (e) => {
  if (ownsKeys(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space' && renderer.hasSource) {
    e.preventDefault();
    setOriginal(true);
  } else if (e.key === 'f') {
    viewer.fit();
  } else if (e.key === '1') {
    viewer.setZoom(1);
  } else if (e.key === 'k') {
    transport.toggle();
  } else if (e.key === 'd') {
    store.set('mode', 'dither');
  } else if (e.key === 'a') {
    store.set('mode', 'ascii');
  } else if (e.key === 'b') {
    store.set('animate', !store.params.animate);
  } else if (e.key === 'o') {
    fileInput.click();
  } else if (e.key === 'e') {
    void onExportClick();
  } else if (e.key === '?') {
    toggleHelp();
  } else if (e.key === 'Escape') {
    toggleHelp(false);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !ownsKeys(e.target)) {
    e.preventDefault(); // stop a focused button from being "clicked" by Space
    setOriginal(false);
  }
});
window.addEventListener('blur', () => setOriginal(false));

// ---------- startup ----------

function applyShareLink(): void {
  const shared = decodeShare(location.hash);
  if (shared) {
    store.apply(shared);
    flash('Loaded shared settings');
  }
}
window.addEventListener('hashchange', applyShareLink);
applyShareLink();
syncLfoLoop();
if (new URLSearchParams(location.search).has('sample')) void openSample();
