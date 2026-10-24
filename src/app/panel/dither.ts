import { ALGORITHMS, FOLLOWS_IMAGE, GROUP_LABELS } from '../../pipeline/algorithms';
import { extractPalette, getPaletteDef, MONO_PRESETS, parseColorList, resolvePalette, rgbToHex } from '../../pipeline/palettes';
import { PALETTE_CATEGORIES, PALETTE_SETS } from '../../pipeline/palette-sets';
import type { PickItem } from '../../ui/picker';
import { DITHER_SLIDERS, HALFTONE_SHAPES, PALETTE_MIXING, type ParamStore, type Params } from '../../state';
import { advanced, button, categoryPicker, colorInput, colorPresets, el, select, showWhen, slider, swatches, swatchStrip, toggle } from '../../ui/controls';
import { actions, group, pickerThumbs, rt, sourceListeners, stippleProgress, store } from '../core';
import { customPaletteEditor, libraryPalettes, onLibraryChange, useLibraryPalette } from './custom-palette';
import { lumaShapesEditor } from './luma-shapes';

const cmyk = (p: Params) => p.algorithm === 'halftone-cmyk';
const lumaShapes = (p: Params) => p.algorithm === 'luma-shapes';

// ---------- palette picker ----------

const SOURCE_SIZES = [3, 4, 8, 16, 32];
let sourceSizes: { source: unknown; sizes: number[] } | null = null;

/** Colour counts for the Source category, without counts that give the same colours as a smaller one. */
function distinctSourceSizes(): number[] {
  const src = rt.current;
  if (!src) return SOURCE_SIZES;
  if (sourceSizes?.source !== src) {
    const seen = new Set<string>();
    const sizes = SOURCE_SIZES.filter((n) => {
      const key = extractPalette(src.paletteElement ?? src.element, src.width, src.height, n).map(rgbToHex).sort().join();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    sourceSizes = { source: src, sizes };
  }
  return sourceSizes.sizes;
}

/** Colours a palette entry shows in the picker grid (none for palettes made from the picture). */
export function paletteColors(value: string, p: Params): string[] {
  if (value.startsWith('lib:')) return libraryPalettes().find((x) => x.name === value.slice(4))?.colors ?? [];
  if (value.startsWith('image') || value === 'rgb') return [];
  if (value === 'custom') return parseColorList(p.customPalette);
  const pal = resolvePalette(value, { levels: p.levels, ink: p.ink, paper: p.paper, extracted: null });
  return pal.colors.map(rgbToHex);
}

/** Category → Palette, for `palette` (Source entries also set the colour count). */
function palettePicker(s: ParamStore): HTMLElement {
  const read = (p: Params) => (p.palette === 'image' ? `image@${p.levels}` : p.palette);
  const items = (): PickItem[] => {
    const sets = (category: string) =>
      PALETTE_SETS.filter((x) => x.category === category).map((x) => ({ value: `set:${x.id}`, label: x.name, category }));
    const sizes = distinctSourceSizes();
    const levels = s.params.palette === 'image' && !sizes.includes(s.params.levels) ? [s.params.levels] : [];
    return [
      { value: 'mono', label: 'Ink & paper', category: 'monochrome' },
      ...sets('monochrome'),
      ...[...sizes, ...levels].map((n) => ({ value: `image@${n}`, label: `${n} colours`, category: 'source' })),
      { value: 'rgb', label: 'RGB levels', category: 'source' },
      ...sets('abstract'),
      ...sets('nature'),
      ...sets('prismatic'),
      ...['gameboy', 'cga', 'pico8', 'c64'].map((id) => ({ value: id, label: getPaletteDef(id).label, category: 'retro' })),
      ...sets('retro'),
      ...sets('simple'),
      { value: 'custom', label: 'Custom', category: 'custom' },
      ...libraryPalettes().map((p) => ({ value: `lib:${p.name}`, label: p.name, category: p.category ?? 'Library' })),
    ];
  };
  const write = (value: string) => {
    if (value.startsWith('image@')) {
      s.set('levels', Number(value.slice(6)));
      s.set('palette', 'image');
    } else if (value.startsWith('lib:')) {
      const p = libraryPalettes().find((x) => x.name === value.slice(4));
      if (p) useLibraryPalette(s, p);
    } else s.set('palette', value);
  };
  const visual = (it: PickItem) => {
    const colors = paletteColors(it.value, s.params);
    return colors.length ? swatchStrip(colors) : null;
  };
  const picker = categoryPicker('palette', 'Palette', items, s, { categories: PALETTE_CATEGORIES, noTranslate: true, read, write, visual });
  sourceListeners.add(picker.refresh);
  onLibraryChange(picker.refresh);
  return picker;
}

/** Dither sliders shown in Basic mode. */
const BASIC_DITHER = ['strength', 'cellSize', 'threshold', 'diffusion', 'levels'];

/** Colour chips of layer 1's palette; filled by dither-view.ts. */
export const paletteSwatches = swatches();

/**
 * Dither settings bound to `s`: the page store for layer 1, or layer 2's store. Only layer 1 shows
 * the palette swatches (they need the source image for "From image").
 */
export function ditherControlsFor(s: ParamStore, withSwatches = false): HTMLElement {
  // Basic mode keeps the main amount of each kind of algorithm; the rest are advanced.
  const ditherSlider = (key: keyof typeof DITHER_SLIDERS, when: (p: Params) => boolean) => {
    const node = showWhen(slider(DITHER_SLIDERS[key], s), s, when);
    return BASIC_DITHER.includes(key) ? node : advanced(node);
  };

  const monoPresets = colorPresets(MONO_PRESETS, (ink, paper) => {
    s.set('ink', ink);
    s.set('paper', paper);
  });

  const generate = button(
    'Generate dots',
    () => {
      if (stippleProgress.busy) actions.cancelStipple();
      else void actions.generateStipple(s.params);
    },
    'btn wide',
  );
  const progress = el('progress', { max: '1', value: '0', 'aria-label': 'Stippling progress', hidden: '' });
  stippleProgress.listeners.add((busy, value) => {
    generate.textContent = busy ? 'Cancel' : 'Generate dots';
    progress.hidden = !busy;
    progress.value = value;
  });

  return showWhen(
    el(
      'div',
      {},
      categoryPicker(
        'algorithm',
        'Algorithm',
        () => ALGORITHMS.map((a) => ({ value: a.id, label: a.label, category: a.group })),
        s,
        {
          categories: Object.entries(GROUP_LABELS).map(([id, label]) => ({ id, label })),
          // Each algorithm drawn small with the current picture and palette (app/thumbs.ts).
          visual: (it) => {
            const canvas = el('canvas', { class: 'tile-thumb' });
            pickerThumbs.set(canvas, { mode: 'dither', algorithm: it.value });
            queueMicrotask(() => actions.refreshThumbs(false));
            return canvas;
          },
        },
      ),
      showWhen(lumaShapesEditor(s), s, lumaShapes),
      showWhen(
        el(
          'div',
          {},
          ...['stippleCount', 'stippleIterations', 'stippleSize', 'stippleSeed'].map((key) =>
            slider(DITHER_SLIDERS[key], s),
          ),
          el('div', { class: 'color-row' }, colorInput('ink', 'Ink', s), colorInput('paper', 'Paper', s)),
          generate,
          progress,
          el('div', { class: 'note' }, 'Still images only · press Generate after changing settings'),
        ),
        s,
        (p) => p.algorithm === 'stippling',
      ),
      ditherSlider(
        'strength',
        (p) => (group(p) === 'ordered' || group(p) === 'pattern' || p.algorithm === 'noise') && !cmyk(p) && !lumaShapes(p),
      ),
      ditherSlider('cellSize', (p) => (group(p) === 'pattern' && !['orbs', 'contour'].includes(p.algorithm)) || group(p) === 'polygon'),
      ditherSlider(
        'angle',
        (p) => (group(p) === 'pattern' && !['orbs', 'contour', 'radial'].includes(p.algorithm) && !cmyk(p)) || group(p) === 'polygon',
      ),
      ditherSlider('polyJitter', (p) => p.algorithm === 'voronoi'),
      ditherSlider('polyBorder', (p) => group(p) === 'polygon'),
      advanced(showWhen(colorInput('polyBorderColor', 'Border colour', s), s, (p) => group(p) === 'polygon' && p.polyBorder > 0)),
      ditherSlider('hexRings', (p) => p.algorithm === 'honeycomb'),
      ...['contourLevels', 'contourSmooth'].map((k) => ditherSlider(k, (p) => p.algorithm === 'contour')),
      ...['modulationAmount', 'modulationWidth', 'modulationPhase'].map((k) =>
        ditherSlider(k, (p) => p.algorithm === 'modulation' || (p.algorithm === 'contour' && k === 'modulationPhase')),
      ),
      ...['moireRatio', 'moireAngle'].map((k) => ditherSlider(k, (p) => p.algorithm === 'moire')),
      ...['radialX', 'radialY', 'radialArms'].map((k) => ditherSlider(k, (p) => p.algorithm === 'radial')),
      ditherSlider('patternFollow', (p) => FOLLOWS_IMAGE.includes(p.algorithm)),
      ...(['orbSize', 'orbCount', 'orbIntensity', 'orbRandom'] as const).map((k) =>
        ditherSlider(k, (p) => p.algorithm === 'orbs'),
      ),
      advanced(showWhen(toggle('orbVertical', 'Vertical', s), s, (p) => p.algorithm === 'orbs')),
      ...(
        ['cmykAngleC', 'cmykAngleM', 'cmykAngleY', 'cmykAngleK', 'cmykDotGain', 'cmykGcr', 'cmykSupersample'] as const
      ).map((k) => ditherSlider(k, cmyk)),
      advanced(showWhen(
        select(
          'halftoneShape',
          'Dot shape',
          HALFTONE_SHAPES.map((x) => ({ value: x.id, label: x.label })),
          s,
        ),
        s,
        (p) => p.algorithm === 'halftone' || cmyk(p),
      )),
      advanced(showWhen(toggle('linearLight', 'Linear light', s), s, (p) => !cmyk(p) && !lumaShapes(p) && p.algorithm !== 'stippling')),
      ditherSlider('threshold', (p) => p.algorithm === 'threshold'),
      ditherSlider('diffusion', (p) => group(p) === 'diffusion'),
      advanced(showWhen(
        toggle('serpentine', 'Serpentine', s),
        s,
        (p) => group(p) === 'diffusion' && !['ostromoukhov', 'riemersma', 'dot-diffusion', 'edge-diffusion', 'axis'].includes(p.algorithm),
      )),
      ...['gaussSpread', 'gaussNoise'].map((k) => ditherSlider(k, (p) => p.algorithm === 'gaussian')),
      ditherSlider('edgeCrack', (p) => p.algorithm === 'edge-diffusion'),
      advanced(showWhen(toggle('axisVertical', 'Vertical', s), s, (p) => p.algorithm === 'axis')),
      ...['axisBleed', 'axisSmooth'].map((k) => ditherSlider(k, (p) => p.algorithm === 'axis')),
      ...(['waveStrength', 'waveLength', 'waveBias', 'waveFollow'] as const).map((k) =>
        ditherSlider(
          k,
          (p) =>
            group(p) === 'diffusion' &&
            !['riemersma', 'dot-diffusion'].includes(p.algorithm) &&
            (k === 'waveStrength' || p.waveStrength > 0),
        ),
      ),
      // Halftone CMYK prints its own inks, so the palette doesn't apply.
      showWhen(
        el(
          'div',
          {},
          el('div', { class: 'subhead' }, 'Palette'),
          palettePicker(s),
          ...(withSwatches ? [showWhen(paletteSwatches.root, s, (p) => p.palette !== 'custom')] : []),
          showWhen(customPaletteEditor(s), s, (p) => p.palette === 'custom'),
          advanced(showWhen(
            toggle('perceptual', 'Perceptual match', s),
            s,
            (p) => !!getPaletteDef(p.palette).uses.nearest && !(p.palette === 'custom' && p.customRamp),
          )),
          advanced(showWhen(
            select(
              'paletteMixing',
              'Palette mixing',
              PALETTE_MIXING.map((x) => ({ value: x.id, label: x.label })),
              s,
            ),
            s,
            (p) =>
              !!getPaletteDef(p.palette).uses.nearest &&
              !(p.palette === 'custom' && p.customRamp) &&
              (group(p) === 'ordered' || group(p) === 'pattern'),
          )),
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
        (p) => !cmyk(p) && !lumaShapes(p) && p.algorithm !== 'stippling',
      ),
    ),
    s,
    (p) => p.mode === 'dither',
  );
}

export const ditherControls = ditherControlsFor(store, true);
