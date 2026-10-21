import { ALGORITHMS, FOLLOWS_IMAGE, GROUP_LABELS } from '../../pipeline/algorithms';
import { getPaletteDef, MONO_PRESETS, PALETTES } from '../../pipeline/palettes';
import { DITHER_SLIDERS, type ParamStore, type Params } from '../../state';
import { colorInput, colorPresets, el, select, showWhen, slider, swatches, toggle } from '../../ui/controls';
import { group, store } from '../core';
import { customPaletteEditor } from './custom-palette';

const cmyk = (p: Params) => p.algorithm === 'halftone-cmyk';

/** Colour chips of layer 1's palette; filled by dither-view.ts. */
export const paletteSwatches = swatches();

/**
 * Dither settings bound to `s`: the page store for layer 1, or layer 2's store. Only layer 1 shows
 * the palette swatches (they need the source image for "From image").
 */
export function ditherControlsFor(s: ParamStore, withSwatches = false): HTMLElement {
  const ditherSlider = (key: keyof typeof DITHER_SLIDERS, when: (p: Params) => boolean) =>
    showWhen(slider(DITHER_SLIDERS[key], s), s, when);

  const monoPresets = colorPresets(MONO_PRESETS, (ink, paper) => {
    s.set('ink', ink);
    s.set('paper', paper);
  });

  return showWhen(
    el(
      'div',
      {},
      select(
        'algorithm',
        'Algorithm',
        ALGORITHMS.map((a) => ({ value: a.id, label: a.label, group: GROUP_LABELS[a.group] })),
        s,
      ),
      ditherSlider('strength', (p) => (group(p) === 'ordered' || group(p) === 'pattern' || p.algorithm === 'noise') && !cmyk(p)),
      ditherSlider('cellSize', (p) => group(p) === 'pattern' && p.algorithm !== 'orbs'),
      ditherSlider('angle', (p) => group(p) === 'pattern' && p.algorithm !== 'orbs' && !cmyk(p)),
      ditherSlider('hexRings', (p) => p.algorithm === 'honeycomb'),
      ditherSlider('patternFollow', (p) => FOLLOWS_IMAGE.includes(p.algorithm)),
      ...(['orbSize', 'orbCount', 'orbIntensity', 'orbRandom'] as const).map((k) => ditherSlider(k, (p) => p.algorithm === 'orbs')),
      showWhen(toggle('orbVertical', 'Vertical', s), s, (p) => p.algorithm === 'orbs'),
      ...(['cmykAngleC', 'cmykAngleM', 'cmykAngleY', 'cmykAngleK', 'cmykDotGain', 'cmykGcr', 'cmykSupersample'] as const).map(
        (k) => ditherSlider(k, cmyk),
      ),
      ditherSlider('threshold', (p) => p.algorithm === 'threshold'),
      ditherSlider('diffusion', (p) => group(p) === 'diffusion'),
      showWhen(toggle('serpentine', 'Serpentine', s), s, (p) => group(p) === 'diffusion'),
      ...(['waveStrength', 'waveLength', 'waveBias', 'waveFollow'] as const).map((k) =>
        ditherSlider(k, (p) => group(p) === 'diffusion' && (k === 'waveStrength' || p.waveStrength > 0)),
      ),
      // Halftone CMYK prints its own inks, so the palette doesn't apply.
      showWhen(
        el(
          'div',
          {},
          el('div', { class: 'subhead' }, 'Palette'),
          select(
            'palette',
            'Palette',
            PALETTES.map((p) => ({ value: p.id, label: p.label })),
            s,
          ),
          ...(withSwatches ? [showWhen(paletteSwatches.root, s, (p) => p.palette !== 'custom')] : []),
          showWhen(customPaletteEditor(s), s, (p) => p.palette === 'custom'),
          showWhen(
            toggle('perceptual', 'Perceptual match', s),
            s,
            (p) => !!getPaletteDef(p.palette).uses.nearest && !(p.palette === 'custom' && p.customRamp),
          ),
          ditherSlider('levels', (p) => !!getPaletteDef(p.palette).uses.levels),
          showWhen(
            el(
              'div',
              {},
              el('div', { class: 'color-row' }, colorInput('ink', 'Ink', s), colorInput('paper', 'Paper', s)),
              monoPresets,
            ),
            s,
            (p) => !!getPaletteDef(p.palette).uses.inkPaper,
          ),
        ),
        s,
        (p) => !cmyk(p),
      ),
    ),
    s,
    (p) => p.mode === 'dither',
  );
}

export const ditherControls = ditherControlsFor(store, true);
