import type { Params } from './state';

/**
 * Automatic preview resolution for video and webcam playback. Frame costs (ms) are averaged; when
 * they stay over budget the preview renders at a coarser step, and it comes back one step at a
 * time once frames have been comfortably cheap for a while. Stills, pauses and exports always
 * render at full resolution; the user's settings never change.
 */
export class AutoScale {
  /** How much coarser than the settings the preview renders (1 = as set). */
  factor = 1;
  private avg = 0;
  private over = 0;
  private under = 0;

  constructor(
    private budget = 30,
    private steps: readonly number[] = [1, 1.5, 2, 3],
    /** Consecutive slow samples before stepping down, and fast ones before stepping back up. */
    private patience = { down: 8, up: 60 },
  ) {}

  /** Record one frame's cost; true when the factor changed. */
  sample(ms: number): boolean {
    this.avg = this.avg ? this.avg * 0.8 + ms * 0.2 : ms;
    this.over = this.avg > this.budget ? this.over + 1 : 0;
    // Coming back needs headroom: the next finer step costs roughly factor² more.
    this.under = this.avg < this.budget * 0.45 ? this.under + 1 : 0;
    const i = this.steps.indexOf(this.factor);
    if (this.over >= this.patience.down && i < this.steps.length - 1) return this.step(i + 1);
    if (this.under >= this.patience.up && i > 0) return this.step(i - 1);
    return false;
  }

  /** Back to full resolution (paused, stopped, or exporting). */
  reset(): boolean {
    const changed = this.factor !== 1;
    this.factor = 1;
    this.avg = this.over = this.under = 0;
    return changed;
  }

  private step(i: number): boolean {
    this.factor = this.steps[i];
    // Costs at the new size are unknown: start averaging afresh.
    this.avg = this.over = this.under = 0;
    return true;
  }
}

/**
 * `p` rendered `k` times coarser: larger pixels and fewer ASCII columns, with pattern cells scaled
 * to match so the look keeps its proportions on screen.
 */
export function coarser(p: Params, k: number): Params {
  if (k === 1) return p;
  return {
    ...p,
    pixelSize: p.pixelSize * k,
    cellSize: Math.max(1, p.cellSize / k),
    asciiColumns: Math.max(10, Math.round(p.asciiColumns / k)),
  };
}
