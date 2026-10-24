import { LAYER_BLENDS, newLayer, serializeLayer } from '../../layers';
import { ADJUST_SLIDERS, readLayer } from '../../state';
import { button, editableRange, el, section, segmented, showWhen, slider } from '../../ui/controls';
import { store } from '../core';
import { layerStore } from '../layer-store';
import { asciiControlsFor } from './ascii';
import { ditherControlsFor } from './dither';

// Layer 2: a second rendering blended over the first. Its dither / ASCII settings use the same
// controls as layer 1, bound to layerStore; the switches below are the layer's own.

const isOn = () => !!readLayer(store.params)?.on;

const onSwitch = el(
  'button',
  { class: 'toggle control', type: 'button', role: 'switch' },
  el('span', { class: 'control-label' }, 'Layer 2'),
  el('span', { class: 'box' }),
);
onSwitch.addEventListener('click', () => {
  const layer = readLayer(store.params);
  // First time on: start from a fresh layer (ASCII over the current look).
  store.set('layer2', serializeLayer(layer ? { ...layer, on: !layer.on } : newLayer()));
});

const blendSelect = el('select', { 'aria-label': 'Layer 2 blend' });
for (const b of LAYER_BLENDS) blendSelect.append(el('option', { value: b.id }, b.label));
blendSelect.addEventListener('change', () => layerStore.setLayer({ blend: blendSelect.value }));

const opacityValue = el('span', { class: 'control-value' });
const opacityInput = el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Layer 2 opacity' });
opacityInput.addEventListener('input', () => layerStore.setLayer({ opacity: Number(opacityInput.value) }));

const maskOnlyBtn = el(
  'button',
  { class: 'toggle control', type: 'button', role: 'switch' },
  el('span', { class: 'control-label' }, 'Mask this layer only'),
  el('span', { class: 'box' }),
);
maskOnlyBtn.title = 'The Mask decides where layer 2 shows, instead of limiting the whole result';
maskOnlyBtn.addEventListener('click', () => layerStore.setLayer({ maskOnly: !layerStore.layer.maskOnly }));

/** Update the switches in place (rebuilding would drop a slider that is being dragged). */
function sync(): void {
  const layer = layerStore.layer;
  const on = isOn();
  onSwitch.classList.toggle('on', on);
  onSwitch.setAttribute('aria-checked', `${on}`);
  blendSelect.value = layer.blend;
  if (document.activeElement !== opacityInput) opacityInput.value = `${layer.opacity}`;
  opacityValue.textContent = `${layer.opacity}%`;
  opacityInput.style.setProperty('--fill', `${layer.opacity}%`);
  maskOnlyBtn.classList.toggle('on', layer.maskOnly);
  maskOnlyBtn.setAttribute('aria-checked', `${layer.maskOnly}`);
}
store.subscribe((_, changed) => changed === 'layer2' && sync());
sync();

const pixelSize = ADJUST_SLIDERS.find((s) => s.key === 'pixelSize')!;

const body = showWhen(
  el(
    'div',
    {},
    segmented(
      'mode',
      [
        { value: 'dither', label: 'Dither' },
        { value: 'ascii', label: 'ASCII' },
      ],
      layerStore,
    ),
    el(
      'label',
      { class: 'control' },
      el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, 'Blend')),
      el('div', { class: 'select' }, blendSelect),
    ),
    el(
      'div',
      { class: 'control' },
      el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, 'Opacity'), opacityValue),
      opacityInput,
    ),
    showWhen(maskOnlyBtn, store, (p) => p.maskMode !== 'off'),
    showWhen(slider(pixelSize, layerStore), layerStore, (p) => p.mode === 'dither'),
    ditherControlsFor(layerStore),
    asciiControlsFor(layerStore),
  ),
  store,
  isOn,
  () => { if (!isOn()) onSwitch.click(); },
);
editableRange(opacityInput.parentElement!, opacityInput, opacityValue, (value) => layerStore.setLayer({ opacity: value }));

export const layerSection = section('Layer 2', onSwitch, body);
layerSection.head.append(
  button(
    'Reset',
    () => {
      // Back to the layer defaults, keeping it on and in its current mode.
      const layer = layerStore.layer;
      store.set('layer2', serializeLayer({ ...newLayer(), on: layer.on, params: { mode: layerStore.params.mode } }));
    },
    'link',
  ),
);
