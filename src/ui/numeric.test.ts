import { describe, expect, it } from 'vitest';
import { sliderNumber } from './numeric';

describe('typed slider numbers', () => {
  it('clamps at both limits before snapping', () => {
    expect(sliderNumber(999, 1, 200, 1)).toBe(200);
    expect(sliderNumber(-99, 1, 200, 1)).toBe(1);
  });
  it('snaps decimal steps relative to the minimum without floating-point residue', () => {
    expect(sliderNumber(0.88, 0.8, 1.6, 0.05)).toBe(0.9);
    expect(sliderNumber(1.15, 0.8, 1.6, 0.05)).toBe(1.15);
    expect(sliderNumber(137, 100, 1000, 100)).toBe(100);
  });
});
