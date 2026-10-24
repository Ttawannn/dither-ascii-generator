// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { panel } from './panel';
import { header } from './shell';
import { exportFoot } from './panel/export';

let handle: HTMLButtonElement;
beforeAll(async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {} }));
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  document.body.append(header, panel);
  vi.spyOn(header, 'offsetHeight', 'get').mockReturnValue(48);
  vi.spyOn(exportFoot, 'offsetHeight', 'get').mockReturnValue(160);
  await import('./sheet');
  handle = panel.querySelector<HTMLButtonElement>('.sheet-handle')!;
  vi.spyOn(handle, 'offsetHeight', 'get').mockReturnValue(40);
  handle.setPointerCapture = vi.fn();
  window.dispatchEvent(new Event('resize'));
});
const pointer = (type: string, y: number) => handle.dispatchEvent(new PointerEvent(type, {
  pointerId: 1, pointerType: 'touch', button: 0, clientY: y,
}));

describe('mobile sheet gestures', () => {
  it('restores its settled height when a drag is cancelled', () => {
    expect(panel.dataset.sheet).toBe('half');
    pointer('pointerdown', 400); pointer('pointermove', 500);
    expect(document.documentElement.style.getPropertyValue('--sheet-h')).toBe('300px');
    pointer('pointercancel', 500);
    expect(panel.dataset.sheet).toBe('half');
    expect(document.documentElement.style.getPropertyValue('--sheet-h')).toBe('400px');
    expect(panel.classList.contains('dragging')).toBe(false);
  });
  it('supports keyboard expansion and a search request that opens a peeked sheet', () => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(panel.dataset.sheet).toBe('full');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(panel.dataset.sheet).toBe('peek');
    expect(document.documentElement.style.getPropertyValue('--sheet-h')).toBe('200px');
    panel.dispatchEvent(new Event('reveal-settings'));
    expect(panel.dataset.sheet).toBe('full');
    expect(document.documentElement.style.getPropertyValue('--sheet-h')).toBe('752px');
  });
  it('does not cycle levels when pointer capture is lost', () => {
    pointer('pointerdown', 100);
    handle.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));
    expect(panel.dataset.sheet).toBe('full');
    expect(panel.classList.contains('dragging')).toBe(false);
  });
});
