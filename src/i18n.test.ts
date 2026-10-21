import { describe, expect, it } from 'vitest';
import { BAND_LABELS, EASES, LOOPS } from './anim';
import { CHARSET_GROUPS, CHARSETS, COLOR_MODES, FONTS } from './ascii/charsets';
import { LFO_SHAPES } from './ascii/lfo';
import { covered, DICTIONARIES, initialLang, translate } from './i18n';
import { LAYER_BLENDS } from './layers';
import { ALGORITHMS, GROUP_LABELS } from './pipeline/algorithms';
import { EFFECTS, TINT_MODES } from './pipeline/effects';
import { MONO_PRESETS, PALETTES } from './pipeline/palettes';
import {
  ADJUST_SLIDERS,
  ANIM_DURATION_SLIDER,
  ANSI_DEPTHS,
  ASCII_SLIDERS,
  BOIL_AMOUNT_SLIDER,
  BOIL_PATTERNS,
  BOIL_SLIDER,
  DITHER_SLIDERS,
  EXPORT_FORMATS,
  EXPORT_SLIDERS,
  EXPORT_UNITS,
  FX_SLIDERS,
  MASK_MODES,
  MASK_OUTSIDE,
  MASK_SLIDERS,
} from './state';

describe('translate', () => {
  it('leaves English and unknown text alone', () => {
    expect(translate('Contrast', 'en')).toBe('Contrast');
    expect(translate('photo.png', 'th')).toBe('photo.png');
  });

  it('translates exact text and keeps surrounding space', () => {
    expect(translate('  Contrast ', 'th')).toBe('  คอนทราสต์ ');
  });

  it('translates each " · " part on its own', () => {
    expect(translate('Glow · Radius', 'th')).toBe('เรืองแสง · รัศมี');
    expect(translate('→ 600×400 · 18 frames · 1.2 s', 'th')).toBe('→ 600×400 · 18 เฟรม · 1.2 s');
  });

  it('fills templates with the values from the English text', () => {
    expect(translate('Imported “Night”', 'th')).toBe('นำเข้า “Night” แล้ว');
    expect(translate('Saved 3 images in a .zip · couldn’t read a.png, b.png', 'th')).toBe(
      'บันทึก 3 ภาพใน .zip แล้ว · อ่านไม่ได้: a.png, b.png',
    );
    expect(translate('5.1 × 3.4 cm at 300 dpi', 'th')).toBe('5.1 × 3.4 ซม. ที่ 300 dpi');
  });
});

describe('Thai dictionary', () => {
  const th = DICTIONARIES.th;
  it('has a translation for every entry, with the same placeholders', () => {
    for (const [en, tr] of Object.entries(th)) {
      expect(tr.trim(), en).not.toBe('');
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(tr), en).toEqual(names(en));
    }
  });

  it('covers every label the controls are built from', () => {
    const labels = [
      ...ADJUST_SLIDERS,
      ...Object.values(DITHER_SLIDERS),
      ...Object.values(ASCII_SLIDERS),
      ...Object.values(EXPORT_SLIDERS),
      ...Object.values(FX_SLIDERS).flat(),
      ...Object.values(MASK_SLIDERS),
      BOIL_SLIDER,
      BOIL_AMOUNT_SLIDER,
      ANIM_DURATION_SLIDER,
      ...ALGORITHMS,
      ...PALETTES,
      ...MONO_PRESETS,
      ...CHARSETS,
      ...CHARSET_GROUPS,
      ...COLOR_MODES,
      ...FONTS,
      ...EFFECTS,
      ...TINT_MODES,
      ...LAYER_BLENDS,
      ...EXPORT_FORMATS,
      ...EXPORT_UNITS,
      ...ANSI_DEPTHS,
      ...MASK_MODES,
      ...MASK_OUTSIDE,
      ...BOIL_PATTERNS,
      ...EASES,
      ...LOOPS,
      ...LFO_SHAPES,
    ].map((x) => x.label);
    labels.push(...Object.values(GROUP_LABELS), ...Object.values(BAND_LABELS));
    expect(labels.filter((l) => !covered(l, 'th'))).toEqual([]);
  });
});

describe('initialLang', () => {
  it('uses the saved choice, else the browser language', () => {
    expect(initialLang('en', ['th-TH'])).toBe('en');
    expect(initialLang(null, ['th-TH', 'en'])).toBe('th');
    expect(initialLang(null, ['en-GB'])).toBe('en');
    expect(initialLang('xx', ['de'])).toBe('en');
  });
});
