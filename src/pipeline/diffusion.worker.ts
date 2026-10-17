import { diffuse, type DiffusionJob, type DiffusionResult } from './diffuse';

self.onmessage = (e: MessageEvent<DiffusionJob>) => {
  const job = e.data;
  const t0 = performance.now();
  const data = diffuse(job);
  const ms = performance.now() - t0;
  const result: DiffusionResult = { id: job.id, width: job.width, height: job.height, data, ms };
  (self as unknown as Worker).postMessage(result, [data.buffer]);
};
