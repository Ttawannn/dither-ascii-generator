export const LFO_SHAPES = [
  { id: 'off', label: 'Off' },
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'saw', label: 'Saw' },
];

/** Oscillator value in -1..1 at time `t` seconds for frequency `hz`. */
export function lfo(shape: string, t: number, hz: number): number {
  const phase = (((t * hz) % 1) + 1) % 1;
  switch (shape) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'saw':
      return phase * 2 - 1;
    default:
      return 0;
  }
}

/** Offset (fraction of the ramp, -1..1) after modulation; `amount` is 0..1. Wraps like the offset itself. */
export function modulatedOffset(base: number, shape: string, t: number, hz: number, amount: number): number {
  return base + amount * lfo(shape, t, hz);
}

/** Depth after modulation: swings from `base` down towards 2 levels as the LFO rises; `amount` is 0..1. */
export function modulatedDepth(base: number, shape: string, t: number, hz: number, amount: number): number {
  if (shape === 'off') return base;
  return Math.max(2, Math.round(base - amount * (base - 2) * ((lfo(shape, t, hz) + 1) / 2)));
}
