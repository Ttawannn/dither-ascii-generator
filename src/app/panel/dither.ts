import { ALGORITHMS, GROUP_LABELS } from '../../pipeline/algorithms';
import { getPaletteDef, MONO_PRESETS, PALETTES } from '../../pipeline/palettes';
import { DITHER_SLIDERS, type Params } from '../../state';
import { colorInput, colorPresets, el, select, showWhen, slider, swatches, toggle } from '../../ui/controls';
import { group, store } from '../core';

const ditherSlider = (key: keyof typeof DITHER_SLIDERS, when: (p: Params) => boolean) =>
  showWhen(slider(DITHER_SLIDERS[key], store), store, when);

/** Colour chips of the current palette; filled by dither-view.ts. */
export const paletteSwatches = swatches();

const monoPresets = colorPresets(MONO_PRESETS, (ink, paper) => {
  store.set('ink', ink);
  store.set('paper', paper);
});

export const ditherControls = showWhen(
  el(
    'div',
    {},
    select(
      'algorithm',
      'Algorithm',
      ALGORITHMS.map((a) => ({ value: a.id, label: a.label, group: GROUP_LABELS[a.group] })),
      store,
    ),
    ditherSlider('strength', (p) => group(p) === 'ordered' || group(p) === 'pattern' || p.algorithm === 'noise'),
    ditherSlider('cellSize', (p) => group(p) === 'pattern'),
    ditherSlider('angle', (p) => group(p) === 'pattern'),
    ditherSlider('threshold', (p) => p.algorithm === 'threshold'),
    ditherSlider('diffusion', (p) => group(p) === 'diffusion'),
    showWhen(toggle('serpentine', 'Serpentine', store), store, (p) => group(p) === 'diffusion'),
    el('div', { class: 'subhead' }, 'Palette'),
    select(
      'palette',
      'Palette',
      PALETTES.map((p) => ({ value: p.id, label: p.label })),
      store,
    ),
    paletteSwatches.root,
    ditherSlider('levels', (p) => !!getPaletteDef(p.palette).uses.levels),
    showWhen(
      el(
        'div',
        {},
        el('div', { class: 'color-row' }, colorInput('ink', 'Ink', store), colorInput('paper', 'Paper', store)),
        monoPresets,
      ),
      store,
      (p) => !!getPaletteDef(p.palette).uses.inkPaper,
    ),
  ),
  store,
  (p) => p.mode === 'dither',
);
