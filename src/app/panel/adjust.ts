import { ADJUST_KEYS, ADJUST_SLIDERS } from '../../state';
import { button, el, section, showWhen, slider, toggle } from '../../ui/controls';
import { actions, store } from '../core';
import { getLocks, onLocksChange, toggleKeys } from '../locks';

function lockable(control: HTMLElement, key: string): HTMLElement {
  const b = button('○', () => { actions.beginUndo(); toggleKeys([key]); }, 'link lock-btn');
  b.title = 'Lock during shuffle';
  b.setAttribute('aria-label', `Lock during shuffle · ${control.querySelector('.control-label')?.textContent ?? key}`);
  const sync = () => { const locked = getLocks().keys.includes(key); b.textContent = locked ? '●' : '○'; b.setAttribute('aria-pressed', `${locked}`); };
  onLocksChange(sync); sync();
  b.addEventListener('dblclick', (e) => e.stopPropagation());
  const row = control.querySelector('.control-row');
  if (row) row.append(b);
  else return el('div', { class: 'btn-row' }, control, b);
  return control;
}

/** Subheads placed before these sliders. */
const HEADS: Record<string, string> = { shadows: 'Tone', saturation: 'Colour', sharpen: 'Detail' };

export const adjustSection = section(
  'Adjust',
  ...ADJUST_SLIDERS.flatMap((s) => [
    ...(HEADS[s.key] ? [el('div', { class: 'subhead' }, HEADS[s.key])] : []),
    s.key === 'pixelSize' ? showWhen(lockable(slider(s, store), s.key), store, (p) => p.mode === 'dither') : lockable(slider(s, store), s.key),
  ]),
  lockable(toggle('invert', 'Invert', store), 'invert'),
);
adjustSection.head.append(button('Reset', () => store.reset(ADJUST_KEYS), 'link'));
