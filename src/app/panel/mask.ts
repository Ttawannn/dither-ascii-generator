import { MASK_KEYS, MASK_MODES, MASK_OUTSIDE, MASK_SLIDERS, type Params } from '../../state';
import { button, colorInput, el, section, select, showWhen, slider, toggle } from '../../ui/controls';
import { requestRender, rt, store } from '../core';

// Limit the result to part of the picture, chosen by brightness or colour on the source.

const on = (p: Params) => p.maskMode !== 'off';
const maskSlider = (name: keyof typeof MASK_SLIDERS, when: (p: Params) => boolean) =>
  showWhen(slider(MASK_SLIDERS[name], store), store, when);

const viewBtn = button('Show mask', () => setMaskView(!rt.showMask), 'btn small');
viewBtn.title = 'See the mask in black and white (white = effect)';

function setMaskView(next: boolean): void {
  rt.showMask = next;
  viewBtn.classList.toggle('on', next);
  viewBtn.textContent = next ? 'Show result' : 'Show mask';
  requestRender();
}
// Turning the mask off also leaves the mask view.
store.subscribe((p, changed) => changed === 'maskMode' && !on(p) && rt.showMask && setMaskView(false));

export const maskSection = section(
  'Mask',
  select('maskMode', 'Mask by', MASK_MODES.map((m) => ({ value: m.id, label: m.label })), store),
  maskSlider('low', (p) => p.maskMode === 'luma'),
  maskSlider('high', (p) => p.maskMode === 'luma'),
  maskSlider('hue', (p) => p.maskMode === 'hue'),
  maskSlider('hueWidth', (p) => p.maskMode === 'hue'),
  showWhen(
    el(
      'div',
      {},
      slider(MASK_SLIDERS.feather, store),
      toggle('maskInvert', 'Invert mask', store),
      select('maskOutside', 'Outside the mask', MASK_OUTSIDE.map((m) => ({ value: m.id, label: m.label })), store),
      showWhen(el('div', { class: 'color-row single' }, colorInput('maskColor', 'Colour', store)), store, (p) => p.maskOutside === 'color'),
      el('div', { class: 'pal-actions' }, viewBtn),
      el('div', { class: 'note' }, 'Measured on the original image; applied after the effects'),
    ),
    store,
    on,
  ),
);
maskSection.head.append(button('Reset', () => store.reset(MASK_KEYS), 'link'));
