/** Matches dotScreen() in dither.frag. Coordinates are in screen cells. */
export function dotThreshold(x: number, y: number, shape = 'round'): number {
  if (shape === 'round') return 0.5 - 0.25 * (Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y));
  const q = (v: number) => Math.abs(((((v + 0.5) % 1) + 1) % 1) - 0.5) * 2;
  const a = q(x),
    b = q(y);
  if (shape === 'ellipse') return Math.min(1, Math.hypot(a * 0.65, b * 1.5) / 1.6347783);
  if (shape === 'square') return Math.max(a, b);
  return (a + b) * 0.5;
}
