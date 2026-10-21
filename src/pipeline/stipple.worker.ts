import { stipple, type StippleJob } from './stipple';
self.onmessage = (e: MessageEvent<StippleJob>) => {
  try {
    const result = stipple(e.data, (progress) => self.postMessage({ progress }));
    self.postMessage({ result }, { transfer: [result.points.buffer] });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
