import { History } from '../history';
import { PRESET_KEYS, snapshot } from '../presets';
import type { Params } from '../state';
import { button } from '../ui/controls';
import { store } from './core';
import { flash, header } from './shell';

// Undo / redo for the look (the preset-controlled settings). Opening another source and export
// settings are not part of it.

const history = new History<Partial<Params>>(snapshot(store.params));
let restoring = false;

const undoBtn = button('↶', () => undo(), 'btn small history-btn');
const redoBtn = button('↷', () => redo(), 'btn small history-btn');
undoBtn.title = 'Undo (Ctrl+Z)';
redoBtn.title = 'Redo (Ctrl+Shift+Z)';
header.insertBefore(redoBtn, header.querySelector('.theme-btn'));
header.insertBefore(undoBtn, redoBtn);

function sync(): void {
  undoBtn.disabled = !history.canUndo;
  redoBtn.disabled = !history.canRedo;
}

store.subscribe((p, changed) => {
  if (restoring || !PRESET_KEYS.includes(changed)) return;
  history.change(snapshot(p), performance.now());
  sync();
});

function restore(state: Partial<Params> | null, what: string): void {
  if (!state) return;
  restoring = true;
  store.apply(state);
  restoring = false;
  sync();
  flash(what);
}

export const undo = () => restore(history.undo(), 'Undo');
export const redo = () => restore(history.redo(), 'Redo');
sync();
