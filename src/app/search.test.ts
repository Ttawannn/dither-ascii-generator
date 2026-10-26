// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../state';
import { currentStack } from '../fx-stack';
import { actions, rt, store } from './core';
import { setLang, startTranslating } from './lang';
import { panel } from './panel';
import { header, stage } from './shell';
import { openSearch } from './search';

beforeAll(() => { document.body.append(header, stage, panel); startTranslating(); });
afterEach(() => {
  document.querySelector('dialog')?.close();
  store.apply(DEFAULTS);
  setLang('en');
  rt.current = null;
  vi.restoreAllMocks();
});

describe('hold to show original', () => {
  it('shows the original only while a loaded source is held and releases on cancellation', () => {
    const hold = stage.querySelector<HTMLButtonElement>('.floating-original')!;
    hold.setPointerCapture = vi.fn();
    const show = vi.spyOn(actions, 'setOriginal');
    hold.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
    expect(show).not.toHaveBeenCalled();
    rt.current = {
      kind: 'video', name: 'test', width: 1, height: 1, originalWidth: 1, originalHeight: 1,
      element: document.createElement('video'), dispose: () => {},
    };
    hold.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
    expect(show).toHaveBeenLastCalledWith(true);
    expect(hold.getAttribute('aria-pressed')).toBe('true');
    hold.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    expect(show).toHaveBeenLastCalledWith(false);
    expect(hold.getAttribute('aria-pressed')).toBe('false');
  });
  it('supports keyboard holds and clears comparison when the window loses focus', () => {
    const hold = stage.querySelector<HTMLButtonElement>('.floating-original')!;
    rt.current = {
      kind: 'video', name: 'test', width: 1, height: 1, originalWidth: 1, originalHeight: 1,
      element: document.createElement('video'), dispose: () => {},
    };
    const show = vi.spyOn(actions, 'setOriginal');
    hold.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(show).toHaveBeenLastCalledWith(true);
    window.dispatchEvent(new Event('blur'));
    expect(show).toHaveBeenLastCalledWith(false);
  });
});
function search(query: string) {
  openSearch();
  const input = document.querySelector<HTMLInputElement>('.command-input')!;
  input.value = query;
  input.dispatchEvent(new Event('input'));
  return input;
}
const results = () => [...document.querySelectorAll('.command-result')];
const enter = (input: HTMLElement) => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

describe('command search in the real settings panel', () => {
  it('ranks adding Glow first and creates its layer with Enter', () => {
    const input = search('glow');
    expect(results()[0].textContent).toContain('Add effect · Glow');
    enter(input);
    expect(currentStack(store.params).map((fx) => fx.type)).toEqual(['glow']);
    expect(panel.querySelector('[data-section=effects]')!.classList.contains('folded')).toBe(false);
  });
  it('focuses the slider, rather than its Reset button, and opens a folded section', () => {
    const input = search('brightness');
    enter(input);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Brightness');
    expect(document.activeElement?.getAttribute('type')).toBe('range');
    expect(panel.querySelector('[data-section=adjust]')!.classList.contains('folded')).toBe(false);
  });
  it('finds Thai names in English UI, and English names in Thai UI', () => {
    let input = search('ความสว่าง');
    expect(results().some((row) => row.textContent?.includes('Brightness'))).toBe(true);
    enter(input);
    setLang('th');
    input = search('brightness');
    expect(results().some((row) => row.textContent?.includes('ความสว่าง'))).toBe(true);
    enter(input);
    expect(document.activeElement?.getAttribute('type')).toBe('range');
  });
  it('finds and selects algorithms outside the selected picker category and mode', () => {
    store.set('mode', 'ascii');
    const input = search('Gaussian');
    const result = results().find((row) => row.children[0].textContent === 'Gaussian' && !row.children[1].textContent!.includes('Layer 2'));
    expect(result).toBeDefined();
    // The row says beforehand which setting it will change.
    expect(result!.children[1].textContent).toMatch(/Algorithm → Mode: Dither$/);
    (result as HTMLElement).click();
    expect(store.params.mode).toBe('dither');
    expect(store.params.algorithm).toBe('gaussian');
    expect(input.closest('dialog')!.open).toBe(false);
  });
  it('keeps no-results keyboard navigation safe', () => {
    const input = search('zzzzzzzzzzzzzz');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    enter(input);
    expect(input.closest('dialog')!.open).toBe(true);
    expect(input.getAttribute('aria-activedescendant')).toBe(null);
  });
});
