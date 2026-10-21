import { ASCII_PALETTES, CHARSET_GROUPS, CHARSETS, COLOR_MODES, FONTS, MAX_INJECT } from '../../ascii/charsets';
import { LFO_SHAPES } from '../../ascii/lfo';
import { getPaletteDef, MONO_PRESETS } from '../../pipeline/palettes';
import { ASCII_SLIDERS, type ParamStore, type Params } from '../../state';
import { button, colorInput, colorPresets, el, select, showWhen, slider, textInput, toggle } from '../../ui/controls';
import { notBraille, store } from '../core';
import { customPaletteEditor } from './custom-palette';

const groupLabel = (id: string) => CHARSET_GROUPS.find((g) => g.id === id)?.label ?? id;

/** Sorted glyphs of layer 1's set as they will be used; filled by ascii-view.ts when the atlas is built. */
export const glyphPreview = el('div', { class: 'glyph-preview', 'aria-label': 'Characters in use, sparse to dense' });
export const glyphInfo = el('div', { class: 'note glyph-info' });

/** ASCII settings bound to `s`: the page store for layer 1, or layer 2's store. Only layer 1 shows the glyph preview. */
export function asciiControlsFor(s: ParamStore, withPreview = false): HTMLElement {
  const asciiSlider = (key: keyof typeof ASCII_SLIDERS, when?: (p: Params) => boolean) =>
    when ? showWhen(slider(ASCII_SLIDERS[key], s), s, when) : slider(ASCII_SLIDERS[key], s);

  // Terminal-style presets: light glyphs on a dark background.
  const asciiPresets = colorPresets(MONO_PRESETS, (ink, paper) => {
    s.set('asciiFg', paper);
    s.set('asciiBg', ink);
  });
  asciiPresets.append(
    button(
      '⇄ swap',
      () => {
        const { asciiFg, asciiBg } = s.params;
        s.set('asciiFg', asciiBg);
        s.set('asciiBg', asciiFg);
      },
      'preset swap',
    ),
  );

  const lfoControls = (title: string, shape: 'asciiOffsetLfo' | 'asciiDepthLfo', speed: string, amount: string) =>
    showWhen(
      el(
        'div',
        {},
        select(
          shape,
          title,
          LFO_SHAPES.map((l) => ({ value: l.id, label: l.label })),
          s,
        ),
        asciiSlider(speed as keyof typeof ASCII_SLIDERS, (p) => p[shape] !== 'off'),
        asciiSlider(amount as keyof typeof ASCII_SLIDERS, (p) => p[shape] !== 'off'),
      ),
      s,
      notBraille,
    );

  return showWhen(
    el(
      'div',
      {},
      select(
        'asciiCharset',
        'Characters',
        CHARSETS.map((c) => ({ value: c.id, label: c.label, group: groupLabel(c.group) })),
        s,
      ),
      ...(withPreview ? [glyphPreview, glyphInfo] : []),
      showWhen(textInput('asciiCustom', 'Custom ramp', s), s, (p) => p.asciiCharset === 'custom'),
      showWhen(textInput('asciiInject', `Add characters (up to ${MAX_INJECT})`, s, MAX_INJECT), s, notBraille),
      showWhen(toggle('asciiSpace', 'Include space', s), s, notBraille),
      asciiSlider('depth', notBraille),
      asciiSlider('offset', notBraille),
      asciiSlider('columns'),
      select(
        'asciiFont',
        'Font',
        FONTS.map((f) => ({ value: f.id, label: f.label })),
        s,
      ),
      toggle('asciiBold', 'Bold', s),
      asciiSlider('fontSize'),
      asciiSlider('lineHeight'),
      toggle('asciiDither', 'Dither', s),
      showWhen(toggle('asciiEdges', 'Edge glyphs', s), s, notBraille),
      asciiSlider('edgeThreshold', (p) => p.asciiEdges && notBraille(p)),
      showWhen(el('div', { class: 'subhead' }, 'Animate'), s, notBraille),
      lfoControls('Offset LFO', 'asciiOffsetLfo', 'offsetSpeed', 'offsetAmount'),
      lfoControls('Depth LFO', 'asciiDepthLfo', 'depthSpeed', 'depthAmount'),
      el('div', { class: 'subhead' }, 'Colour'),
      select(
        'asciiColor',
        'Mode',
        COLOR_MODES.map((c) => ({ value: c.id, label: c.label })),
        s,
      ),
      showWhen(
        select(
          'asciiPalette',
          'Colour palette',
          ASCII_PALETTES.map((id) => ({ value: id, label: getPaletteDef(id).label })),
          s,
        ),
        s,
        (p) => p.asciiColor === 'palette',
      ),
      showWhen(customPaletteEditor(s), s, (p) => p.asciiColor === 'palette' && p.asciiPalette === 'custom'),
      showWhen(toggle('perceptual', 'Perceptual match', s), s, (p) => p.asciiColor === 'palette'),
      el(
        'div',
        { class: 'color-row' },
        showWhen(colorInput('asciiFg', 'Text', s), s, (p) => p.asciiColor === 'mono' || p.asciiColor === 'colorBg'),
        showWhen(colorInput('asciiBg', 'Background', s), s, (p) => p.asciiColor !== 'colorBg'),
      ),
      asciiPresets,
      showWhen(toggle('asciiTransparent', 'Transparent background', s), s, (p) => p.asciiColor !== 'colorBg'),
    ),
    s,
    (p) => p.mode === 'ascii',
  );
}

export const asciiControls = asciiControlsFor(store, true);
