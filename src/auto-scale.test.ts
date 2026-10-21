import { describe, expect, it } from 'vitest';
import { AutoScale, coarser } from './auto-scale';
import { DEFAULTS } from './state';

const feed = (a: AutoScale, ms: number, n: number) => {
  let changes = 0;
  for (let i = 0; i < n; i++) if (a.sample(ms)) changes++;
  return changes;
};

describe('AutoScale', () => {
  it('stays at full resolution while frames fit the budget', () => {
    const a = new AutoScale(30);
    expect(feed(a, 25, 500)).toBe(0);
    expect(a.factor).toBe(1);
  });

  it('steps down after a run of slow frames, one step at a time', () => {
    const a = new AutoScale(30);
    feed(a, 60, 7);
    expect(a.factor).toBe(1); // a few slow frames are not enough
    feed(a, 60, 1);
    expect(a.factor).toBe(1.5);
    feed(a, 60, 8);
    expect(a.factor).toBe(2);
    feed(a, 60, 100);
    expect(a.factor).toBe(3); // the coarsest step
  });

  it('ignores a single spike', () => {
    const a = new AutoScale(30);
    feed(a, 10, 20);
    a.sample(200);
    feed(a, 10, 20);
    expect(a.factor).toBe(1);
  });

  it('comes back only with real headroom (hysteresis)', () => {
    const a = new AutoScale(30);
    feed(a, 60, 8);
    expect(a.factor).toBe(1.5);
    feed(a, 20, 200); // fits the budget, but not with room to spare
    expect(a.factor).toBe(1.5);
    feed(a, 10, 59);
    expect(a.factor).toBe(1.5);
    feed(a, 10, 10);
    expect(a.factor).toBe(1);
  });

  it('resets to full resolution', () => {
    const a = new AutoScale(30);
    feed(a, 60, 8);
    expect(a.reset()).toBe(true);
    expect(a.factor).toBe(1);
    expect(a.reset()).toBe(false);
  });
});

describe('coarser', () => {
  it('scales pixel size, pattern cells and ASCII columns together', () => {
    const p = { ...DEFAULTS, pixelSize: 2, cellSize: 8, asciiColumns: 120 };
    expect(coarser(p, 1)).toBe(p);
    const c = coarser(p, 2);
    expect([c.pixelSize, c.cellSize, c.asciiColumns]).toEqual([4, 4, 60]);
    expect({ ...c, pixelSize: 2, cellSize: 8, asciiColumns: 120 }).toEqual(p);
  });
});
