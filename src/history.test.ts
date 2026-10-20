import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('History', () => {
  it('undoes and redoes separate changes one at a time', () => {
    const h = new History('a');
    h.change('b', 1000);
    h.change('c', 2000);
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    expect(h.redo()).toBe('c');
    expect(h.redo()).toBeNull();
  });

  it('treats changes close together as one step', () => {
    const h = new History(0);
    for (let i = 1; i <= 20; i++) h.change(i, 1000 + i * 50); // a slider drag
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it('starts a new step after an undo even if the next edit is quick', () => {
    const h = new History('a');
    h.change('b', 1000);
    h.undo();
    h.change('x', 1010);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('a');
  });

  it('keeps at most `limit` steps', () => {
    const h = new History(0, 3);
    for (let i = 1; i <= 10; i++) h.change(i, i * 1000);
    expect([h.undo(), h.undo(), h.undo(), h.undo()]).toEqual([9, 8, 7, null]);
  });
});
