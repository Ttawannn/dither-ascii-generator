import './styles.css';
import { exportPng } from './export/png';
import { Renderer } from './pipeline/gl';
import { isImageFile, loadImageFile, sampleImage, type LoadedImage } from './source/image';
import { ADJUST_KEYS, ADJUST_SLIDERS, Store } from './state';
import { button, el, section, segmented, slider, toggle } from './ui/controls';
import { Viewer } from './ui/viewer';

const MAX_SOURCE_SIZE = 4096;

const store = new Store();

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
  status: el('span'),
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

const effectNote = el('div', { class: 'note' });
const effect = section('Effect', effectNote);
const syncEffect = () => {
  effectNote.textContent =
    store.params.mode === 'dither'
      ? 'Algorithms & palettes arrive in phase 2.'
      : 'Character sets & colour modes arrive in phase 3.';
};
store.subscribe((_, changed) => changed === 'mode' && syncEffect());
syncEffect();

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

let current: LoadedImage | null = null;
let showOriginal = false;
let frame = 0;

function requestRender(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
  });
}

function draw(): void {
  if (!renderer.hasSource || !current) return;
  renderer.render(store.params, showOriginal);
  const [ow, oh] = renderer.outputSize(store.params.pixelSize);
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
  renderer.render(store.params, false); // make sure the canvas holds the processed frame
  await exportPng(canvas, store.params.pixelSize, `${current.name}-${store.params.mode}.png`);
  if (showOriginal) renderer.render(store.params, true);
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

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  if (e.code === 'Space' && renderer.hasSource) {
    e.preventDefault();
    setOriginal(true);
  } else if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
    viewer.fit();
  } else if (e.key === '1' && !e.ctrlKey && !e.metaKey) {
    viewer.setZoom(1);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    e.preventDefault(); // stop a focused button from being "clicked" by Space
    setOriginal(false);
  }
});
window.addEventListener('blur', () => setOriginal(false));
