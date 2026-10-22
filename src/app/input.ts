import { isImageFile } from '../source/image';
import { actions, store } from './core';
import { renderer, viewer } from './gpu';
import { importPaletteFile, importPaletteFiles, isPaletteFile } from './panel/custom-palette';
import { importPresetFile } from './panel/presets';
import { setOriginal } from './render';
import { toggleSplit } from './split';
import { redo, undo } from './undo';
import { openFile } from './sources';
import { toggleLang } from './lang';
import { fileInput, flash, stage, toggleHelp, toggleTheme, transport } from './shell';

// File picker, drag and drop, paste, and keyboard shortcuts.

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
  const files = [...(e.dataTransfer?.files ?? [])];
  // Several palette files (or a .zip) go to the palette library together.
  if (files.length > 1 && files.every(isPaletteFile)) void importPaletteFiles(files);
  else void openDropped(files[0]);
});

/** Presets (.preset, or .json shaped like one), palette files, otherwise an image or video. */
async function openDropped(file: File | undefined): Promise<void> {
  if (!file) return;
  if (/\.dither-project$/i.test(file.name)) return actions.openProject(file);
  if (/\.(preset|json)$/i.test(file.name) && (await importPresetFile(file))) return;
  if (/\.preset$/i.test(file.name)) return flash(`${file.name} is not a preset file`);
  if (isPaletteFile(file)) return importPaletteFile(file);
  return openFile(file);
}

window.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files ?? [])].find(isImageFile);
  if (file) void openFile(file);
});

// Keys typed into these elements belong to them, not to our shortcuts.
const ownsKeys = (t: EventTarget | null) =>
  t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type !== 'range' && t.type !== 'checkbox');

window.addEventListener('keydown', (e) => {
  // Text fields keep their own undo.
  const textField = e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target.type === 'text');
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !textField) {
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo();
      else undo();
      return;
    }
  }
  if (ownsKeys(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space' && renderer.hasSource) {
    e.preventDefault();
    setOriginal(true);
  } else if (e.key === 's') {
    toggleSplit();
  } else if (e.key === 'f') {
    viewer.fit();
  } else if (e.key === '1') {
    viewer.setZoom(1);
  } else if (e.key === 'k') {
    transport.toggle();
  } else if (e.key === '[') {
    transport.mark('in');
  } else if (e.key === ']') {
    transport.mark('out');
  } else if (e.key === 'd') {
    store.set('mode', 'dither');
  } else if (e.key === 'a') {
    store.set('mode', 'ascii');
  } else if (e.key === 'b') {
    store.set('animate', !store.params.animate);
  } else if (e.key === 'o') {
    fileInput.click();
  } else if (e.key === 'e') {
    void actions.exportClick();
  } else if (e.key === 't') {
    toggleTheme();
  } else if (e.key === 'l') {
    toggleLang();
  } else if (e.key === '?') {
    toggleHelp();
  } else if (e.key === 'Escape') {
    toggleHelp(false);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !ownsKeys(e.target)) {
    e.preventDefault(); // stop a focused button from being "clicked" by Space
    setOriginal(false);
  }
});
window.addEventListener('blur', () => setOriginal(false));
