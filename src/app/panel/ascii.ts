import {
  ASCII_PALETTES,
  CHARSET_GROUPS,
  CHARSETS,
  COLOR_MODES,
  FONTS,
  isUserFontId,
  MAX_INJECT,
  userFontId,
  userFontName,
} from '../../ascii/charsets';
import { LFO_SHAPES } from '../../ascii/lfo';
import { getPaletteDef, MONO_PRESETS } from '../../pipeline/palettes';
import { PALETTE_CATEGORIES, PALETTE_SETS } from '../../pipeline/palette-sets';
import { ASCII_SLIDERS, type ParamStore, type Params } from '../../state';
import { advanced, button, categoryPicker, colorInput, colorPresets, el, select, showWhen, slider, swatchStrip, textInput, toggle } from '../../ui/controls';
import { addUserFont, onUserFontsChange, removeUserFont, userFonts } from '../../user-fonts';
import { notBraille, store } from '../core';
import { flash } from '../shell';
import { customPaletteEditor } from './custom-palette';
import { paletteColors } from './dither';

/** Font choice bound to `s`: the built-in fonts plus fonts added in this browser, with Add / Remove. */
function fontPicker(s: ParamStore): HTMLElement {
  const input = el('select', { 'aria-label': 'Font' });
  const picker = el('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2,font/*', hidden: '' });
  const remove = button('Remove', () => {
    const id = s.params.asciiFont;
    if (!isUserFontId(id)) return;
    void removeUserFont(userFontName(id)).then(() => {
      s.set('asciiFont', FONTS[0].id);
      flash(`Removed “${userFontName(id)}”`);
    });
  }, 'btn small');
  remove.title = 'Remove this font from the browser';

  function sync(): void {
    const id = s.params.asciiFont;
    const own = userFonts().map(userFontId);
    // A font named by a look but not stored here is still listed, marked missing.
    const missing = isUserFontId(id) && !own.includes(id) ? [id] : [];
    input.replaceChildren(
      ...FONTS.map((f) => el('option', { value: f.id }, f.label)),
      ...(own.length || missing.length
        ? [
            el(
              'optgroup',
              { label: 'Added' },
              ...own.map((u) => el('option', { value: u }, userFontName(u))),
              ...missing.map((u) => el('option', { value: u }, `${userFontName(u)} (missing)`)),
            ),
          ]
        : []),
    );
    input.value = id;
    remove.hidden = !isUserFontId(id);
  }

  input.addEventListener('change', () => s.set('asciiFont', input.value));
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    addUserFont(file)
      .then((name) => {
        s.set('asciiFont', userFontId(name));
        flash(`Added font “${name}”`);
      })
      .catch((err: Error) => flash(err.message));
  });
  s.subscribe((_, changed) => changed === 'asciiFont' && sync());
  onUserFontsChange(sync);
  sync();

  return el(
    'div',
    {},
    el(
      'label',
      { class: 'control' },
      el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, 'Font')),
      el('div', { class: 'select' }, input),
    ),
    el('div', { class: 'pal-actions' }, button('Add font…', () => picker.click(), 'btn small'), remove),
    picker,
  );
}

/** Sorted glyphs of layer 1's set as they will be used; filled by ascii-view.ts when the atlas is built. */
export const glyphPreview = el('div', { class: 'glyph-preview', 'aria-label': 'Characters in use, sparse to dense' });
export const glyphInfo = el('div', { class: 'note glyph-info' });

/** ASCII settings bound to `s`: the page store for layer 1, or layer 2's store. Only layer 1 shows the glyph preview. */
export function asciiControlsFor(s: ParamStore, withPreview = false): HTMLElement {
  // Basic mode keeps Columns; the other sliders are advanced.
  const asciiSlider = (key: keyof typeof ASCII_SLIDERS, when?: (p: Params) => boolean) => {
    const node = when ? showWhen(slider(ASCII_SLIDERS[key], s), s, when) : slider(ASCII_SLIDERS[key], s);
    return key === 'columns' ? node : advanced(node);
  };

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
      categoryPicker(
        'asciiCharset',
        'Characters',
        () => CHARSETS.map((c) => ({ value: c.id, label: c.label, category: c.group })),
        s,
        { categories: CHARSET_GROUPS },
      ),
      ...(withPreview ? [glyphPreview, glyphInfo] : []),
      showWhen(textInput('asciiCustom', 'Custom ramp', s), s, (p) => p.asciiCharset === 'custom'),
      advanced(showWhen(textInput('asciiInject', `Add characters (up to ${MAX_INJECT})`, s, MAX_INJECT), s, notBraille)),
      advanced(showWhen(toggle('asciiSpace', 'Include space', s), s, notBraille)),
      asciiSlider('depth', notBraille),
      asciiSlider('shape', notBraille),
      asciiSlider('offset', notBraille),
      asciiSlider('columns'),
      advanced(fontPicker(s)),
      advanced(toggle('asciiBold', 'Bold', s)),
      asciiSlider('fontSize'),
      asciiSlider('lineHeight'),
      advanced(toggle('asciiDither', 'Dither', s)),
      advanced(showWhen(toggle('asciiEdges', 'Edge glyphs', s), s, notBraille)),
      asciiSlider('edgeThreshold', (p) => p.asciiEdges && notBraille(p)),
      advanced(showWhen(el('div', { class: 'subhead' }, 'Animate'), s, notBraille)),
      advanced(lfoControls('Offset LFO', 'asciiOffsetLfo', 'offsetSpeed', 'offsetAmount')),
      advanced(lfoControls('Depth LFO', 'asciiDepthLfo', 'depthSpeed', 'depthAmount')),
      el('div', { class: 'subhead' }, 'Colour'),
      select(
        'asciiColor',
        'Mode',
        COLOR_MODES.map((c) => ({ value: c.id, label: c.label })),
        s,
      ),
      showWhen(
        categoryPicker(
          'asciiPalette',
          'Colour palette',
          () => [
            ...ASCII_PALETTES.map((id) => ({
              value: id,
              label: getPaletteDef(id).label,
              category: id === 'custom' ? 'custom' : id === 'image' ? 'source' : 'retro',
            })),
            ...PALETTE_SETS.map((x) => ({ value: `set:${x.id}`, label: x.name, category: x.category })),
          ],
          s,
          {
            categories: PALETTE_CATEGORIES,
            noTranslate: true,
            visual: (it) => {
              const colors = paletteColors(it.value, s.params);
              return colors.length ? swatchStrip(colors) : null;
            },
          },
        ),
        s,
        (p) => p.asciiColor === 'palette',
      ),
      showWhen(customPaletteEditor(s), s, (p) => p.asciiColor === 'palette' && p.asciiPalette === 'custom'),
      advanced(showWhen(toggle('perceptual', 'Perceptual match', s), s, (p) => p.asciiColor === 'palette')),
      el(
        'div',
        { class: 'color-row' },
        showWhen(colorInput('asciiFg', 'Text', s), s, (p) => p.asciiColor === 'mono' || p.asciiColor === 'colorBg'),
        showWhen(colorInput('asciiBg', 'Background', s), s, (p) => p.asciiColor !== 'colorBg'),
      ),
      asciiPresets,
      advanced(showWhen(toggle('asciiTransparent', 'Transparent background', s), s, (p) => p.asciiColor !== 'colorBg')),
    ),
    s,
    (p) => p.mode === 'ascii',
  );
}

export const asciiControls = asciiControlsFor(store, true);
