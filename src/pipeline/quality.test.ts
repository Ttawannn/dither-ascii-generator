import { describe, expect, it } from 'vitest';
import { srgbToLinear, linearToSrgb } from './color-space';
import { patternCandidates } from './pattern-mix';
import { OSTROMOUKHOV } from './ostromoukhov';
import { diffuse, type DiffusionJob } from './diffuse';
import { DOT_CLASSES, walkHilbert } from './advanced-diffuse';
import { PALETTES, resolvePalette } from './palettes';

function job(overrides: Partial<DiffusionJob> = {}): DiffusionJob {
  const w = 80,
    h = 64,
    data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([128, 128, 128, 255], i * 4);
  return {
    id: 1,
    width: w,
    height: h,
    data,
    kernel: 'floyd-steinberg',
    serpentine: true,
    strength: 1,
    kind: 'ramp',
    colors: new Float32Array([0, 0, 0, 1, 1, 1]),
    levels: 2,
    noise: 0,
    seed: 0,
    ...overrides,
  };
}
const average = (data: Uint8Array, linear = false) => {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += linear ? srgbToLinear(data[i] / 255) : data[i] / 255;
  return sum / (data.length / 4);
};

describe('linear light', () => {
  it('round trips sRGB, including the toe and endpoints', () => {
    for (const v of [0, 0.001, 0.04045, 0.1, 0.5, 0.9, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
  });
  it.each(['floyd-steinberg', 'ostromoukhov', 'dot-diffusion'])(
    '%s preserves energy in two and four-level ramps',
    (kernel) => {
      for (const levels of [2, 4]) {
        const colors = Float32Array.from(
          Array.from({ length: levels }, (_, i) => [i / (levels - 1), i / (levels - 1), i / (levels - 1)]).flat(),
        );
        const p = job({ kernel, linearLight: true, colors, levels });
        expect(average(diffuse(p), true)).toBeCloseTo(srgbToLinear(128 / 255), 1);
      }
      expect(average(diffuse(job({ kernel, linearLight: true })), true)).toBeLessThan(
        average(diffuse(job({ kernel })), true) - 0.2,
      );
    },
  );
  it('leaves the original diffusion byte for byte when off', () => {
    expect(diffuse(job())).toEqual(diffuse(job({ linearLight: false })));
  });
});

describe('palette mixing', () => {
  it('mixes a flat grey in a black/white set with the requested average', () => {
    const pal = new Float32Array([0, 0, 0, 1, 1, 1]);
    const ids = patternCandidates(pal, [0.25, 0.25, 0.25]);
    expect(ids.length).toBe(16);
    expect(ids.reduce((s, i) => s + i, 0)).toBe(4);
    expect(ids).toEqual([...ids].sort());
  });
  it.each(['pico8', 'c64', 'custom'])('reduces average RGB error on a %s colour gradient', (palette) => {
    const pal = resolvePalette(palette, {
      levels: 8,
      ink: '#000000',
      paper: '#ffffff',
      extracted: null,
      custom: '#000000 #dd4422 #2244dd #ffffff',
      customRamp: false,
    });
    const colors = new Float32Array(pal.colors.flat());
    let mixed = 0,
      nearest = 0;
    for (let k = 1; k < 32; k++) {
      const target = [k / 32, 0.4, 1 - k / 32];
      const ids = patternCandidates(colors, target);
      const mean = [0, 0, 0];
      for (const id of ids) for (let c = 0; c < 3; c++) mean[c] += colors[id * 3 + c] / 16;
      mixed += mean.reduce((s, v, c) => s + (v - target[c]) ** 2, 0);
      nearest += Math.min(...pal.colors.map((color) => color.reduce((s, v, c) => s + (v - target[c]) ** 2, 0)));
    }
    expect(mixed).toBeLessThan(nearest);
  });
  it('is deterministic, stays in the palette and supports linear/OKLab combinations', () => {
    const colors = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1]);
    for (const linear of [false, true])
      for (const perceptual of [false, true]) {
        const ids = patternCandidates(colors, [0.3, 0.7, 0.5], perceptual, linear);
        expect(ids).toEqual(patternCandidates(colors, [0.3, 0.7, 0.5], perceptual, linear));
        expect(ids.every((i) => i >= 0 && i < 4)).toBe(true);
      }
  });
});

describe('Ostromoukhov', () => {
  it('has 256 symmetric nonnegative, energy-conserving coefficient sets', () => {
    expect(OSTROMOUKHOV).toHaveLength(256);
    for (let i = 0; i < 256; i++) {
      expect(OSTROMOUKHOV[i]).toEqual(OSTROMOUKHOV[255 - i]);
      expect(OSTROMOUKHOV[i].reduce((s, [, , v]) => s + v, 0)).toBeCloseTo(1, 10);
      expect(OSTROMOUKHOV[i].every(([, , v]) => v >= 0)).toBe(true);
    }
    expect(OSTROMOUKHOV[0][0][2]).toBeCloseTo(13 / 18);
    expect(OSTROMOUKHOV[64][2][2]).toBe(0);
  });
  it('always uses serpentine, regardless of the old toggle', () => {
    expect(diffuse(job({ kernel: 'ostromoukhov', serpentine: false }))).toEqual(
      diffuse(job({ kernel: 'ostromoukhov', serpentine: true })),
    );
  });
});

describe('Hilbert and dot traversals', () => {
  it.each(['riemersma', 'dot-diffusion', 'ostromoukhov'])('%s preserves flat-field tone', (kernel) => {
    expect(average(diffuse(job({ kernel })))).toBeCloseTo(128 / 255, 1);
    expect(average(diffuse(job({ kernel, linearLight: true })), true)).toBeCloseTo(srgbToLinear(128 / 255), 1);
  });
  it.each(['riemersma', 'dot-diffusion', 'ostromoukhov'])(
    '%s stays in every resolved palette on odd-sized colour input',
    (kernel) => {
      const width = 17,
        height = 23,
        data = Uint8Array.from({ length: width * height * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
      for (const def of PALETTES) {
        const pal = resolvePalette(def.id, {
          levels: 4,
          ink: '#251041',
          paper: '#ffeeaa',
          extracted: [
            [0, 0, 0],
            [1, 0.4, 0.1],
            [1, 1, 1],
          ],
          custom: '#112233 #ee4499 #fafafa',
          customRamp: false,
        });
        for (const linearLight of [false, true]) {
          const out = diffuse(
            job({
              kernel,
              width,
              height,
              data,
              kind: pal.kind,
              colors: new Float32Array(pal.colors.flat()),
              levels: pal.levels,
              linearLight,
              perceptual: true,
            }),
          );
          const allowed = new Set(pal.colors.map((c) => c.map((v) => Math.round(v * 255)).join(',')));
          for (let i = 0; i < out.length; i += 4) {
            expect(out[i + 3]).toBe(255);
            if (pal.kind !== 'rgb') expect(allowed.has([...out.subarray(i, i + 3)].join(',')), def.id).toBe(true);
          }
        }
      }
    },
  );
  it.each([
    [1, 1],
    [1, 257],
    [257, 1],
    [7, 13],
    [64, 64],
  ])('visits every pixel exactly once in a %s×%s rectangle', (w, h) => {
    const points: number[] = [];
    walkHilbert(w, h, (x, y) => {
      expect(x).toBeLessThan(w);
      expect(y).toBeLessThan(h);
      points.push(y * w + x);
    });
    expect(new Set(points).size).toBe(w * h);
    expect(points.length).toBe(w * h);
  });
  it('uses every dot class exactly once', () =>
    expect([...DOT_CLASSES].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i)));
  it.each(['riemersma', 'dot-diffusion', 'ostromoukhov'])('%s handles every palette kind and seeded boil', (kernel) => {
    for (const kind of ['ramp', 'set', 'rgb'] as const)
      for (const linearLight of [false, true]) {
        const j = job({ kernel, kind, linearLight, noise: 0.1, seed: 17 });
        const a = diffuse(j);
        expect(a).toEqual(diffuse(j));
        expect(average(a)).toBeGreaterThan(0.1);
        expect(average(a)).toBeLessThan(0.9);
        for (let i = 0; i < a.length; i += 4) {
          expect(a[i + 3]).toBe(255);
          expect([0, 255]).toContain(a[i]);
        }
        expect(diffuse({ ...j, seed: 18 })).not.toEqual(a);
      }
  });
  it.each(['riemersma', 'dot-diffusion', 'ostromoukhov'])('%s keeps black and white endpoints solid', (kernel) => {
    for (const v of [0, 255]) {
      const j = job({ kernel });
      for (let i = 0; i < j.data.length; i += 4) j.data.set([v, v, v, 255], i);
      const a = diffuse(j);
      expect(average(a)).toBe(v / 255);
    }
  });
});
