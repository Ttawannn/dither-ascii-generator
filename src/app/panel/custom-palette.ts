import { loadLibrary, mergeLibrary, storeLibrary, type LibraryPalette } from '../../palette-library';
import { parsePaletteFile } from '../../pipeline/palette-file';
import { MAX_PALETTE, parseColorList, serializeColorList } from '../../pipeline/palettes';
import type { ParamStore } from '../../state';
import { button, el, toggle } from '../../ui/controls';
import { readZip } from '../../zip';
import { store } from '../core';
import { flash } from '../shell';

// Editor for the custom palette (`customPalette`): colour chips, a hex list, file import, and a
// library of palettes kept in this browser. The dither and ASCII panels each get their own
// instance; both edit the same param and show the same library.

const PALETTE_FILE = /\.(json|hex|gpl|txt)$/i;
export const isPaletteFile = (file: File) => PALETTE_FILE.test(file.name) || /\.zip$/i.test(file.name);

// `s` is the page store (layer 1) or layer 2's store.
const colorsOf = (s: ParamStore) => parseColorList(s.params.customPalette);
const setColorsOf = (s: ParamStore, list: string[]) => s.set('customPalette', serializeColorList(list));

/** Make the custom palette the active one in the current mode. */
function useCustom(s: ParamStore): void {
  if (s.params.mode === 'dither') {
    s.set('palette', 'custom');
  } else {
    s.set('asciiColor', 'palette');
    s.set('asciiPalette', 'custom');
  }
}

// ---------- library ----------

let library = loadLibrary();
const libraryListeners = new Set<() => void>();

function setLibrary(next: LibraryPalette[]): void {
  library = next;
  if (!storeLibrary(library)) flash('Could not save the palette library — browser storage is blocked');
  for (const fn of libraryListeners) fn();
}

/** Palettes in one file, or in every palette file of a .zip (system files skipped). */
async function readPalettes(file: File): Promise<LibraryPalette[]> {
  const fromText = (text: string, fileName: string): LibraryPalette | null => {
    const parsed = parsePaletteFile(text);
    if (!parsed) return null;
    const base = fileName.split('/').pop()!.replace(PALETTE_FILE, '');
    return { name: (parsed.name ?? base).slice(0, 60), colors: parsed.colors };
  };
  if (/\.zip$/i.test(file.name)) {
    const entries = await readZip(new Uint8Array(await file.arrayBuffer()));
    const decoder = new TextDecoder();
    return entries
      .filter((e) => PALETTE_FILE.test(e.name) && !/(^|\/)(__MACOSX\/|\.)/.test(e.name))
      .map((e) => fromText(decoder.decode(e.data), e.name))
      .filter((p): p is LibraryPalette => p !== null);
  }
  const one = fromText(await file.text(), file.name);
  return one ? [one] : [];
}

/**
 * Import palette files (.json/.hex/.gpl/.txt or a .zip of them) into the library. A single palette
 * also becomes the custom palette right away; several are just added to the list.
 */
export async function importPaletteFiles(files: File[], s: ParamStore = store): Promise<void> {
  const found: LibraryPalette[] = [];
  for (const file of files) {
    try {
      found.push(...(await readPalettes(file)));
    } catch {
      flash(`Could not read ${file.name}`);
    }
  }
  if (!found.length) {
    flash(`No colours found in ${files.map((f) => f.name).join(', ')}`);
    return;
  }
  setLibrary(mergeLibrary(library, found));
  if (found.length === 1) {
    setColorsOf(s, found[0].colors);
    useCustom(s);
    flash(`Palette “${found[0].name}”: ${found[0].colors.length} colours`);
  } else {
    flash(`Added ${found.length} palettes to the library`);
  }
}

export const importPaletteFile = (file: File) => importPaletteFiles([file]);

// ---------- editor ----------

export function customPaletteEditor(s: ParamStore = store): HTMLElement {
  const colors = () => colorsOf(s);
  const setColors = (list: string[]) => setColorsOf(s, list);
  const chips = el('div', { class: 'pal-chips' });
  const text = el('input', {
    type: 'text',
    spellcheck: 'false',
    'aria-label': 'Palette colours (hex)',
    title: 'Hex colours separated by spaces; paste a list here',
  });
  const picker = el('input', {
    type: 'file',
    accept: '.json,.hex,.gpl,.txt,.zip,application/json,text/plain,application/zip',
    multiple: '',
    hidden: '',
  });

  function chip(hex: string, i: number): HTMLElement {
    const input = el('input', { type: 'color', 'aria-label': `Colour ${i + 1}` });
    input.value = hex;
    input.addEventListener('input', () => {
      const list = colors();
      list[i] = input.value;
      setColors(list);
    });
    const remove = button('×', () => {
      const list = colors();
      if (list.length > 2) setColors(list.filter((_, j) => j !== i));
    }, 'pal-chip-x');
    remove.title = 'Remove colour';
    return el('span', { class: 'pal-chip' }, input, remove);
  }

  const add = button('+', () => {
    const list = colors();
    setColors([...list, list[list.length - 1] ?? '#808080']);
  }, 'pal-chip-add');
  add.title = 'Add colour';

  function sync(): void {
    const list = colors();
    const inputs = [...chips.querySelectorAll<HTMLInputElement>('input[type=color]')];
    if (inputs.length === list.length) {
      // Same count: update in place so an open colour picker stays attached.
      inputs.forEach((input, i) => input.value !== list[i] && (input.value = list[i]));
    } else {
      chips.replaceChildren(...list.map(chip), add);
    }
    chips.classList.toggle('at-min', list.length <= 2);
    add.disabled = list.length >= MAX_PALETTE;
    if (document.activeElement !== text) text.value = list.join(' ');
  }

  text.addEventListener('change', () => {
    const list = parseColorList(text.value);
    if (list.length >= 2) setColors(list);
    else flash('A palette needs at least two hex colours');
    text.value = colors().join(' ');
  });

  picker.addEventListener('change', () => {
    const files = [...(picker.files ?? [])];
    picker.value = '';
    if (files.length) void importPaletteFiles(files, s);
  });

  const sort = button('Sort', () => {
    const luma = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    setColors(colors().sort((a, b) => luma(a) - luma(b)));
  }, 'btn small');
  sort.title = 'Order colours dark → light';

  // Library: search, click a row to use it, × to remove, save the current palette under a name.
  const search = el('input', { type: 'text', spellcheck: 'false', placeholder: 'Search', 'aria-label': 'Search palettes' });
  const saveName = el('input', { type: 'text', maxlength: '60', placeholder: 'Name', 'aria-label': 'Palette name' });
  const list = el('div', { class: 'pal-lib-list' });
  const summary = el('summary', {});
  const details = el('details', { class: 'pal-lib' }, summary);

  function renderLibrary(): void {
    summary.textContent = `Library (${library.length})`;
    const q = search.value.trim().toLowerCase();
    const shown = library.filter((p) => !q || p.name.toLowerCase().includes(q)).reverse();
    list.replaceChildren(
      ...shown.map((p) => {
        const use = el(
          'button',
          { class: 'pal-lib-row', type: 'button', title: `Use “${p.name}”` },
          el('span', { class: 'pal-lib-name', translate: 'no' }, p.name),
          el('span', { class: 'pal-lib-swatches' }, ...p.colors.map((c) => el('span', { style: `background:${c}` }))),
        );
        use.addEventListener('click', () => {
          setColors(p.colors);
          useCustom(s);
          flash(`Palette “${p.name}”`);
        });
        const remove = button('×', () => setLibrary(library.filter((x) => x !== p)), 'pal-lib-x');
        remove.title = 'Remove from the library';
        return el('div', { class: 'pal-lib-item' }, use, remove);
      }),
      ...(shown.length ? [] : [el('div', { class: 'note' }, library.length ? 'No match' : 'Import palette files or a .zip to fill the library')]),
    );
  }

  function saveCurrent(): void {
    const name = saveName.value.trim() || `Palette ${library.length + 1}`;
    setLibrary(mergeLibrary(library, [{ name, colors: colors() }]));
    saveName.value = '';
    flash(`Saved “${name}” to the library`);
  }
  saveName.addEventListener('keydown', (e) => e.key === 'Enter' && saveCurrent());
  search.addEventListener('input', renderLibrary);
  libraryListeners.add(renderLibrary);
  renderLibrary();

  details.append(
    search,
    list,
    el('div', { class: 'save-row' }, saveName, button('Save', saveCurrent, 'btn small')),
  );

  s.subscribe((_, changed) => changed === 'customPalette' && sync());
  sync();

  return el(
    'div',
    { class: 'pal-editor' },
    chips,
    text,
    el('div', { class: 'pal-actions' }, button('Import files…', () => picker.click(), 'btn small'), sort),
    toggle('customRamp', 'Match by brightness', s),
    details,
    picker,
  );
}
