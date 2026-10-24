import { download } from '../../export/png';
import { importPreset, importPresetList } from '../../preset-import';
import { randomLook, rng } from '../../random-look';
import { ADJUST_LOCK_KEYS, LOCK_GROUPS, protectLook } from '../../locks';
import { getLocks, onLocksChange, toggleKeys } from '../locks';
import {
  BUILT_IN,
  decodeShare,
  encodeShare,
  loadSaved,
  presetFile,
  presetFileName,
  presetListFile,
  blendLook,
  PRESET_KEYS,
  presetCategory,
  resolvePreset,
  snapshot,
  type PresetCategory,
  storeSaved,
  type Preset,
} from '../../presets';
import { ADJUST_SLIDERS, DEFAULTS, type Params } from '../../state';
import { button, editableRange, el, section } from '../../ui/controls';
import { favourites, onFavouritesChange, toggleFavourite } from '../../favourites';
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

// ---------- strength ----------

// After a preset is picked, Strength moves its numbers between the defaults and the preset. Any
// other change to the look ends that (the slider hides) so it never undoes the user's edits.
let picked: Partial<Params> | null = null;
let blending = false;
const strengthInput = el('input', { type: 'range', min: '0', max: '100', step: '1', value: '100', 'aria-label': 'Preset strength' });
const strengthValue = el('span', { class: 'control-value' }, '100%');
const strengthRow = el(
  'div',
  { class: 'control strength-row', hidden: '' },
  el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, 'Strength'), strengthValue),
  strengthInput,
);
strengthInput.addEventListener('pointerdown', () => actions.beginUndo());
strengthInput.addEventListener('input', () => {
  if (!picked) return;
  const s = Number(strengthInput.value);
  strengthValue.textContent = `${s}%`;
  strengthInput.style.setProperty('--fill', `${s}%`);
  blending = true;
  store.apply(blendLook(picked, s / 100));
  blending = false;
});
editableRange(strengthRow, strengthInput, strengthValue, (value) => {
  strengthInput.value = `${value}`;
  strengthInput.dispatchEvent(new Event('input'));
});
store.subscribe((_, changed) => {
  if (!blending && picked && PRESET_KEYS.includes(changed)) {
    picked = null;
    strengthRow.hidden = true;
  }
});

function pickPreset(params: Partial<Params>): void {
  actions.beginUndo();
  blending = true;
  store.apply(params);
  blending = false;
  picked = params;
  strengthInput.value = '100';
  strengthValue.textContent = '100%';
  strengthInput.style.setProperty('--fill', '100%');
  strengthRow.hidden = false;
}

/** Search all presets independently of the visible grid's filter. */
export const searchablePresets = () => [...BUILT_IN, ...saved].map((p) => ({
  label: p.name,
  choose: () => pickPreset(resolvePreset(p)),
}));

// ---------- filter ----------

type Filter = 'all' | PresetCategory | 'favourites';
let filter: Filter = 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dither', label: 'Dither' },
  { id: 'ascii', label: 'ASCII' },
  { id: 'animated', label: 'Animated' },
  { id: 'favourites', label: '★' },
];
const filterRow = el('div', { class: 'preset-filter', role: 'group', 'aria-label': 'Show presets' });
const filterButtons = FILTERS.map((f) => {
  const b = button(f.label, () => {
    filter = f.id;
    renderPresets();
  }, 'chip');
  if (f.id === 'favourites') b.setAttribute('aria-label', 'Favourites');
  filterRow.append(b);
  return b;
});
const favKey = (preset: Preset, own: boolean) => `${own ? 's' : 'b'}:${preset.name}`;
onFavouritesChange(() => renderPresets());

function chip(preset: Preset, own = false): HTMLElement {
  const params = resolvePreset(preset);
  const key = JSON.stringify(params);
  let canvas = thumbCanvases.get(key);
  if (!canvas) {
    canvas = el('canvas', { class: 'chip-thumb', hidden: '' });
    thumbCanvases.set(key, canvas);
  }
  thumbList.push({ params, canvas });
  const b = button('', () => pickPreset(params), 'chip preset-chip');
  // Preset names are names, not UI text: they stay as they are in every language.
  b.setAttribute('translate', 'no');
  b.append(canvas, el('span', { class: 'chip-name' }, preset.name));
  b.title = preset.name;
  const id = favKey(preset, own);
  const starred = favourites('preset').includes(id);
  const star = button(starred ? '★' : '☆', () => toggleFavourite('preset', id), 'chip-star');
  star.setAttribute('aria-pressed', `${starred}`);
  star.setAttribute('aria-label', starred ? 'Remove from favourites' : 'Add to favourites');
  star.title = star.getAttribute('aria-label')!;
  return el('span', { class: 'chip-wrap' }, b, star);
}

function renderPresets(): void {
  thumbList = [];
  const favs = favourites('preset');
  const shown = BUILT_IN.filter((p) =>
    filter === 'all' ? true : filter === 'favourites' ? favs.includes(favKey(p, false)) : presetCategory(resolvePreset(p)) === filter,
  );
  filterButtons.forEach((b, i) => b.classList.toggle('active', FILTERS[i].id === filter));
  builtInGrid.replaceChildren(...shown.map((p) => chip(p)));
  // Under Favourites, saved looks that are starred show too.
  const savedShown = filter === 'favourites' ? saved.filter((p) => favs.includes(favKey(p, true))) : saved;
  savedGrid.replaceChildren(
    ...savedShown.map((preset) => {
      const wrap = chip(preset, true);
      wrap.append(
        button('×', () => {
          saved = saved.filter((s) => s !== preset);
          storeSaved(saved);
          renderPresets();
        }, 'chip chip-x'),
      );
      return wrap;
    }),
  );
  if (!shown.length && !savedShown.length) builtInGrid.append(el('div', { class: 'note' }, 'No favourites yet — star a preset'));
  savedHead.hidden = savedGrid.hidden = savedShown.length === 0;
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
  actions.beginUndo();
  store.apply(protectLook(store.params, resolvePreset({ name: 'Surprise', params: randomLook(rng(seed)) }), getLocks()));
}

const groupLocks = LOCK_GROUPS.map((group) => {
  const b = button(group.label, () => { actions.beginUndo(); toggleKeys(group.keys); }, 'chip');
  b.title = 'Lock during shuffle';
  const sync = () => { const locked = group.keys.every((k) => getLocks().keys.includes(k)); b.classList.toggle('active', locked); b.setAttribute('aria-pressed', `${locked}`); };
  onLocksChange(sync); sync(); return b;
});
function shuffleAdjustments(): void {
  const random = rng(crypto.getRandomValues(new Uint32Array(1))[0]);
  const next: Record<string, unknown> = {};
  for (const s of ADJUST_SLIDERS) {
    const span = (s.max - s.min) * 0.2;
    const lo = Math.max(s.min, DEFAULTS[s.key] - span), hi = Math.min(s.max, DEFAULTS[s.key] + span);
    next[s.key] = +((Math.round((lo + random() * (hi - lo)) / s.step)) * s.step).toFixed(3);
  }
  for (const k of ADJUST_LOCK_KEYS) if (typeof DEFAULTS[k] === 'boolean') next[k] = random() < 0.25;
  actions.beginUndo(); store.apply(protectLook(store.params, next as Partial<Params>, getLocks()));
}

export const presetsSection = section(
  'Presets',
  filterRow,
  builtInGrid,
  strengthRow,
  el('div', { class: 'btn-row' }, button('Surprise me', surprise, 'btn small share-btn')),
  el('div', { class: 'btn-row' }, button('Shuffle adjustments', shuffleAdjustments, 'btn small')),
  el('div', { class: 'note' }, 'Keep during shuffle'),
  el('div', { class: 'btn-row' }, ...groupLocks),
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
