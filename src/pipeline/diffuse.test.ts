import { describe, expect, it } from 'vitest';
import { ALGORITHMS, KERNELS } from './algorithms';
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

  it('is deterministic for a given boil seed and changes with it', () => {
    const a = diffuse(job({ noise: 0.06, seed: 3 }));
    expect(diffuse(job({ noise: 0.06, seed: 3 }))).toEqual(a);
    expect(diffuse(job({ noise: 0.06, seed: 4 }))).not.toEqual(a);
  });
});
