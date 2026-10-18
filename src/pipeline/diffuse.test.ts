import { describe, expect, it } from 'vitest';
import { ALGORITHMS, KERNELS } from './algorithms';
import { blueNoiseTile } from './bluenoise';
import { diffuse, type DiffusionJob } from './diffuse';

const SIZE = 64;

function grey(value: number): Uint8Array {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value, value, 255], i);
  return data;
}

function job(overrides: Partial<DiffusionJob> = {}): DiffusionJob {
  return {
    id: 1,
    width: SIZE,
    height: SIZE,
    data: grey(128),
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

const whiteFraction = (out: Uint8Array) => {
  let white = 0;
  for (let i = 0; i < out.length; i += 4) if (out[i] === 255) white++;
  return white / (out.length / 4);
};

describe('algorithm table', () => {
  it('gives every GPU algorithm its own shader index', () => {
    const gpu = ALGORITHMS.filter((a) => a.shader !== undefined).map((a) => a.shader);
    expect(new Set(gpu).size).toBe(gpu.length);
  });
});

describe('error-diffusion kernels', () => {
  it('exist for every diffusion algorithm', () => {
    for (const a of ALGORITHMS.filter((a) => a.group === 'diffusion')) expect(KERNELS[a.id], a.id).toBeDefined();
  });

  it('only push error forward and never add energy', () => {
    for (const [id, kernel] of Object.entries(KERNELS)) {
      for (const [dx, dy] of kernel) expect(dy > 0 || dx > 0, id).toBe(true);
      const sum = kernel.reduce((s, [, , w]) => s + w, 0);
      // Atkinson deliberately drops a quarter of the error.
      expect(sum, id).toBeCloseTo(id === 'atkinson' ? 0.75 : 1, 6);
    }
  });
});

describe('diffuse', () => {
  it('outputs only palette colours with opaque alpha', () => {
    const out = diffuse(job());
    for (let i = 0; i < out.length; i += 4) {
      expect([0, 255]).toContain(out[i]);
      expect(out[i + 3]).toBe(255);
    }
  });

  it.each(Object.keys(KERNELS).filter((k) => k !== 'atkinson'))('%s preserves mid-grey brightness', (kernel) => {
    expect(whiteFraction(diffuse(job({ kernel })))).toBeCloseTo(128 / 255, 1);
  });

  it('thresholds when strength is 0', () => {
    expect(whiteFraction(diffuse(job({ strength: 0, data: grey(140) })))).toBe(1);
    expect(whiteFraction(diffuse(job({ strength: 0, data: grey(100) })))).toBe(0);
  });

  it('picks the nearest colour of a set palette, and diffuses the remainder', () => {
    const colors = new Float32Array([1, 0, 0, 0, 0, 1]); // red, blue
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < data.length; i += 4) data.set([230, 20, 20, 255], i);

    const nearest = diffuse(job({ kind: 'set', colors, data, strength: 0 }));
    for (let i = 0; i < nearest.length; i += 4) expect([nearest[i], nearest[i + 1], nearest[i + 2]]).toEqual([255, 0, 0]);

    // With diffusion the accumulated error turns a few pixels blue, but red still dominates.
    const diffused = diffuse(job({ kind: 'set', colors, data }));
    let red = 0;
    for (let i = 0; i < diffused.length; i += 4) if (diffused[i] === 255) red++;
    expect(red / (SIZE * SIZE)).toBeGreaterThan(0.8);
  });

  it('matches set palettes by perceived lightness when perceptual', () => {
    const colors = new Float32Array([0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1]);
    const data = grey(56); // ≈ 0.22: nearer black in RGB, nearer mid grey in OKLab
    const rgb = diffuse(job({ kind: 'set', colors, levels: 3, data, strength: 0 }));
    const lab = diffuse(job({ kind: 'set', colors, levels: 3, data, strength: 0, perceptual: true }));
    expect(rgb[0]).toBe(0);
    expect(lab[0]).toBe(128);
  });

  it('takes boil jitter from a blue-noise tile when given one', () => {
    const tile = blueNoiseTile();
    expect(blueNoiseTile()).toBe(tile);
    const blue = diffuse(job({ noise: 0.06, seed: 3, noiseTile: tile }));
    expect(diffuse(job({ noise: 0.06, seed: 3, noiseTile: tile }))).toEqual(blue);
    expect(diffuse(job({ noise: 0.06, seed: 4, noiseTile: tile }))).not.toEqual(blue);
    expect(diffuse(job({ noise: 0.06, seed: 3 }))).not.toEqual(blue);
  });

  it('wave diffusion: zero strength changes nothing, otherwise draws lines but keeps the tone', () => {
    const plain = diffuse(job());
    expect(diffuse(job({ wave: [0, 12, 0] }))).toEqual(plain);

    const waved = diffuse(job({ wave: [1, 12, 0] }));
    expect(waved).not.toEqual(plain);
    const white = (d: Uint8Array) => {
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 255) n++;
      return n / (d.length / 4);
    };
    expect(white(waved)).toBeCloseTo(white(plain), 1);

    // Horizontal waves: row coverage swings with the sine, so rows differ far more than with no wave.
    const rowSpread = (d: Uint8Array) => {
      const rows = Array.from({ length: SIZE }, (_, y) => {
        let n = 0;
        for (let x = 0; x < SIZE; x++) if (d[(y * SIZE + x) * 4] === 255) n++;
        return n / SIZE;
      });
      const m = rows.reduce((a, b) => a + b) / SIZE;
      return rows.reduce((a, b) => a + (b - m) ** 2, 0) / SIZE;
    };
    expect(rowSpread(waved)).toBeGreaterThan(rowSpread(plain) * 4);
  });

  it('wave diffusion moves with the boil seed and tilts with the bias', () => {
    const a = diffuse(job({ wave: [1, 12, 0], seed: 1 }));
    expect(diffuse(job({ wave: [1, 12, 0], seed: 1 }))).toEqual(a);
    expect(diffuse(job({ wave: [1, 12, 0], seed: 2 }))).not.toEqual(a);
    expect(diffuse(job({ wave: [1, 12, 0.5], seed: 1 }))).not.toEqual(a);
  });

  it('is deterministic for a given boil seed and changes with it', () => {
    const a = diffuse(job({ noise: 0.06, seed: 3 }));
    expect(diffuse(job({ noise: 0.06, seed: 3 }))).toEqual(a);
    expect(diffuse(job({ noise: 0.06, seed: 4 }))).not.toEqual(a);
  });
});
