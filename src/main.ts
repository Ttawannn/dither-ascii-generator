import './styles.css';
import { atlasKey, buildAtlas, type Atlas } from './ascii/atlas';
import { CHARSETS, COLOR_MODES, FONTS, rampFor } from './ascii/charsets';
import { buildGrid, gridToHtml, gridToText, type AsciiGrid } from './ascii/grid';
import { download, exportPng } from './export/png';
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
import { isImageFile, loadImageFile, sampleImage, type LoadedImage } from './source/image';
import {
  ADJUST_KEYS,
  ADJUST_SLIDERS,
  ASCII_KEYS,
  ASCII_SLIDERS,
  DITHER_KEYS,
  DITHER_SLIDERS,
  Store,
  type Params,
} from './state';
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
import { Viewer } from './ui/viewer';

const MAX_SOURCE_SIZE = 4096;
const MAX_SWATCHES = 32;

const store = new Store();
const group = (p: Params) => getAlgorithm(p.algorithm).group;

// ---------- DOM ----------

const canvas = el('canvas');
const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: '' });

const stage = el(
  'main',
  { class: 'stage empty' },
  canvas,
  el(
    'div',
    { class: 'empty-state' },
    el('div', { class: 'big' }, 'Drop an image'),
    el('div', {}, 'or paste · or browse'),
    el(
      'div',
      { class: 'row' },
      button('Browse', () => fileInput.click()),
      button('Sample', () => void openSample()),
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
);

const info = {
  name: el('span', { class: 'name' }, '—'),
  size: el('span', { class: 'hide-sm' }),
  out: el('span'),
  zoom: el('span'),
  status: el('span', { class: 'busy' }),
};
const footer = el(
  'footer',
  { class: 'footer' },
  info.name,
  info.size,
  info.out,
  info.status,
  el('span', { class: 'spacer' }),
  info.zoom,
  button('Fit', () => viewer.fit(), 'btn small'),
  button('1:1', () => viewer.setZoom(1), 'btn small'),
);

// Panel

function comingSoon(label: string, phase: string): HTMLButtonElement {
  const b = button(label, () => {});
  b.disabled = true;
  b.title = `Coming in ${phase}`;
  return b;
}

const source = section(
  'Source',
  el(
    'div',
    { class: 'btn-row' },
    button('Upload', () => fileInput.click()),
    button('Sample', () => void openSample()),
    comingSoon('Webcam', 'phase 4'),
    comingSoon('Video', 'phase 4'),
  ),
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

const asciiControls = showWhen(
  el(
    'div',
    {},
    select(
      'asciiCharset',
      'Characters',
      CHARSETS.map((c) => ({ value: c.id, label: c.label })),
      store,
    ),
    showWhen(textInput('asciiCustom', 'Custom ramp (sparse → dense)', store), store, (p) => p.asciiCharset === 'custom'),
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
    showWhen(toggle('asciiEdges', 'Edge glyphs', store), store, (p) => p.asciiCharset !== 'braille'),
    asciiSlider('edgeThreshold', (p) => p.asciiEdges && p.asciiCharset !== 'braille'),
    el('div', { class: 'subhead' }, 'Colour'),
    select(
      'asciiColor',
      'Mode',
      COLOR_MODES.map((c) => ({ value: c.id, label: c.label })),
      store,
    ),
    el(
      'div',
      { class: 'color-row' },
      showWhen(colorInput('asciiFg', 'Text', store), store, (p) => p.asciiColor !== 'color'),
      showWhen(colorInput('asciiBg', 'Background', store), store, (p) => p.asciiColor !== 'colorBg'),
    ),
    asciiPresets,
  ),
  store,
  (p) => p.mode === 'ascii',
);

const effect = section('Effect', ditherControls, asciiControls);
effect.head.append(
  button('Reset', () => store.reset(store.params.mode === 'ascii' ? ASCII_KEYS : DITHER_KEYS), 'link'),
);

const exportBtn = button('Export PNG', () => void doExport(), 'btn primary');
const textExports = [
  button('Copy', () => void copyText(), 'btn small'),
  button('.txt', () => exportText(), 'btn small'),
  button('.html', () => exportHtml(), 'btn small'),
];
for (const b of [exportBtn, ...textExports]) b.disabled = true;

const panel = el(
  'aside',
  { class: 'panel' },
  el('div', { class: 'panel-scroll' }, source.root, adjust.root, effect.root),
  el(
    'div',
    { class: 'panel-foot' },
    exportBtn,
    showWhen(el('div', { class: 'export-row' }, ...textExports), store, (p) => p.mode === 'ascii'),
  ),
);

document.querySelector('#app')!.append(el('div', { class: 'app' }, header, stage, footer, panel), fileInput);

// ---------- renderer ----------

let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (err) {
  stage.classList.remove('empty');
  stage.replaceChildren(el('div', { class: 'error' }, (err as Error).message));
  throw err;
}

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

let current: LoadedImage | null = null;
let showOriginal = false;
let frame = 0;

// Median-cut palette for "From image", cached per image + colour count.
let extracted: { image: LoadedImage; count: number; colors: RGB[] } | null = null;

function currentPalette(): Palette {
  const p = store.params;
  if (p.palette === 'image' && current && (extracted?.image !== current || extracted.count !== p.levels)) {
    extracted = { image: current, count: p.levels, colors: extractPalette(current.bitmap, p.levels) };
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

// ---------- ASCII ----------

let atlas: Atlas | null = null;
let atlasLoading = '';
// The grid is paired with the atlas it was built for, so exports never mix glyph sets.
let lastAscii: { grid: AsciiGrid; atlas: Atlas } | null = null;

const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The glyph atlas for the current settings, or null while it is being built (a render follows). */
function currentAtlas(p: Params): Atlas | null {
  const ramp = rampFor(p.asciiCharset, p.asciiCustom);
  const key = atlasKey(ramp, p.asciiFont, p.asciiFontSize, p.asciiLineHeight);
  if (atlas?.key === key) return atlas;
  if (atlasLoading !== key) {
    atlasLoading = key;
    void buildAtlas(ramp, p.asciiFont, p.asciiFontSize, p.asciiLineHeight).then((a) => {
      if (atlasLoading !== a.key) return; // settings moved on while fonts loaded
      atlas = a;
      atlasLoading = '';
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
    p.asciiColor === 'color'
      ? luma(p.asciiBg) < 0.5
      : p.asciiColor === 'colorBg'
        ? luma(p.asciiFg) >= 0.5
        : luma(p.asciiFg) > luma(p.asciiBg);
  const grid = buildGrid(renderer.readAdjusted(), cols, rows, {
    rampSize: a.rampSize,
    edges: p.asciiEdges,
    edgeThreshold: p.asciiEdgeThreshold / 100,
    dither: p.asciiDither,
    lightOnDark,
  });
  lastAscii = { grid, atlas: a };
  renderer.renderAscii(grid, a, p.asciiColor, p.asciiFg, p.asciiBg);
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
    bg: p.asciiBg,
  });
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${current.name}-ascii.html`);
}

// ---------- draw ----------

function draw(): void {
  if (!renderer.hasSource || !current) return;
  const p = store.params;
  stage.classList.toggle('ascii', p.mode === 'ascii' && !showOriginal);

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
    });
  } else {
    renderer.renderDither(p, currentPalette());
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

function setImage(img: LoadedImage): void {
  current?.bitmap.close();
  current = img;
  renderer.setSource(img.bitmap, img.bitmap.width, img.bitmap.height);
  if (store.params.palette === 'image') syncSwatches();
  stage.classList.remove('empty');
  info.name.textContent = img.name;
  for (const b of [exportBtn, ...textExports]) b.disabled = false;
  viewer.setImageSize(img.bitmap.width, img.bitmap.height);
  requestRender();
}

async function openFile(file: File | undefined): Promise<void> {
  if (!file) return;
  if (!isImageFile(file)) {
    flash(`Unsupported file: ${file.type || file.name}`);
    return;
  }
  try {
    setImage(await loadImageFile(file, Math.min(renderer.maxTextureSize, MAX_SOURCE_SIZE)));
  } catch (err) {
    console.error(err);
    flash('Could not decode image');
  }
}

async function openSample(): Promise<void> {
  setImage(await sampleImage());
}

async function doExport(): Promise<void> {
  if (!current) return;
  // Make sure the canvas holds the processed frame, not the original preview.
  setOriginal(false);
  draw();
  await diffuser.idle();
  const p = store.params;
  await exportPng(canvas, p.mode === 'ascii' ? 1 : p.pixelSize, `${current.name}-${p.mode}.png`);
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
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !ownsKeys(e.target)) {
    e.preventDefault(); // stop a focused button from being "clicked" by Space
    setOriginal(false);
  }
});
window.addEventListener('blur', () => setOriginal(false));
