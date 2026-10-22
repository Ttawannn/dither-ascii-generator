export const SHAPE_W = 4;
export const SHAPE_H = 8;
export const SHAPE_SAMPLES = SHAPE_W * SHAPE_H;

/** Sub-cell contrast (standard deviation, 0..1 density) at which shape counts fully. */
const FULL_DETAIL = 0.15;

/**
 * Match centred sub-cell detail. Flat cells keep the original density-selected glyph, and shape
 * only counts as far as the cell has real contrast: the comparison is normalised, so without this
 * a faint gradient in a smooth area would pick a stroke glyph as eagerly as a sharp edge does.
 */
export function shapeGlyph(
  target: Float32Array,
  masks: Float32Array,
  candidates: number[],
  fallback: number,
  amount: number,
): number {
  if (amount <= 0 || !candidates.length) return fallback;
  let mean = 0;
  for (const v of target) mean += v / SHAPE_SAMPLES;
  let variance = 0;
  for (const v of target) variance += (v - mean) ** 2;
  if (variance < 1e-5) return fallback;
  const norm = Math.sqrt(variance);
  const weight = amount * Math.min(1, Math.sqrt(variance / SHAPE_SAMPLES) / FULL_DETAIL);
  const rank = Math.max(0, candidates.indexOf(fallback));
  let best = Infinity,
    glyph = fallback;
  for (let k = 0; k < candidates.length; k++) {
    const id = candidates[k],
      base = id * SHAPE_SAMPLES;
    let gm = 0,
      gv = 0,
      dot = 0;
    for (let j = 0; j < SHAPE_SAMPLES; j++) gm += masks[base + j] / SHAPE_SAMPLES;
    for (let j = 0; j < SHAPE_SAMPLES; j++) {
      const g = masks[base + j] - gm;
      gv += g * g;
      dot += g * (target[j] - mean);
    }
    const detail = gv > 1e-6 ? 1 - dot / (norm * Math.sqrt(gv)) : 1;
    const density = Math.abs(k - rank) / Math.max(1, candidates.length - 1);
    const score = weight * detail + (1 - weight) * density * 2;
    if (score < best) {
      best = score;
      glyph = id;
    }
  }
  return glyph;
}
