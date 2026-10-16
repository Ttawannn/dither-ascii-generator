import './styles.css';
import { exportPng } from './export/png';
import { ALGORITHMS, GROUP_LABELS, getAlgorithm } from './pipeline/algorithms';
import { Diffuser } from './pipeline/diffuser';
import { Renderer } from './pipeline/gl';
import {
  extractPalette,
  getPaletteDef,
  MONO_PRESETS,
  PALETTES,
  resolvePalette,
  rgbToHex,
  type Palette,
  type RGB,
} from './pipeline/palettes';
import { isImageFile, loadImageFile, sampleImage, type LoadedImage } from './source/image';
import { ADJUST_KEYS, ADJUST_SLIDERS, DITHER_KEYS, DITHER_SLIDERS, Store, type Params } from './state';
import {
  button,
  colorInput,
  el,
  section,
  segmented,
  select,
  showWhen,
  slider,
  swatches,
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
  ...ADJUST_SLIDERS.map((s) => slider(s, store)),
  toggle('invert', 'Invert', store),
);
adjust.head.append(button('Reset', () => store.reset(ADJUST_KEYS), 'link'));

const ditherSlider = (key: keyof typeof DITHER_SLIDERS, when: (p: Params) => boolean) =>
  showWhen(slider(DITHER_SLIDERS[key], store), store, when);

const paletteSwatches = swatches();

const monoPresets = el(
  'div',
  { class: 'presets' },
  ...MONO_PRESETS.map((m) => {
    const b = el(
      'button',
      { class: 'preset', type: 'button', title: m.label },
      el('span', { style: `background:${m.ink}` }),
      el('span', { style: `background:${m.paper}` }),
    );
    b.addEventListener('click', () => {
      store.set('ink', m.ink);
      store.set('paper', m.paper);
    });
    return b;
  }),
);

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

const asciiNote = showWhen(
  el('div', { class: 'note' }, 'Character sets & colour modes arrive in phase 3.'),
  store,
  (p) => p.mode === 'ascii',
);

const effect = section('Effect', ditherControls, asciiNote);
effect.head.append(button('Reset', () => store.reset(DITHER_KEYS), 'link'));

const exportBtn = button('Export PNG', () => void doExport(), 'btn primary');
exportBtn.disabled = true;

const panel = el(
  'aside',
  { class: 'panel' },
  el('div', { class: 'panel-scroll' }, source.root, adjust.root, effect.root),
  el('div', { class: 'panel-foot' }, exportBtn),
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

function draw(): void {
  if (!renderer.hasSource || !current) return;
  const p = store.params;
  renderer.renderAdjust(p, showOriginal);
  const [ow, oh] = renderer.adjustedSize;

  if (showOriginal || p.mode === 'ascii') {
    renderer.renderAdjusted();
    info.status.textContent = '';
  } else if (group(p) === 'diffusion') {
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

  const [sw, sh] = renderer.sourceSize;
  const downscaled = current.originalWidth !== sw;
  info.size.textContent = `${current.originalWidth}×${current.originalHeight}${downscaled ? ` → ${sw}×${sh}` : ''}`;
  info.out.textContent = `OUT ${ow}×${oh}`;
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
  exportBtn.disabled = false;
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
  await exportPng(canvas, store.params.pixelSize, `${current.name}-${store.params.mode}.png`);
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
