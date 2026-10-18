/**
 * Blue-noise threshold map via Ulichney's void-and-cluster method.
 * Returns `size * size` bytes; each value is the pixel's rank scaled to 0..255.
 * 64×64 takes well under 100 ms, so it is generated at startup instead of shipped as an asset.
 */
export function blueNoise(size = 64, sigma = 1.5): Uint8Array {
  const n = size * size;

  // Toroidal Gaussian energy kernel, indexed by wrapped (dx, dy).
  const lut = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x, size - x);
      const dy = Math.min(y, size - y);
      lut[y * size + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }

  const pattern = new Uint8Array(n);
  const energy = new Float32Array(n);
  const toggle = (i: number, on: boolean) => {
    pattern[i] = on ? 1 : 0;
    const px = i % size;
    const py = (i / size) | 0;
    const s = on ? 1 : -1;
    for (let y = 0; y < size; y++) {
      const row = ((y - py + size) % size) * size;
      for (let x = 0; x < size; x++) energy[y * size + x] += s * lut[row + ((x - px + size) % size)];
    }
  };
  const tightestCluster = () => {
    let best = -1;
    let max = -Infinity;
    for (let i = 0; i < n; i++) if (pattern[i] && energy[i] > max) [max, best] = [energy[i], i];
    return best;
  };
  const largestVoid = () => {
    let best = -1;
    let min = Infinity;
    for (let i = 0; i < n; i++) if (!pattern[i] && energy[i] < min) [min, best] = [energy[i], i];
    return best;
  };

  // Deterministic PRNG so the pattern is identical across reloads.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  // Initial binary pattern (~10% ones), relaxed until stable.
  const initial = Math.floor(n * 0.1);
  for (let placed = 0; placed < initial; ) {
    const i = Math.floor(rand() * n);
    if (!pattern[i]) {
      toggle(i, true);
      placed++;
    }
  }
  for (;;) {
    const c = tightestCluster();
    toggle(c, false);
    const v = largestVoid();
    if (v === c) {
      toggle(c, true);
      break;
    }
    toggle(v, true);
  }

  const rank = new Uint32Array(n);
  const prototype = pattern.slice();
  const protoEnergy = energy.slice();

  // Phase 1: remove clusters from the prototype, ranking downward.
  for (let r = initial - 1; r >= 0; r--) {
    const c = tightestCluster();
    toggle(c, false);
    rank[c] = r;
  }

  // Phases 2 + 3: from the prototype, fill voids, ranking upward.
  pattern.set(prototype);
  energy.set(protoEnergy);
  for (let r = initial; r < n; r++) {
    const v = largestVoid();
    toggle(v, true);
    rank[v] = r;
  }

  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(((rank[i] + 0.5) / n) * 256);
  return out;
}

let tile: Uint8Array | null = null;
/** The shared 64×64 tile (dither shader, boil jitter), generated on first use. */
export const blueNoiseTile = (): Uint8Array => (tile ??= blueNoise(64));
