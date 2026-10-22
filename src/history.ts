/**
 * Undo / redo stack of snapshots. Changes that follow each other within `coalesceMs` count as one
 * step, so dragging a slider or applying a preset (many keys at once) undoes in one go.
 * Time is passed in, which keeps it testable.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastChange = -Infinity;
  private grouping = false;
  private groupChanged = false;

  constructor(
    private current: T,
    private readonly limit = 100,
    private readonly coalesceMs = 400,
  ) {}

  /** The state became `next` at time `now` (ms). */
  change(next: T, now: number): void {
    if ((this.grouping && !this.groupChanged) || (!this.grouping && now - this.lastChange > this.coalesceMs)) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.current = next;
    this.lastChange = now;
    if (this.grouping) this.groupChanged = true;
  }

  beginStep(): void { this.lastChange = -Infinity; }
  beginGroup(): void { this.grouping = true; this.groupChanged = false; }
  endGroup(): void { this.grouping = false; this.lastChange = -Infinity; }

  clear(next: T): void {
    this.current = next; this.past = []; this.future = []; this.lastChange = -Infinity;
    this.grouping = this.groupChanged = false;
  }

  /** Step back; returns the state to restore, or null at the start. */
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    this.lastChange = -Infinity; // the next edit starts a new step
    return prev;
  }

  /** Step forward again; returns the state to restore, or null at the end. */
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    this.lastChange = -Infinity;
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
