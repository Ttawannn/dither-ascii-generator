import type { DiffusionJob, DiffusionResult } from './diffusion.worker';

type JobInput = Omit<DiffusionJob, 'id'>;

/**
 * Runs error diffusion off the main thread. While a job is running, newer requests
 * replace each other so only the latest one runs next (slider drags stay responsive).
 */
export class Diffuser {
  private worker = new Worker(new URL('./diffusion.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private busy = false;
  private pending: DiffusionJob | null = null;
  private idleWaiters: (() => void)[] = [];

  constructor(private onResult: (r: DiffusionResult) => void) {
    this.worker.onmessage = (e: MessageEvent<DiffusionResult>) => {
      this.busy = false;
      // A newer job is queued: skip this stale frame and run the latest instead.
      if (this.pending) {
        this.post(this.pending);
        this.pending = null;
        return;
      }
      this.onResult(e.data);
      this.idleWaiters.splice(0).forEach((fn) => fn());
    };
    this.worker.onerror = (e) => {
      console.error('Diffusion worker failed', e.message);
      this.busy = false;
      this.pending = null;
      this.idleWaiters.splice(0).forEach((fn) => fn());
    };
  }

  request(input: JobInput): void {
    const job: DiffusionJob = { ...input, id: this.nextId++ };
    if (this.busy) this.pending = job;
    else this.post(job);
  }

  /** Resolves once the latest requested job has been delivered. */
  idle(): Promise<void> {
    if (!this.busy && !this.pending) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private post(job: DiffusionJob): void {
    this.busy = true;
    this.worker.postMessage(job, [job.data.buffer]);
  }
}
