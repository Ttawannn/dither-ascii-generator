// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DEFAULTS, Store } from '../state';
import { matchScore, revealConditions, revealPlan, searchCondition, searchDomain, type RevealChange } from './search';

describe('command matching', () => {
  it('matches in order and ignores case and surrounding whitespace', () => {
    expect(Number.isFinite(matchScore(' GLW ', 'Glow'))).toBe(true);
    expect(matchScore('wlg', 'Glow')).toBe(Infinity);
  });
  it('ranks contiguous and word-prefix matches ahead of scattered letters', () => {
    expect(matchScore('glow', 'Glow')).toBeLessThan(matchScore('glow', 'Afterglow'));
    expect(matchScore('glow', 'Glow')).toBeLessThan(matchScore('glow', 'Great long orange wave'));
  });
  it('supports Thai and empty queries', () => {
    expect(Number.isFinite(matchScore('เรือง', 'เรืองแสง'))).toBe(true);
    expect(matchScore('', 'Anything')).toBe(0);
    expect(matchScore('ไม่มี', 'Glow')).toBe(Infinity);
  });
});

describe('revealing a conditional search result', () => {
  it('opens outer mode and inner algorithm conditions through the store', () => {
    const s = new Store();
    s.apply({ ...DEFAULTS, mode: 'ascii', algorithm: 'floyd' });
    searchDomain(s, 'mode', () => ['dither', 'ascii']);
    searchDomain(s, 'algorithm', () => ['floyd', 'gaussian']);
    const outer = document.createElement('div');
    const inner = document.createElement('input');
    outer.append(inner);
    searchCondition(outer, s, (p) => p.mode === 'dither');
    searchCondition(inner, s, (p) => p.algorithm === 'gaussian');
    expect(revealConditions(inner)).toBe(true);
    expect(s.params.mode).toBe('dither');
    expect(s.params.algorithm).toBe('gaussian');
  });
  it('can satisfy a compound condition without trial writes', () => {
    const s = new Store();
    s.apply(DEFAULTS);
    searchDomain(s, 'algorithm', () => ['floyd', 'bayer4']);
    searchDomain(s, 'palette', () => ['mono', 'gameboy']);
    const node = document.createElement('input');
    searchCondition(node, s, (p) => p.algorithm === 'bayer4' && p.palette === 'gameboy');
    const changes: string[] = [];
    s.subscribe((_, key) => changes.push(key));
    expect(revealConditions(node)).toBe(true);
    expect(changes).toEqual(['algorithm', 'palette']);
  });
  it('leaves settings alone if a source-dependent predicate cannot be satisfied', () => {
    const s = new Store();
    const before = { ...s.params };
    const node = document.createElement('input');
    searchCondition(node, s, () => false);
    expect(revealConditions(node)).toBe(false);
    expect(s.params).toEqual(before);
  });
  it('plans the changes without making them, then reports the ones it made', () => {
    const s = new Store();
    s.apply({ ...DEFAULTS, mode: 'ascii', algorithm: 'floyd' });
    searchDomain(s, 'mode', () => ['dither', 'ascii'], { name: 'Mode', value: (v) => (v === 'dither' ? 'Dither' : 'ASCII') });
    searchDomain(s, 'algorithm', () => ['floyd', 'radial']);
    const outer = document.createElement('div');
    const inner = document.createElement('input');
    outer.append(inner);
    searchCondition(outer, s, (p) => p.mode === 'dither');
    searchCondition(inner, s, (p) => p.algorithm === 'radial');
    const plan = revealPlan(inner)!;
    expect(plan.map((c) => [c.key, c.value, c.name, c.shown])).toEqual([['mode', 'dither', 'Mode', 'Dither'], ['algorithm', 'radial', undefined, undefined]]);
    expect(s.params.mode).toBe('ascii');
    const applied: RevealChange[] = [];
    expect(revealConditions(inner, applied)).toBe(true);
    expect(applied.map((c) => c.key)).toEqual(['mode', 'algorithm']);
    expect(revealPlan(inner)).toEqual([]);
  });
  it('plans null when nothing can show the control', () => {
    const s = new Store();
    const node = document.createElement('input');
    searchCondition(node, s, () => false);
    expect(revealPlan(node)).toBeNull();
  });
});
