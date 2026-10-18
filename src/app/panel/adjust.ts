import { ADJUST_KEYS, ADJUST_SLIDERS } from '../../state';
import { button, el, section, showWhen, slider, toggle } from '../../ui/controls';
import { store } from '../core';

/** Subheads placed before these sliders. */
const HEADS: Record<string, string> = { shadows: 'Tone', saturation: 'Colour', sharpen: 'Detail' };

export const adjustSection = section(
  'Adjust',
  ...ADJUST_SLIDERS.flatMap((s) => [
    ...(HEADS[s.key] ? [el('div', { class: 'subhead' }, HEADS[s.key])] : []),
    s.key === 'pixelSize' ? showWhen(slider(s, store), store, (p) => p.mode === 'dither') : slider(s, store),
  ]),
  toggle('invert', 'Invert', store),
);
adjustSection.head.append(button('Reset', () => store.reset(ADJUST_KEYS), 'link'));
