// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertionIndex, reorderGrip } from './reorder';

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers();
  const list = document.createElement('div');
  const card = document.createElement('div');
  const grip = document.createElement('span');
  card.append(grip);
  const divider = document.createElement('div');
  const second = document.createElement('div');
  list.append(card, divider, second); document.body.append(list);
  vi.spyOn(divider, 'getBoundingClientRect').mockReturnValue({ top: 50, height: 20 } as DOMRect);
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({ top: 80, height: 40 } as DOMRect);
  const captured = new Set<number>();
  grip.setPointerCapture = (id) => { captured.add(id); };
  grip.hasPointerCapture = (id) => captured.has(id);
  grip.releasePointerCapture = (id) => { captured.delete(id); };
  const commit = vi.fn();
  reorderGrip(grip, card, () => [divider, second], commit);
  const pointer = (type: string, y: number, pointerType = 'touch') => grip.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType, button: 0, clientX: 10, clientY: y, bubbles: true, cancelable: true }));
  return { pointer, commit, card, divider, second, captured };
}

describe('pointer layer reordering', () => {
  it('counts the divider as a drop slot and supports the end of the list', () => {
    expect(insertionIndex(20, [{ top: 50, height: 20 }, { top: 80, height: 40 }])).toBe(0);
    expect(insertionIndex(70, [{ top: 50, height: 20 }, { top: 80, height: 40 }])).toBe(1);
    expect(insertionIndex(140, [{ top: 50, height: 20 }, { top: 80, height: 40 }])).toBe(2);
  });
  it('waits for a touch hold, shows the drop target and commits only on release', () => {
    const { pointer, commit, card, second } = setup();
    pointer('pointerdown', 20); vi.advanceTimersByTime(249);
    expect(card.classList.contains('dragging')).toBe(false);
    vi.advanceTimersByTime(1);
    pointer('pointermove', 140);
    expect(second.classList.contains('drop-after')).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    pointer('pointerup', 140);
    expect(commit).toHaveBeenCalledExactlyOnceWith(2);
    expect(card.classList.contains('dragging')).toBe(false);
  });
  it('cancels a touch that moves before the hold threshold', () => {
    const { pointer, commit, card, captured } = setup();
    pointer('pointerdown', 20); pointer('pointermove', 40);
    vi.advanceTimersByTime(300); pointer('pointerup', 140);
    expect(commit).not.toHaveBeenCalled();
    expect(card.classList.contains('dragging')).toBe(false);
    expect(captured.size).toBe(0);
  });
  it.each(['pointercancel', 'lostpointercapture'])('cancels without changing the stack on %s', (event) => {
    const { pointer, commit, card, divider } = setup();
    pointer('pointerdown', 20); vi.advanceTimersByTime(250);
    pointer(event, 30);
    expect(commit).not.toHaveBeenCalled();
    expect(card.classList.contains('dragging')).toBe(false);
    expect(divider.classList.contains('drop-before')).toBe(false);
  });
  it('allows mouse dragging immediately after its movement threshold', () => {
    const { pointer, commit, card } = setup();
    pointer('pointerdown', 20, 'mouse'); pointer('pointermove', 70, 'mouse');
    expect(card.classList.contains('dragging')).toBe(true);
    pointer('pointerup', 70, 'mouse');
    expect(commit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
