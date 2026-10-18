import { parsePaletteFile } from '../../pipeline/palette-file';
import { MAX_PALETTE, parseColorList, serializeColorList } from '../../pipeline/palettes';
import { button, el, toggle } from '../../ui/controls';
import { store } from '../core';
import { flash } from '../shell';

// Editor for the custom palette (`customPalette`): colour chips, a hex list, and file import.
// The dither and ASCII panels each get their own instance; both edit the same param.

const PALETTE_FILE = /\.(json|hex|gpl|txt)$/i;
export const isPaletteFile = (file: File) => PALETTE_FILE.test(file.name);

const colors = () => parseColorList(store.params.customPalette);
const setColors = (list: string[]) => store.set('customPalette', serializeColorList(list));

/** Read a palette file, make it the custom palette, and switch the current mode to it. */
export async function importPaletteFile(file: File): Promise<void> {
  let parsed;
  try {
    parsed = parsePaletteFile(await file.text());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    flash(`No colours found in ${file.name}`);
    return;
  }
  setColors(parsed.colors);
  if (store.params.mode === 'dither') {
    store.set('palette', 'custom');
  } else {
    store.set('asciiColor', 'palette');
    store.set('asciiPalette', 'custom');
  }
  const name = parsed.name ?? file.name.replace(PALETTE_FILE, '');
  const dropped = parsed.dropped ? ` (first ${MAX_PALETTE}, ${parsed.dropped} left out)` : '';
  flash(`Palette “${name}”: ${parsed.colors.length} colours${dropped}`);
}

export function customPaletteEditor(): HTMLElement {
  const chips = el('div', { class: 'pal-chips' });
  const text = el('input', {
    type: 'text',
    spellcheck: 'false',
    'aria-label': 'Palette colours (hex)',
    title: 'Hex colours separated by spaces; paste a list here',
  });
  const picker = el('input', { type: 'file', accept: '.json,.hex,.gpl,.txt,application/json,text/plain', hidden: '' });

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
    const file = picker.files?.[0];
    picker.value = '';
    if (file) void importPaletteFile(file);
  });

  const sort = button('Sort', () => {
    const luma = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    setColors(colors().sort((a, b) => luma(a) - luma(b)));
  }, 'btn small');
  sort.title = 'Order colours dark → light';

  store.subscribe((_, changed) => changed === 'customPalette' && sync());
  sync();

  return el(
    'div',
    { class: 'pal-editor' },
    chips,
    text,
    el('div', { class: 'pal-actions' }, button('Import file…', () => picker.click(), 'btn small'), sort),
    toggle('customRamp', 'Match by brightness', store),
    picker,
  );
}
