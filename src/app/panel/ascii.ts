import { ASCII_PALETTES, CHARSET_GROUPS, CHARSETS, COLOR_MODES, FONTS, MAX_INJECT } from '../../ascii/charsets';
import { LFO_SHAPES } from '../../ascii/lfo';
import { getPaletteDef, MONO_PRESETS } from '../../pipeline/palettes';
import { ASCII_SLIDERS, type Params } from '../../state';
import { button, colorInput, colorPresets, el, select, showWhen, slider, textInput, toggle } from '../../ui/controls';
import { notBraille, store } from '../core';

const asciiSlider = (key: keyof typeof ASCII_SLIDERS, when?: (p: Params) => boolean) =>
  when ? showWhen(slider(ASCII_SLIDERS[key], store), store, when) : slider(ASCII_SLIDERS[key], store);

// Terminal-style presets: light glyphs on a dark background.
const asciiPresets = colorPresets(MONO_PRESETS, (ink, paper) => {
  store.set('asciiFg', paper);
  store.set('asciiBg', ink);
});
asciiPresets.append(
  button(
    '⇄ swap',
    () => {
      const { asciiFg, asciiBg } = store.params;
      store.set('asciiFg', asciiBg);
      store.set('asciiBg', asciiFg);
    },
    'preset swap',
  ),
);

const groupLabel = (id: string) => CHARSET_GROUPS.find((g) => g.id === id)?.label ?? id;

/** Sorted glyphs of the current set as they will be used; filled by ascii-view.ts when the atlas is built. */
export const glyphPreview = el('div', { class: 'glyph-preview', 'aria-label': 'Characters in use, sparse to dense' });
export const glyphInfo = el('div', { class: 'note glyph-info' });

const lfoControls = (title: string, shape: 'asciiOffsetLfo' | 'asciiDepthLfo', speed: string, amount: string) =>
  showWhen(
    el(
      'div',
      {},
      select(
        shape,
        title,
        LFO_SHAPES.map((l) => ({ value: l.id, label: l.label })),
        store,
      ),
      asciiSlider(speed as keyof typeof ASCII_SLIDERS, (p) => p[shape] !== 'off'),
      asciiSlider(amount as keyof typeof ASCII_SLIDERS, (p) => p[shape] !== 'off'),
    ),
    store,
    notBraille,
  );

export const asciiControls = showWhen(
  el(
    'div',
    {},
    select(
      'asciiCharset',
      'Characters',
      CHARSETS.map((c) => ({ value: c.id, label: c.label, group: groupLabel(c.group) })),
      store,
    ),
    glyphPreview,
    glyphInfo,
    showWhen(textInput('asciiCustom', 'Custom ramp', store), store, (p) => p.asciiCharset === 'custom'),
    showWhen(textInput('asciiInject', `Add characters (up to ${MAX_INJECT})`, store, MAX_INJECT), store, notBraille),
    showWhen(toggle('asciiSpace', 'Include space', store), store, notBraille),
    asciiSlider('depth', notBraille),
    asciiSlider('offset', notBraille),
    asciiSlider('columns'),
    select(
      'asciiFont',
      'Font',
      FONTS.map((f) => ({ value: f.id, label: f.label })),
      store,
    ),
    asciiSlider('fontSize'),
    asciiSlider('lineHeight'),
    toggle('asciiDither', 'Dither', store),
    showWhen(toggle('asciiEdges', 'Edge glyphs', store), store, notBraille),
    asciiSlider('edgeThreshold', (p) => p.asciiEdges && notBraille(p)),
    showWhen(el('div', { class: 'subhead' }, 'Animate'), store, notBraille),
    lfoControls('Offset LFO', 'asciiOffsetLfo', 'offsetSpeed', 'offsetAmount'),
    lfoControls('Depth LFO', 'asciiDepthLfo', 'depthSpeed', 'depthAmount'),
    el('div', { class: 'subhead' }, 'Colour'),
    select(
      'asciiColor',
      'Mode',
      COLOR_MODES.map((c) => ({ value: c.id, label: c.label })),
      store,
    ),
    showWhen(
      select(
        'asciiPalette',
        'Colour palette',
        ASCII_PALETTES.map((id) => ({ value: id, label: getPaletteDef(id).label })),
        store,
      ),
      store,
      (p) => p.asciiColor === 'palette',
    ),
    el(
      'div',
      { class: 'color-row' },
      showWhen(colorInput('asciiFg', 'Text', store), store, (p) => p.asciiColor === 'mono' || p.asciiColor === 'colorBg'),
      showWhen(colorInput('asciiBg', 'Background', store), store, (p) => p.asciiColor !== 'colorBg'),
    ),
    asciiPresets,
    showWhen(toggle('asciiTransparent', 'Transparent background', store), store, (p) => p.asciiColor !== 'colorBg'),
  ),
  store,
  (p) => p.mode === 'ascii',
);
