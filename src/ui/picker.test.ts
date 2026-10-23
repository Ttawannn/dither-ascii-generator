import { describe, expect, it } from 'vitest';
import { sanitizeFavourites } from '../favourites';
import { ALL, categoryFor, FAVOURITES, itemsIn, stepItem, type PickItem } from './picker';

const items: PickItem[] = [
  { value: 'a1', label: 'A1', category: 'a' },
  { value: 'a2', label: 'A2', category: 'a' },
  { value: 'b1', label: 'B1', category: 'b' },
  { value: 'b2', label: 'B2', category: 'b' },
  { value: 'b3', label: 'B3', category: 'b' },
];

describe('category picker', () => {
  it('lists all items, one category, or the favourites in item order', () => {
    expect(itemsIn(items, ALL, []).length).toBe(5);
    expect(itemsIn(items, 'b', []).map((i) => i.value)).toEqual(['b1', 'b2', 'b3']);
    expect(itemsIn(items, FAVOURITES, ['b2', 'a1']).map((i) => i.value)).toEqual(['a1', 'b2']);
  });

  it('steps through every item of a category and wraps around', () => {
    const seen = ['b1'];
    for (let k = 0; k < 3; k++) seen.push(stepItem(items, seen.at(-1)!, 1, 'b', []));
    expect(seen).toEqual(['b1', 'b2', 'b3', 'b1']);
    expect(stepItem(items, 'b1', -1, 'b', [])).toBe('b3');
    expect(stepItem(items, 'a2', 1, ALL, [])).toBe('b1');
  });

  it('enters a category from outside at its first (›) or last (‹) item', () => {
    expect(stepItem(items, 'a1', 1, 'b', [])).toBe('b1');
    expect(stepItem(items, 'a1', -1, 'b', [])).toBe('b3');
    expect(stepItem(items, 'a1', 1, FAVOURITES, [])).toBe('a1');
  });

  it('keeps the shown category while it holds the value, else follows the value', () => {
    expect(categoryFor(items, 'b2', ALL, [])).toBe(ALL);
    expect(categoryFor(items, 'b2', FAVOURITES, ['b2'])).toBe(FAVOURITES);
    expect(categoryFor(items, 'b2', 'a', [])).toBe('b');
    expect(categoryFor(items, 'zz', 'a', [])).toBe(ALL);
  });

  it('reads stored favourites defensively', () => {
    expect(sanitizeFavourites({ palette: ['x', 'x', 3, 'y'], bad: 'no', algorithm: [] })).toEqual({ palette: ['x', 'y'] });
    expect(sanitizeFavourites(null)).toEqual({});
    expect(sanitizeFavourites(['a'])).toEqual({});
  });
});
