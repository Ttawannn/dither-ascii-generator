// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULTS, FX_SLIDERS, Store } from '../state';
import { freeSlider, slider, toggle } from './controls';

afterEach(() => document.body.replaceChildren());
// Happy DOM's WheelEvent currently omits the MouseEvent modifier fields.
function wheel(init: WheelEventInit): WheelEvent {
  const event = new WheelEvent('wheel', init);
  Object.defineProperties(event, {
    shiftKey: { value: init.shiftKey ?? false },
    ctrlKey: { value: init.ctrlKey ?? false },
    metaKey: { value: init.metaKey ?? false },
  });
  return event;
}
function radius() {
  const store = new Store();
  store.apply(DEFAULTS);
  const root = slider(FX_SLIDERS.glow[0], store);
  document.body.append(root);
  return { root, store, input: root.querySelector<HTMLInputElement>('[type=range]')!, editor: root.querySelector<HTMLInputElement>('[type=number]')!, button: root.querySelector<HTMLButtonElement>('.value-button')! };
}

describe('numeric control editing', () => {
  it('commits once with Enter, clamps, and keeps its visible value in sync', () => {
    const { button, editor, input, store } = radius();
    button.click();
    editor.value = '999';
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(store.params.fxGlowRadius).toBe(200);
    expect(input.value).toBe('200');
    expect(button.textContent).toBe('200px');
    expect(editor.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
  it('Esc cancels and blank input leaves the previous number alone', () => {
    const { button, editor, store } = radius();
    button.click(); editor.value = '100';
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(store.params.fxGlowRadius).toBe(DEFAULTS.fxGlowRadius);
    button.click(); editor.value = ''; editor.blur();
    expect(store.params.fxGlowRadius).toBe(DEFAULTS.fxGlowRadius);
  });
  it('lets an unfocused wheel scroll normally, but focused Shift-wheel changes ten steps', () => {
    const { input, store } = radius();
    const normal = wheel({ deltaY: -1, cancelable: true, bubbles: true });
    input.dispatchEvent(normal);
    expect(normal.defaultPrevented).toBe(false);
    expect(store.params.fxGlowRadius).toBe(DEFAULTS.fxGlowRadius);
    input.focus();
    const shifted = wheel({ deltaY: -1, shiftKey: true, cancelable: true, bubbles: true });
    input.dispatchEvent(shifted);
    expect(shifted.defaultPrevented).toBe(true);
    expect(store.params.fxGlowRadius).toBe(DEFAULTS.fxGlowRadius + 10);
  });
  it('preserves browser zoom gestures and supports standalone animation sliders', () => {
    const { input, store } = radius(); input.focus();
    const zoom = wheel({ deltaY: -1, ctrlKey: true, cancelable: true });
    input.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(false);
    expect(store.params.fxGlowRadius).toBe(DEFAULTS.fxGlowRadius);
    let value = 0;
    const free = freeSlider({ label: 'From', min: 0, max: 1, step: 0.05 }, 0.5, (v) => { value = v; });
    document.body.append(free);
    free.querySelector<HTMLButtonElement>('.value-button')!.click();
    const editor = free.querySelector<HTMLInputElement>('[type=number]')!;
    editor.value = '0.88'; editor.blur();
    expect(value).toBe(0.9);
  });
});

describe('accessible hints', () => {
  it('connects each tooltip to its input and keeps info buttons outside switches', () => {
    const store = new Store();
    const root = toggle('linearLight', 'Linear light', store);
    document.body.append(root);
    const input = root.querySelector('[role=switch]')!;
    const info = root.querySelector<HTMLButtonElement>('.hint-button')!;
    const tooltip = root.querySelector('[role=tooltip]')!;
    expect(input.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(input.contains(info)).toBe(false);
    info.click();
    expect(root.classList.contains('hint-open')).toBe(true);
    expect(store.params.linearLight).toBe(DEFAULTS.linearLight);
    info.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.classList.contains('hint-open')).toBe(false);
  });
});
