import { EXPORT_FORMATS, EXPORT_SLIDERS, isAnimatedFormat } from '../../state';
import { button, el, section, select, showWhen, slider } from '../../ui/controls';
import { actions, store } from '../core';

/** Size / frame-count summary under the export settings; filled by exporting.ts. */
export const exportInfo = el('div', { class: 'note export-info' });

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
  exportInfo,
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
