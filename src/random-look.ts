import { CHARSETS } from './ascii/charsets';
import { ALGORITHMS } from './pipeline/algorithms';
import { MONO_PRESETS } from './pipeline/palettes';
import type { Params } from './state';

/**
 * "Surprise me": a random look drawn from hand-picked ranges that keep the picture readable
 * (no extreme brightness or contrast, at most two effects at moderate strength). The result is a
 * preset's params: unset keys fall back to the defaults when applied.
 */

/** Seeded PRNG (mulberry32), 0 ≤ x < 1. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Text / background pairs for ASCII with enough contrast to read. */
const ASCII_INKS: [string, string][] = [
  ['#e8e8e8', '#0a0a0a'],
  ['#33ff66', '#001a05'],
  ['#ffb000', '#120800'],
  ['#1a1a1a', '#e8e4d8'],
  ['#dbe8ff', '#0b2a6b'],
  ['#ff6f61', '#1d1a4d'],
];
const TINTS = ['#ff6f61', '#33ff66', '#ffb000', '#4da3ff', '#c77dff'];

export function randomLook(random: () => number): Partial<Params> {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const chance = (p: number) => random() < p;

  const look: Partial<Params> = {
    brightness: int(-8, 8),
    contrast: int(0, 30),
    gamma: Math.round((0.85 + random() * 0.35) * 100) / 100,
    saturation: int(90, 140),
  };

  if (chance(0.7)) {
    look.mode = 'dither';
    look.algorithm = pick(ALGORITHMS.filter((a) => a.id !== 'noise' && a.group !== 'stipple')).id;
    look.pixelSize = pick([1, 2, 2, 3, 3, 4]);
    if (/halftone|lines|crosshatch|honeycomb/.test(look.algorithm)) look.cellSize = int(4, 10);
    if (look.algorithm !== 'halftone-cmyk') {
      const palette = pick(['mono', 'mono', 'gameboy', 'cga', 'pico8', 'c64', 'rgb', 'image']);
      look.palette = palette;
      if (palette === 'mono') {
        const pair = pick(MONO_PRESETS);
        look.ink = pair.ink;
        look.paper = pair.paper;
        look.levels = pick([2, 2, 3, 4]);
      } else if (palette === 'rgb') {
        look.levels = int(2, 4);
      } else if (palette === 'image') {
        look.levels = int(4, 12);
      }
    }
  } else {
    look.mode = 'ascii';
    look.asciiCharset = pick(CHARSETS.filter((c) => !c.id.includes('custom'))).id;
    look.asciiColumns = int(70, 150);
    look.asciiColor = pick(['mono', 'mono', 'color', 'palette', 'colorBg']);
    const [fg, bg] = pick(ASCII_INKS);
    look.asciiFg = fg;
    look.asciiBg = bg;
    look.asciiEdges = chance(0.3);
    look.asciiDither = chance(0.3);
  }

  // At most two effects, at strengths that colour the look without hiding the picture.
  const effects: ((l: Partial<Params>) => void)[] = [
    (l) => Object.assign(l, { fxGlow: true, fxGlowRadius: int(4, 24), fxGlowIntensity: int(40, 110), fxGlowThreshold: int(45, 75) }),
    (l) => Object.assign(l, { fxScan: true, fxScanPeriod: int(2, 4), fxScanIntensity: int(20, 50) }),
    (l) => Object.assign(l, { fxVignette: true, fxVignetteAmount: int(20, 50) }),
    (l) => Object.assign(l, { fxGrain: true, fxGrainAmount: int(10, 35), fxGrainSize: int(1, 2) }),
    (l) => Object.assign(l, { fxChroma: true, fxChromaAmount: int(1, 5) }),
    (l) => Object.assign(l, { fxTint: true, fxTintColor: pick(TINTS), fxTintMode: 'soft-light', fxTintOpacity: int(20, 50) }),
    (l) => Object.assign(l, { fxGlitch: true, fxGlitchAmount: int(10, 30) }),
  ];
  const count = pick([0, 1, 1, 2]);
  for (let i = 0; i < count; i++) effects.splice(Math.floor(random() * effects.length), 1)[0](look);
  return look;
}
