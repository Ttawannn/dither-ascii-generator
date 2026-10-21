import type { AsciiGrid, GridOptions } from './grid';
interface Job {
  data: Uint8Array;
  cols: number;
  rows: number;
  opts: GridOptions;
  done: (grid: AsciiGrid) => void;
}

/** Only the newest queued frame is kept. Shape matching never blocks slider or video input. */
export class ShapeMatcher {
  private worker = new Worker(new URL('./matcher.worker.ts', import.meta.url), { type: 'module' });
  private current: Job | null = null;
  private pending: Job | null = null;
  private waiters: (() => void)[] = [];
  constructor() {
    this.worker.onmessage = (e: MessageEvent<AsciiGrid>) => {
      const job = this.current;
      this.current = null;
      job?.done(e.data);
      if (this.pending) {
        const next = this.pending;
        this.pending = null;
        this.post(next);
      } else this.waiters.splice(0).forEach((f) => f());
    };
    this.worker.onerror = (e) => {
      console.error('Shape matching failed', e.message);
      this.current = this.pending = null;
      this.waiters.splice(0).forEach((f) => f());
    };
  }
  request(data: Uint8Array, cols: number, rows: number, opts: GridOptions, done: (grid: AsciiGrid) => void): void {
    const job = { data, cols, rows, opts, done };
    if (this.current) this.pending = job;
    else this.post(job);
  }
  idle(): Promise<void> {
    return this.current || this.pending ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }
  private post(job: Job): void {
    this.current = job;
    this.worker.postMessage({ data: job.data, cols: job.cols, rows: job.rows, opts: job.opts }, [job.data.buffer]);
  }
}
