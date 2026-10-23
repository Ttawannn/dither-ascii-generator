import { ALGORITHMS } from './pipeline/algorithms';
import { TINT_MODES } from './pipeline/effects';
import { parseColorList, serializeColorList } from './pipeline/palettes';
import { shapeSet, type ShapeBand } from './pipeline/shape-bands';
import { sanitize, type Params } from './state';

/**
 * Reads a look from a preset JSON file. Two shapes are understood:
 *  - our own: `{ name?, params: { …Params } }`
 *  - external: an object (optionally under `preset`) with a colour palette, a dither style and a
 *    list of effect instances, each with a `type` and `settings`. Fields are matched by structure
 *    and loose names, values are mapped onto our ranges, and anything without an equivalent is
 *    listed so the user knows what didn't carry over.
 */
export interface ImportResult {
  name: string;
  /** Sanitized; keys not set fall back to defaults when applied as a preset. */
  params: Partial<Params>;
  /** Settings carried over onto a different scale or a close equivalent. */
  approximated: string[];
  /** Settings with no equivalent here. */
  skipped: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** True when the data looks like a preset either importer can read. */
export function looksLikePreset(data: unknown): boolean {
  if (!isObj(data)) return false;
  if (isObj(data.params)) return true;
  const p = isObj(data.preset) ? data.preset : data;
  return isObj(p.dither) || isObj(p.effectInstances) || Array.isArray(p.fxStack) || isObj(p.colorPalette);
}

export function importPreset(data: unknown): ImportResult | null {
  if (!looksLikePreset(data)) return null;
  const root = data as Obj;
  if (isObj(root.params)) {
    return {
      name: str(root.name)?.slice(0, 40) || 'Imported',
      params: sanitize(root.params),
      approximated: [],
      skipped: [],
    };
  }
  return importExternal(isObj(root.preset) ? root.preset : root);
}

/** A file holding several presets: `{ presets: [...] }` or a bare array, each item read like a single file. */
export function importPresetList(data: unknown): ImportResult[] | null {
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.presets) ? data.presets : null;
  if (!list) return null;
  const out = list.map(importPreset).filter((r): r is ImportResult => r !== null);
  return out.length ? out : null;
}

// ---------- external presets ----------

const KERNELS: [RegExp, string][] = [
  [/ostrom/, 'ostromoukhov'],
  [/riemersma/, 'riemersma'],
  [/dot.?diffusion/, 'dot-diffusion'],
  [/floyd/, 'floyd-steinberg'],
  [/atkinson/, 'atkinson'],
  [/jarvis|jjn/, 'jjn'],
  [/stucki/, 'stucki'],
  [/burkes/, 'burkes'],
  [/sierra.?lite/, 'sierra-lite'],
  [/sierra.?(2|two)|two.?row/, 'sierra2'],
  [/sierra/, 'sierra'],
];

const PATTERNS: [RegExp, string][] = [
  [/stippl/, 'stippling'],
  [/cmyk/, 'halftone-cmyk'],
  [/bee|hex|honey/, 'honeycomb'],
  [/orb/, 'orbs'],
  [/bayer.?2|2x2/, 'bayer2'],
  [/bayer.?8|8x8/, 'bayer8'],
  [/bayer|ordered/, 'bayer4'],
  [/blue.?noise/, 'bluenoise'],
  [/cross/, 'crosshatch'],
  [/halftone|dot/, 'halftone'],
  [/line/, 'lines'],
  [/threshold/, 'threshold'],
  [/noise|random/, 'noise'],
];

interface StyleMatch {
  algorithm: string;
  /** Lines from threshold modulation (Wave). */
  wave: boolean;
  /** A close equivalent rather than the same method. */
  approx: boolean;
  /** Shape for Luma Shapes grids. */
  shape?: ShapeBand['shape'];
}

/** Known style ids. `~` marks a close equivalent; `+wave` adds threshold modulation. */
const STYLES: Record<string, string> = {
  'floyd-steinberg': 'floyd-steinberg',
  atkinson: 'atkinson',
  burkes: 'burkes',
  stucki: 'stucki',
  sierra: 'sierra',
  'two-row-sierra': 'sierra2',
  'sierra-lite': 'sierra-lite',
  'jarvis-judice-ninke': 'jjn',
  ostromukhov: 'ostromoukhov',
  'fractal-diffuse': 'riemersma',
  'random-ordered': 'noise',
  noise: 'noise',
  crosshatch: 'crosshatch',
  stippling: 'stippling',
  'color-separation': 'threshold',
  none: 'threshold',
  original: 'threshold',
  'bayer-matrix': 'bayer4',
  'stevenson-arce': '~jjn',
  gaussian: '~floyd-steinberg',
  'cracked-diffuse': '~floyd-steinberg',
  'artifact-modulation': '~floyd-steinberg',
  'vortex-diffusion': '~floyd-steinberg',
  'bayer-void': '~bayer4',
  checkers: '',
  diamond: '',
  'gridlock-traffic': '',
  glitch: '',
  diagonal: '',
  mosaic: '~threshold',
  'bit-tone': '~halftone',
  'block-tone': '~halftone',
  'pop-tone': '~halftone',
  'print-pattern': '~halftone-cmyk',
  beehive: '~honeycomb',
  'orb-diffuse': '~orbs',
  'orb-diffuse-x': '~orbs',
  'orb-diffuse-y': '~orbs',
  'orb-matrix': '~orbs',
  'circle-grid': '~luma-shapes:circle',
  'diamond-grid': '~luma-shapes:diamond',
  'square-mosaic': '~luma-shapes:square',
  'heart-grid': '~luma-shapes:circle',
  'hexa-poly': 'poly-hex',
  'tri-poly': 'poly-tri',
  'penta-poly': '~poly-hex',
  'low-poly': '~poly-tri',
  camo: '~voronoi',
  'displace-contour': '~contour',
  topography: '~contour',
  'dotted-lines': '~contour',
  'sine-distort': '~moire',
  'sine-wave-modulation': '~modulation',
  thresholder: '~modulation',
  wave: '~modulation',
  waveform: '~modulation',
  'waveform-alt': '~modulation',
  'radial-burst': '~radial',
  'radial-peaks': '~radial',
  vortex: '~radial',
  'atkinson-line-modulation': '~atkinson+wave',
  'atkinson-vhs': '~atkinson+wave',
  'stucki-diffusion-lines': '~stucki+wave',
  'artifact-modulation-glitch': '~floyd-steinberg+wave',
  'contrast-aware-x': '~floyd-steinberg+wave',
  'contrast-aware-y': '~floyd-steinberg+wave',
  'modulated-diffuse-x': '~floyd-steinberg+wave',
  'modulated-diffuse-y': '~floyd-steinberg+wave',
  'ordered-modulation': '~floyd-steinberg+wave',
  'smooth-diffuse': '~floyd-steinberg+wave',
  'uniform-modulation-x': '~floyd-steinberg+wave',
  'uniform-modulation-y': '~floyd-steinberg+wave',
  'wave-modulation-x': '~floyd-steinberg+wave',
  'wave-modulation-y': '~floyd-steinberg+wave',
};

export const KNOWN_STYLES = Object.keys(STYLES);

/** Our algorithm for a style name; null when there is no equivalent. */
function mapStyle(style: string): StyleMatch | null {
  const s = style.toLowerCase();
  if (ALGORITHMS.some((a) => a.id === s)) return { algorithm: s, wave: false, approx: false };
  const known = STYLES[s];
  if (known !== undefined) {
    if (!known) return null;
    const m = /^(~?)([a-z0-9-]+)(?::([a-z]+))?(\+wave)?$/.exec(known)!;
    return { algorithm: m[2], approx: !!m[1], shape: m[3] as ShapeBand['shape'] | undefined, wave: !!m[4] };
  }
  const kernel = KERNELS.find(([re]) => re.test(s));
  if (kernel) return { algorithm: kernel[1], wave: /modulat|wave/.test(s), approx: true };
  const pattern = PATTERNS.find(([re]) => re.test(s));
  return pattern ? { algorithm: pattern[1], wave: false, approx: true } : null;
}

const BAYER_SIZES: Record<string, string> = { '2x2': 'bayer2', '4x4': 'bayer4', '8x8': 'bayer8', '16x16': 'bayer16' };

/** A Luma Shapes set drawing every non-empty band as `shape`, coloured from the palette when there is one. */
function shapeGrid(shape: ShapeBand['shape'], colors: string[]): string {
  const bands = shapeSet().map((b, i) => ({
    ...b,
    shape: b.shape === 'empty' ? b.shape : shape,
    color: colors.length >= 2 ? colors[Math.round((i * (colors.length - 1)) / 5)] : b.color,
  }));
  return JSON.stringify(bands);
}

/** Which of our sections an effect instance's type belongs to. */
function kindOf(type: string): string | null {
  const t = type.toLowerCase();
  if (/pixel.?sort/.test(t)) return 'sort';
  if (/adjust/.test(t)) return 'adjust';
  if (/halftone/.test(t)) return 'halftone';
  if (/dither/.test(t)) return 'dither';
  if (/glow|bloom/.test(t)) return 'glow';
  if (/glitch/.test(t)) return 'glitch';
  if (/chroma/.test(t)) return 'chroma';
  if (/tint/.test(t)) return 'tint';
  if (/post|finish/.test(t)) return 'finish';
  if (/temporal|variation|boil/.test(t)) return 'boil';
  return null;
}

interface Instance {
  id: string;
  kind: string | null;
  label: string;
  enabled: boolean;
  settings: Obj;
}

function instances(p: Obj): Instance[] {
  const out: Instance[] = [];
  if (isObj(p.effectInstances)) {
    for (const [id, v] of Object.entries(p.effectInstances)) {
      if (!isObj(v)) continue;
      const settings = isObj(v.settings) ? v.settings : {};
      const type = str(v.type) ?? id;
      out.push({ id, kind: kindOf(type), label: str(v.label) ?? type, enabled: settings.enabled !== false, settings });
    }
  } else if (Array.isArray(p.fxStack)) {
    p.fxStack.forEach((v, i) => {
      if (!isObj(v)) return;
      const settings = isObj(v.settings) ? v.settings : {};
      const type = `${str(v.type) ?? ''} ${str(v.subtype) ?? ''}`;
      const kind = str(v.type) === 'dither' ? 'dither' : kindOf(type);
      const enabled = v.enabled !== false && settings.enabled !== false;
      out.push({
        id: `${i}`,
        kind,
        label: str(v.label) ?? type.trim(),
        enabled,
        settings: { style: v.subtype, ...settings },
      });
    });
  }
  return out;
}

const FX_ID: Record<string, string> = {
  sort: 'sort',
  glow: 'glow',
  glitch: 'glitch',
  chroma: 'chroma',
  tint: 'tint',
  finish: 'finish',
};

function importExternal(p: Obj): ImportResult {
  const out: Record<string, unknown> = {};
  const approximated: string[] = [];
  const skipped: string[] = [];
  const all = instances(p);
  const find = (kind: string) => all.find((i) => i.kind === kind);

  // Palette: from the dither settings, or the top-level colour palette.
  const dither = find('dither');
  const ds: Obj = { ...(isObj(p.dither) ? p.dither : {}), ...(dither?.settings ?? {}) };
  const cp = isObj(p.colorPalette) ? p.colorPalette : {};
  const rawColors = Array.isArray(ds.palette) ? ds.palette : Array.isArray(cp.customColors) ? cp.customColors : [];
  const colors = parseColorList(rawColors.filter((c): c is string => typeof c === 'string').join(' '));
  if (colors.length >= 2) {
    out.palette = 'custom';
    out.customPalette = serializeColorList(colors);
    out.customRamp = colors.length === 2; // duotones read best as a dark → light ramp
  }
  if (typeof ds.linearLight === 'boolean') out.linearLight = ds.linearLight;
  if (typeof ds.paletteMixing === 'string') out.paletteMixing = ds.paletteMixing;
  if (typeof ds.halftoneShape === 'string') out.halftoneShape = ds.halftoneShape;
  if (ds.perceptualMatch === true || cp.perceptualMatch === true) out.perceptual = true;
  if (ds.orderedCycling === true || cp.orderedCycling === true) skipped.push('Ordered colour cycling');

  // Dither style and its controls.
  const style = str(ds.style);
  const mapped = style ? mapStyle(style) : null;
  if (style && !mapped) skipped.push(`Dither style “${style}” (kept the default)`);
  const controls = isObj(ds.controls) ? ds.controls : {};
  if (mapped) {
    const bayer = style!.toLowerCase() === 'bayer-matrix' ? BAYER_SIZES[str(controls.matrixSize) ?? '4x4'] : undefined;
    out.algorithm = bayer ?? mapped.algorithm;
    if (mapped.approx)
      approximated.push(`Dither style “${style}” → ${ALGORITHMS.find((a) => a.id === out.algorithm)!.label}`);
    if (mapped.algorithm === 'threshold') out.threshold = 50; // nearest colour, no dithering
    if (mapped.shape) {
      out.shapeBands = shapeGrid(mapped.shape, colors);
      if (colors.length >= 2) out.shapeBackground = colors[0];
    }
  }
  // Block size in px is 51 − scale (50 when missing). Stacked lists use their own scale, read as a percentage.
  const stacked = !isObj(p.effectInstances) && Array.isArray(p.fxStack);
  const scale = num(ds.scale);
  const block = stacked ? clamp(Math.round(100 / (scale || 100)), 1, 16) : Math.max(1, Math.round(51 - (scale || 50)));
  if (stacked && scale && scale > 0) approximated.push('Scale → pixel size');
  if (style || scale !== undefined) {
    out.pixelSize = clamp(block, 1, 16);
    if (block > 16) approximated.push('Scale → pixel size (capped at 16 px)');
  }
  if (num(ds.luminanceThreshold) !== undefined) skipped.push('Luminance threshold (shadow cut-off)');
  for (const key of [
    'linearLight',
    'paletteMixing',
    'halftoneShape',
    'stippleCount',
    'stippleIterations',
    'stippleSize',
    'stippleSeed',
  ]) {
    if (ds[key] !== undefined) out[key] = ds[key];
    if (controls[key] !== undefined) out[key] = controls[key];
  }
  for (const [key, value] of Object.entries(controls)) {
    const v = num(value);
    if (
      [
        'linearLight',
        'paletteMixing',
        'halftoneShape',
        'stippleCount',
        'stippleIterations',
        'stippleSize',
        'stippleSeed',
      ].includes(key)
    )
      continue;
    if (key === 'matrixSize' && style?.toLowerCase() === 'bayer-matrix') continue;
    if (key === 'serpentine' && typeof value === 'boolean') out.serpentine = value;
    else if (key === 'errorStrength' && v !== undefined) {
      out.diffusion = clamp(v, 0, 100);
      if (v > 100) approximated.push(`Error strength ${v}% (capped at 100%)`);
    } else if (key === 'errorReduction' && v !== undefined && v > 0) out.diffusion = clamp(Math.round(100 / v), 0, 100);
    else if (key === 'dotSize' && v !== undefined && style?.toLowerCase() === 'bit-tone')
      out.cellSize = clamp(4 * Math.round(v) * block, 2, 32);
    else if (key === 'blockSize' && v !== undefined && style?.toLowerCase() === 'mosaic') {
      out.pixelSize = clamp(Math.round(v) * block, 1, 16);
      if (Math.round(v) * block > 16) approximated.push('Mosaic block size (capped at 16 px)');
    } else if (key === 'warpIntensity' && v !== undefined) {
      // Pixels the bottom row moves; Curve moves it by a quarter of the width at 100 (read as ~1000 px wide).
      out.warpCurve = clamp(Math.round((v * 100) / 250), -100, 100);
      approximated.push('Warp intensity → Curve');
    } else if (key === 'twistStrength' && v !== undefined) {
      out.warpSwirl = clamp(Math.round(v / 2), -100, 100);
      approximated.push('Twist → Swirl');
    } else if (key === 'swirl' && v !== undefined && out.algorithm === 'radial') out.radialArms = clamp(Math.round(v), -8, 8);
    else if (key === 'lineSpacing' && v !== undefined) out.cellSize = v;
    else if (key === 'cellSize' && v !== undefined) out.cellSize = v;
    else if (key === 'orbSize' && v !== undefined) out.orbSize = v;
    else if (key === 'orbCount' && v !== undefined) out.orbCount = v;
    else if (key === 'orbIntensity' && v !== undefined) out.orbIntensity = v;
    else if (key === 'orbRandom' && v !== undefined) out.orbRandom = v;
    else if (key === 'orbVertical' && typeof value === 'boolean') out.orbVertical = value;
    else if (/modulation|strength/i.test(key) && v !== undefined && mapped?.wave)
      out.waveStrength = clamp(v * 10, 0, 100);
    else if (/bias|tilt/i.test(key) && v !== undefined && mapped?.wave) out.waveBias = clamp(v * 10, -100, 100);
    else skipped.push(`Dither control “${key}”`);
  }
  if (mapped?.wave) {
    out.waveStrength ??= 50;
    approximated.push('Line modulation → Wave');
  }
  if (Object.keys(controls).some((key) => /^orb/i.test(key))) approximated.push('Orb settings');

  // Halftone stage (overrides the dither style when on).
  if (isObj(p.halftone) && p.halftone.enabled === true) {
    const h = p.halftone;
    out.algorithm = str(h.mode) === 'grayscale' ? 'halftone' : 'halftone-cmyk';
    const set = (key: string, v: number | undefined, f = (x: number) => x) => v !== undefined && (out[key] = f(v));
    if (typeof h.shape === 'string') out.halftoneShape = h.shape;
    set('cellSize', num(h.cellSize));
    set('angle', num(h.grayAngle));
    set('cmykAngleC', num(h.cyanAngle));
    set('cmykAngleM', num(h.magentaAngle));
    set('cmykAngleY', num(h.yellowAngle));
    set('cmykAngleK', num(h.blackAngle));
    set('cmykDotGain', num(h.dotGain), (x) => x * 100);
    set('cmykGcr', num(h.gcr), (x) => x * 100);
    set('cmykSupersample', num(h.supersample));
    if (style) approximated.push('Halftone replaces the dither style');
  }

  for (const inst of all) {
    const s = inst.settings;
    const n = (key: string) => num(s[key]);
    switch (inst.kind) {
      case 'sort': {
        out.fxSort = inst.enabled;
        if (n('low') !== undefined) out.fxSortLow = n('low');
        if (n('high') !== undefined) out.fxSortHigh = n('high');
        if (n('maxLength') !== undefined) out.fxSortLength = n('maxLength');
        if (typeof s.vertical === 'boolean') out.fxSortVertical = s.vertical;
        if (typeof s.reverse === 'boolean') out.fxSortReverse = s.reverse;
        break;
      }
      case 'dither':
      case 'halftone':
        break;
      case 'adjust': {
        if (!inst.enabled) break;
        if (n('brightness') !== undefined) out.brightness = n('brightness')! - 100;
        if (n('contrast') !== undefined) out.contrast = n('contrast')! - 100;
        if (n('saturation') !== undefined) out.saturation = n('saturation');
        if (n('blur') !== undefined) out.blur = n('blur');
        if (n('denoise') !== undefined) out.denoise = n('denoise');
        if (n('hue') !== undefined) out.hue = n('hue');
        if (n('sharpen') !== undefined) out.sharpen = n('sharpen');
        approximated.push('Brightness and contrast (100 read as unchanged)');
        for (const key of ['midtones', 'highlights'])
          if (n(key) !== undefined) skipped.push(`Adjust “${key}” (scale unknown)`);
        break;
      }
      case 'boil': {
        if (!inst.enabled) break;
        out.animate = true;
        out.boilPattern = /blue/i.test(str(s.pattern) ?? '') ? 'blue' : 'random';
        if (n('intensity') !== undefined) out.boilAmount = clamp(n('intensity')! * 20, 0, 100);
        if (n('speed') !== undefined) out.boilFps = clamp(Math.round(n('speed')! * 8), 1, 30);
        approximated.push(`${inst.label} → Boil`);
        break;
      }
      case 'glow': {
        out.fxGlow = inst.enabled;
        if (!inst.enabled) break;
        if (n('threshold') !== undefined) out.fxGlowThreshold = n('threshold');
        if (n('thresholdSmoothing') !== undefined) out.fxGlowSoftness = n('thresholdSmoothing');
        if (n('radius') !== undefined) out.fxGlowRadius = n('radius');
        if (n('intensity') !== undefined) out.fxGlowIntensity = n('intensity')! / 10;
        if (n('aspectRatio') !== undefined) out.fxGlowAspect = n('aspectRatio')! / 100;
        if (n('direction') !== undefined) out.fxGlowAngle = ((n('direction')! % 180) + 180) % 180;
        if (n('falloff') !== undefined) out.fxGlowFalloff = n('falloff')! / 10;
        approximated.push(`${inst.label} → Glow`);
        for (const key of Object.keys(s)) {
          if (
            ![
              'enabled',
              'threshold',
              'thresholdSmoothing',
              'radius',
              'intensity',
              'aspectRatio',
              'direction',
              'falloff',
            ].includes(key)
          ) {
            skipped.push(`${inst.label} “${key}”`);
          }
        }
        break;
      }
      case 'glitch': {
        out.fxGlitch = inst.enabled;
        if (!inst.enabled) break;
        const share = (key: string) => {
          const m = s[key];
          return isObj(m) && m.enabled === true ? clamp(num(m.amount) ?? 0, 0, 100) : 0;
        };
        Object.assign(out, {
          fxGlitchAmount: 100,
          fxGlitchCrush: 0,
          fxGlitchShift: share('blockShift'),
          fxGlitchSwap: share('channelSwap'),
          fxGlitchScan: share('scanlineOffset'),
          fxGlitchScramble: share('blockScramble'),
          fxGlitchInterlace: share('interlaceCorruption'),
        });
        approximated.push(`${inst.label} → JPEG glitch`);
        break;
      }
      case 'chroma': {
        out.fxChroma = inst.enabled;
        if (!inst.enabled) break;
        if (n('maxDisplace') !== undefined) out.fxChromaAmount = n('maxDisplace');
        if (n('redChannel') !== undefined) out.fxChromaR = (n('redChannel')! - 50) * 2;
        if (n('greenChannel') !== undefined) out.fxChromaG = (n('greenChannel')! - 50) * 2;
        if (n('blueChannel') !== undefined) out.fxChromaB = (n('blueChannel')! - 50) * 2;
        approximated.push(`${inst.label} → Chromatic aberration`);
        break;
      }
      case 'tint': {
        out.fxTint = inst.enabled;
        if (!inst.enabled) break;
        const color = parseColorList(str(s.color) ?? '')[0];
        if (color) out.fxTintColor = color;
        // "colorDodge", "Colour Dodge" and "color_dodge" all read as color-dodge.
        const mode = str(s.blendMode)
          ?.replace(/([a-z])([A-Z])/g, '$1-$2')
          .toLowerCase()
          .replace(/colour/g, 'color')
          .replace(/[\s_]+/g, '-');
        if (mode && TINT_MODES.some((m) => m.id === mode)) out.fxTintMode = mode;
        else if (mode) skipped.push(`Tint blend mode “${mode}”`);
        if (n('opacity') !== undefined) out.fxTintOpacity = n('opacity');
        break;
      }
      case 'finish': {
        if (!inst.enabled) break;
        if (s.invert === true) {
          out.invert = true;
          approximated.push('Invert (applied before dithering)');
        }
        const blur = n('blur') ?? 0;
        const sharpen = n('sharpen') ?? 0;
        const hue = n('hue') ?? 0;
        if (blur || sharpen || hue) {
          Object.assign(out, {
            fxFinish: true,
            fxFinishBlur: clamp(blur, 0, 10),
            fxFinishSharpen: sharpen,
            fxFinishHue: hue,
          });
          approximated.push(`${inst.label} → Finish`);
        }
        break;
      }
      default:
        if (inst.enabled) skipped.push(inst.label);
    }
  }

  // Effect order, from the instance order when given.
  const order = Array.isArray(p.pipelineOrder)
    ? p.pipelineOrder.filter((id): id is string => typeof id === 'string')
    : [];
  const fxOrder = order
    .map((id) => all.find((i) => i.id === id))
    .map((i) => (i?.kind ? FX_ID[i.kind] : undefined))
    .filter((id): id is string => !!id);
  if (fxOrder.length) out.fxOrder = fxOrder.join(',');

  importAscii(p, out, approximated, skipped);

  return {
    name: str(p.name)?.slice(0, 40) || 'Imported',
    params: sanitize(out),
    approximated: [...new Set(approximated)],
    skipped: [...new Set(skipped)],
  };
}

function importAscii(p: Obj, out: Record<string, unknown>, approximated: string[], skipped: string[]): void {
  if (!isObj(p.ascii) || p.ascii.enabled !== true) return;
  const a = p.ascii;
  if (num(a.shape) !== undefined) out.asciiShape = num(a.shape);
  out.mode = 'ascii';
  const depth = num(a.depth);
  if (depth !== undefined) out.asciiDepth = depth;
  const offset = num(a.characterOffset);
  if (offset) {
    out.asciiOffset = offset;
    approximated.push('Character offset');
  }
  const custom = str(a.customCharset);
  const set = (str(a.characterSet) ?? '').toLowerCase();
  if (custom) {
    out.asciiCharset = 'custom';
    out.asciiCustom = custom.slice(0, 64);
  } else if (set) {
    const id = /braille/.test(set)
      ? 'braille'
      : /block|shade/.test(set)
        ? 'blocks'
        : /binary/.test(set)
          ? 'binary'
          : /detail|70/.test(set)
            ? 'detailed'
            : 'standard';
    out.asciiCharset = id;
    approximated.push(`Character set “${set}”`);
  }
  if (/bold/i.test(str(a.fontStyle) ?? '')) out.asciiBold = true;
  const color = str(a.characterColor) ?? '';
  if (/palette/i.test(color)) {
    out.asciiColor = 'palette';
    if (out.palette === 'custom') out.asciiPalette = 'custom';
  } else if (/image|original|color|colour/i.test(color)) out.asciiColor = 'color';
  const bg = parseColorList(str(a.backgroundColor) ?? '')[0];
  if (bg) out.asciiBg = bg;
  if (str(a.fontFamily) && a.fontFamily !== 'auto') skipped.push(`Font “${str(a.fontFamily)}”`);
}
