import { describe, expect, it } from 'vitest';
import { nextLevel, sheetHeights, snapSheet } from './sheet';

const h = sheetHeights(800, 44, 90); // peek 90, half 400, full 756

describe('sheetHeights', () => {
  it('gives the head, half the screen and everything below the header', () => {
    expect(h).toEqual({ peek: 90, half: 400, full: 756 });
  });
  it('never goes below the head on tiny screens', () => {
    expect(sheetHeights(120, 44, 90)).toEqual({ peek: 90, half: 90, full: 90 });
  });
});

describe('snapSheet', () => {
  it('settles on the nearest level', () => {
    expect(snapSheet(150, h)).toBe('peek');
    expect(snapSheet(380, h)).toBe('half');
    expect(snapSheet(700, h)).toBe('full');
  });
  it('follows a flick to the next level in its direction', () => {
    expect(snapSheet(420, h, 1)).toBe('full');
    expect(snapSheet(380, h, -1)).toBe('peek');
    expect(snapSheet(380, h, 1)).toBe('half');
    expect(snapSheet(756, h, 1)).toBe('full');
    expect(snapSheet(90, h, -1)).toBe('peek');
  });
  it('ignores slow movement', () => {
    expect(snapSheet(380, h, 0.2)).toBe('half');
  });
});

describe('nextLevel', () => {
  it('cycles peek → half → full → peek', () => {
    expect([nextLevel('peek'), nextLevel('half'), nextLevel('full')]).toEqual(['half', 'full', 'peek']);
  });
});
