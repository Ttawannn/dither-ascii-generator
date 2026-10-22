import { History } from '../history';
import { PRESET_KEYS, snapshot } from '../presets';
import { button } from '../ui/controls';
import { actions, store } from './core';
import { getLocks, onLocksChange, setLocks } from './locks';
import { flash, header } from './shell';

// Undo / redo for the look (the preset-controlled settings). Opening another source and export
// settings are not part of it.

const capture = () => ({ params: snapshot(store.params), locks: getLocks() });
const history = new History(capture());
actions.beginUndo = () => history.beginStep();
actions.beginUndoGesture = () => history.beginGroup();
actions.endUndoGesture = () => history.endGroup();
actions.resetHistory = () => { history.clear(capture()); sync(); };
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
  history.change({ params: snapshot(p), locks: getLocks() }, performance.now());
  sync();
});

onLocksChange(() => {
  if (restoring) return;
  history.change(capture(), performance.now()); sync();
});

function restore(state: ReturnType<typeof capture> | null, what: string): void {
  if (!state) return;
  restoring = true;
  store.apply(state.params);
  setLocks(state.locks);
  restoring = false;
  sync();
  flash(what);
}

export const undo = () => restore(history.undo(), 'Undo');
export const redo = () => restore(history.redo(), 'Redo');
sync();
