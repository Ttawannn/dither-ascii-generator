import { EXPORT_FORMATS, EXPORT_SLIDERS, EXPORT_UNITS, isAnimatedFormat } from '../../state';
import { button, el, section, select, showWhen, slider, toggle } from '../../ui/controls';
import { actions, store } from '../core';

/** Size / frame-count summary under the export settings; filled by exporting.ts. */
export const exportInfo = el('div', { class: 'note export-info' });

const still = (p: { exportFormat: string }) => !isAnimatedFormat(p.exportFormat);
const VECTOR_DOTS = ['halftone', 'halftone-cmyk'];

const batchPicker = el('input', { type: 'file', accept: 'image/*', multiple: '', hidden: '' });
batchPicker.addEventListener('change', () => {
  const files = [...(batchPicker.files ?? [])];
  batchPicker.value = '';
  if (files.length) void actions.batchExport(files);
});
export const batchBtn = button('Batch…', () => batchPicker.click(), 'btn small');
batchBtn.title = 'Choose several images: each is saved with this look, together in one .zip';

export const exportSection = section(
  'Export',
  select(
    'exportFormat',
    'Format',
    EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label })),
    store,
  ),
  slider(EXPORT_SLIDERS.scale, store),
  showWhen(slider(EXPORT_SLIDERS.duration, store), store, (p) => isAnimatedFormat(p.exportFormat)),
  showWhen(slider(EXPORT_SLIDERS.fps, store), store, (p) => isAnimatedFormat(p.exportFormat)),
  showWhen(
    toggle('exportVectorDots', 'Vector dots', store),
    store,
    (p) => p.exportFormat === 'svg' && p.mode === 'dither' && VECTOR_DOTS.includes(p.algorithm),
  ),
  showWhen(toggle('exportPrint', 'Print size', store), store, still),
  showWhen(slider(EXPORT_SLIDERS.dpi, store), store, (p) => still(p) && p.exportPrint),
  showWhen(
    select('exportUnit', 'Unit', EXPORT_UNITS.map((u) => ({ value: u.id, label: u.label })), store),
    store,
    (p) => still(p) && p.exportPrint,
  ),
  exportInfo,
  showWhen(el('div', { class: 'pal-actions' }, batchBtn, batchPicker), store, still),
);

export const exportBtn = button('Export', () => void actions.exportClick(), 'btn primary');
const textExports = [
  button('Copy', () => void actions.copyText(), 'btn small'),
  button('.txt', () => actions.exportText(), 'btn small'),
  button('.html', () => actions.exportHtml(), 'btn small'),
];

/** Export buttons are only usable once a source is loaded. */
export function setExportEnabled(on: boolean): void {
  for (const b of [exportBtn, ...textExports]) b.disabled = !on;
}
setExportEnabled(false);

/** The fixed bottom of the panel: the export button, plus text exports in ASCII mode. */
export const exportFoot = el(
  'div',
  { class: 'panel-foot' },
  exportBtn,
  showWhen(el('div', { class: 'export-row' }, ...textExports), store, (p) => p.mode === 'ascii'),
);
