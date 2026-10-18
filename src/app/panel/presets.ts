import { BUILT_IN, decodeShare, encodeShare, loadSaved, resolvePreset, snapshot, storeSaved, type Preset } from '../../presets';
import { button, el, section } from '../../ui/controls';
import { store } from '../core';
import { flash } from '../shell';

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

/** Apply settings from a `#s=…` share link in the address bar, if there is one. */
export function applyShareLink(): void {
  const shared = decodeShare(location.hash);
  if (shared) {
    store.apply(shared);
    flash('Loaded shared settings');
  }
}

export const presetsSection = section(
  'Presets',
  builtInGrid,
  savedHead,
  savedGrid,
  el('div', { class: 'save-row' }, presetName, button('Save', savePreset, 'btn small')),
  button('Copy share link', () => void copyShareLink(), 'btn small share-btn'),
);
renderPresets();
