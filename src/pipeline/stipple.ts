/** Coordinates and radii use output pixels, with a visual (top-down) origin. */
export interface StippleResult {
  width: number;
  height: number;
  points: Float32Array;
}
export interface StippleJob {
  width: number;
  height: number;
  data: Uint8Array;
  count: number;
  iterations: number;
  size: number;
  seed: number;
}

/** Weighted Lloyd relaxation using a spatial grid and sampled image quadrature. */
export function stipple(job: StippleJob, progress: (value: number) => void = () => {}): StippleResult {
  const { width: w, height: h } = job;
  const n = w * h;
  const density = new Float32Array(n);
  let mass = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4;
      const d = 1 - (0.2126 * job.data[i] + 0.7152 * job.data[i + 1] + 0.0722 * job.data[i + 2]) / 255;
      density[y * w + x] = Math.max(0, d);
      mass += Math.max(0, d);
    }
  const result: StippleResult = { width: w, height: h, points: new Float32Array(0) };
  if (mass < 1e-6 || !n) {
    progress(1);
    return result;
  }
  const count = Math.max(1, Math.min(30000, Math.round(job.count)));
  const points = new Float32Array(count * 3);
  let rng = job.seed >>> 0 || 1;
  const random = () => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 0) / 4294967296;
  };
  let filled = 0;
  for (let tries = 0; filled < count && tries < count * 50; tries++) {
    const x = random() * w,
      y = random() * h;
    if (random() >= density[Math.min(h - 1, y | 0) * w + Math.min(w - 1, x | 0)]) continue;
    points[filled * 3] = x;
    points[filled * 3 + 1] = y;
    filled++;
  }
  // Very sparse inputs: an exact density CDF finishes in bounded time, without uniform stray dots.
  if (filled < count) {
    const cdf = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) cdf[i] = sum += density[i];
    while (filled < count) {
      const value = random() * mass;
      let lo = 0,
        hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] <= value) lo = mid + 1;
        else hi = mid;
      }
      points[filled * 3] = (lo % w) + random();
      points[filled * 3 + 1] = Math.floor(lo / w) + random();
      filled++;
    }
  }
  progress(0.05);
  const cell = Math.max(1, Math.sqrt(n / count) * 1.5),
    gw = Math.ceil(w / cell),
    gh = Math.ceil(h / cell);
  const heads = new Int32Array(gw * gh),
    next = new Int32Array(count);
  const sx = new Float64Array(count),
    sy = new Float64Array(count),
    weights = new Float64Array(count);
  const stride = Math.max(1, Math.ceil(Math.sqrt(n / 180000)));
  const iterations = Math.max(0, Math.min(20, Math.round(job.iterations)));
  for (let iteration = 0; iteration < iterations; iteration++) {
    heads.fill(-1);
    sx.fill(0);
    sy.fill(0);
    weights.fill(0);
    for (let i = 0; i < count; i++) {
      const bin =
        Math.min(gh - 1, Math.floor(points[i * 3 + 1] / cell)) * gw +
        Math.min(gw - 1, Math.floor(points[i * 3] / cell));
      next[i] = heads[bin];
      heads[bin] = i;
    }
    for (let y = 0; y < h; y += stride)
      for (let x = 0; x < w; x += stride) {
        const d = density[y * w + x];
        if (d <= 0) continue;
        const px = x + 0.5,
          py = y + 0.5,
          gx = Math.floor(px / cell),
          gy = Math.floor(py / cell);
        let best = -1,
          dist = Infinity;
        for (let ring = 0; ring < Math.max(gw, gh); ring++) {
          const x0 = Math.max(0, gx - ring),
            x1 = Math.min(gw - 1, gx + ring),
            y0 = Math.max(0, gy - ring),
            y1 = Math.min(gh - 1, gy + ring);
          for (let yy = y0; yy <= y1; yy++)
            for (let xx = x0; xx <= x1; xx++) {
              if (ring > 0 && Math.abs(xx - gx) !== ring && Math.abs(yy - gy) !== ring) continue;
              for (let i = heads[yy * gw + xx]; i >= 0; i = next[i]) {
                const dd = (points[i * 3] - px) ** 2 + (points[i * 3 + 1] - py) ** 2;
                if (dd < dist) {
                  best = i;
                  dist = dd;
                }
              }
            }
          // Distance to the nearest unvisited grid cell is a lower bound for any unseen point.
          const edge = Math.min(
            x0 === 0 ? Infinity : px - x0 * cell,
            x1 === gw - 1 ? Infinity : (x1 + 1) * cell - px,
            y0 === 0 ? Infinity : py - y0 * cell,
            y1 === gh - 1 ? Infinity : (y1 + 1) * cell - py,
          );
          if (dist <= edge * edge) break;
        }
        if (best >= 0) {
          weights[best] += d;
          sx[best] += px * d;
          sy[best] += py * d;
        }
      }
    for (let i = 0; i < count; i++)
      if (weights[i] > 0) {
        points[i * 3] = sx[i] / weights[i];
        points[i * 3 + 1] = sy[i] / weights[i];
      }
    progress(0.05 + (0.9 * (iteration + 1)) / Math.max(1, iterations));
  }
  const radius = (Math.sqrt(mass / count / Math.PI) * job.size) / 100;
  for (let i = 0; i < count; i++) {
    const d = density[Math.min(h - 1, points[i * 3 + 1] | 0) * w + Math.min(w - 1, points[i * 3] | 0)];
    points[i * 3 + 2] = radius * (0.65 + 0.35 * Math.sqrt(d));
  }
  progress(1);
  return { width: w, height: h, points };
}
