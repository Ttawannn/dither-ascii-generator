import { download } from '../../export/png';
import { importPreset, importPresetList } from '../../preset-import';
import { randomLook, rng } from '../../random-look';
import {
  BUILT_IN,
  decodeShare,
  encodeShare,
  loadSaved,
  presetFile,
  presetFileName,
  presetListFile,
  resolvePreset,
  snapshot,
  storeSaved,
  type Preset,
} from '../../presets';
import type { Params } from '../../state';
import { button, el, section } from '../../ui/controls';
import { actions, store } from '../core';
import { flash } from '../shell';

let saved = loadSaved();
const builtInGrid = el('div', { class: 'preset-grid' });
const savedGrid = el('div', { class: 'preset-grid' });
const savedHead = el('div', { class: 'subhead' }, 'Saved');
const presetName = el('input', { type: 'text', maxlength: '40', placeholder: 'Name this look', 'aria-label': 'Preset name' });

// Thumbnail canvases by look, kept when the lists are rebuilt so unchanged ones aren't redrawn.
const thumbCanvases = new Map<string, HTMLCanvasElement>();
let thumbList: { params: Partial<Params>; canvas: HTMLCanvasElement }[] = [];
/** Each preset button's look and thumbnail canvas (filled by app/thumbs.ts). */
export const presetThumbs = () => thumbList;

function chip(preset: Preset): HTMLButtonElement {
  const params = resolvePreset(preset);
  const key = JSON.stringify(params);
  let canvas = thumbCanvases.get(key);
  if (!canvas) {
    canvas = el('canvas', { class: 'chip-thumb', hidden: '' });
    thumbCanvases.set(key, canvas);
  }
  thumbList.push({ params, canvas });
  const b = button('', () => store.apply(params), 'chip preset-chip');
  // Preset names are names, not UI text: they stay as they are in every language.
  b.setAttribute('translate', 'no');
  b.append(canvas, el('span', { class: 'chip-name' }, preset.name));
  b.title = preset.name;
  return b;
}

function renderPresets(): void {
  thumbList = [];
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
  exportAllBtn.disabled = saved.length === 0;
  actions.refreshThumbs(false);
}

function savePreset(): void {
  const name = presetName.value.trim() || `Look ${saved.length + 1}`;
  saved = [...saved.filter((s) => s.name !== name), { name, params: snapshot(store.params) }];
  if (!storeSaved(saved)) flash('Could not save — browser storage is blocked');
  presetName.value = '';
  renderPresets();
}
presetName.addEventListener('keydown', (e) => e.key === 'Enter' && savePreset());

// ---------- import ----------

const importReport = el('div', { class: 'note import-report', hidden: '' });
const presetPicker = el('input', { type: 'file', accept: '.preset,.json,application/json', hidden: '' });

function showReport(lines: string[]): void {
  importReport.replaceChildren(
    ...lines.map((l) => el('div', {}, l)),
    button('Dismiss', () => (importReport.hidden = true), 'link'),
  );
  importReport.hidden = false;
}

/**
 * Apply a preset file as a complete look and keep it under Saved; a file with several presets only
 * adds them to Saved. Returns false when the file isn't a preset (so a dropped .json can be tried as
 * a palette instead).
 */
export async function importPresetFile(file: File): Promise<boolean> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return false;
  }
  const list = importPresetList(data);
  if (list) {
    const names = new Set(list.map((r) => r.name));
    saved = [...saved.filter((s) => !names.has(s.name)), ...list.map((r) => ({ name: r.name, params: r.params }))];
    if (!storeSaved(saved)) flash('Could not save — browser storage is blocked');
    renderPresets();
    const skipped = list.filter((r) => r.skipped.length || r.approximated.length).map((r) => r.name);
    showReport([
      `Added ${list.length} preset${list.length === 1 ? '' : 's'} to Saved.`,
      ...(skipped.length ? [`Not carried over exactly: ${skipped.join(', ')}.`] : []),
    ]);
    flash(`Imported ${list.length} presets`);
    return true;
  }
  const result = importPreset(data);
  if (!result) return false;
  store.apply(resolvePreset({ name: result.name, params: result.params }));
  saved = [...saved.filter((s) => s.name !== result.name), { name: result.name, params: snapshot(store.params) }];
  if (!storeSaved(saved)) flash('Could not save — browser storage is blocked');
  renderPresets();

  const lines = [`Imported “${result.name}” and saved it below.`];
  if (result.approximated.length) lines.push(`Approximated: ${result.approximated.join(', ')}.`);
  if (result.skipped.length) lines.push(`Not available here: ${result.skipped.join(', ')}.`);
  showReport(lines);
  flash(`Imported “${result.name}”`);
  return true;
}

presetPicker.addEventListener('change', () => {
  const file = presetPicker.files?.[0];
  presetPicker.value = '';
  if (file) void importPresetFile(file).then((ok) => ok || flash(`${file.name} is not a preset file`));
});

// ---------- export ----------

/** Download the current look; it takes the name typed in the box, if any. */
function exportLook(): void {
  const name = presetName.value.trim() || 'Look';
  download(new Blob([presetFile({ name, params: snapshot(store.params) })], { type: 'application/json' }), presetFileName(name));
}

function exportSaved(): void {
  if (!saved.length) return;
  download(new Blob([presetListFile(saved)], { type: 'application/json' }), 'presets.json');
}

const exportAllBtn = button('Export saved', exportSaved, 'btn small share-btn');
exportAllBtn.title = 'Download every saved preset in one file';

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

/** Apply settings from a `#s=…` share link in the address bar, if there is one. */
export function applyShareLink(): void {
  const shared = decodeShare(location.hash);
  if (shared) {
    store.apply(shared);
    flash('Loaded shared settings');
  }
}

/** A random look within ranges that keep the picture readable (Undo brings the previous one back). */
function surprise(): void {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  store.apply(resolvePreset({ name: 'Surprise', params: randomLook(rng(seed)) }));
}

export const presetsSection = section(
  'Presets',
  builtInGrid,
  el('div', { class: 'btn-row' }, button('Surprise me', surprise, 'btn small share-btn')),
  savedHead,
  savedGrid,
  el('div', { class: 'save-row' }, presetName, button('Save', savePreset, 'btn small')),
  el(
    'div',
    { class: 'btn-row' },
    button('Copy share link', () => void copyShareLink(), 'btn small share-btn'),
    button('Import preset…', () => presetPicker.click(), 'btn small share-btn'),
    button('Export look', exportLook, 'btn small share-btn'),
    exportAllBtn,
  ),
  importReport,
  presetPicker,
);
renderPresets();
