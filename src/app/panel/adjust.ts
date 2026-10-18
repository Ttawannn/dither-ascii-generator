import { ADJUST_KEYS, ADJUST_SLIDERS } from '../../state';
import { button, section, showWhen, slider, toggle } from '../../ui/controls';
import { store } from '../core';

export const adjustSection = section(
  'Adjust',
  ...ADJUST_SLIDERS.map((s) =>
    s.key === 'pixelSize' ? showWhen(slider(s, store), store, (p) => p.mode === 'dither') : slider(s, store),
  ),
  toggle('invert', 'Invert', store),
);
adjustSection.head.append(button('Reset', () => store.reset(ADJUST_KEYS), 'link'));
