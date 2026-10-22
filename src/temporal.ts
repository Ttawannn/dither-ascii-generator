import type { Params, SliderSpec } from './state';

export const TEMPORAL_PATTERNS = [
  { id: 'off', label: 'Off' }, { id: 'drift', label: 'Drifting noise' },
  { id: 'scan', label: 'Moving scan' }, { id: 'wave', label: 'Travelling wave' },
  { id: 'blocks', label: 'Block noise' },
];
export const TEMPORAL_SLIDERS: SliderSpec[] = [
  { key: 'temporalAmount', label: 'Temporal amount', min: 0, max: 100, step: 1 },
  { key: 'temporalSpeed', label: 'Temporal speed', min: 0.1, max: 8, step: 0.1 },
  { key: 'temporalScale', label: 'Temporal scale', min: 2, max: 100, step: 1 },
  { key: 'temporalAngle', label: 'Temporal direction', min: 0, max: 360, step: 1 },
  { key: 'temporalSeed', label: 'Temporal seed', min: 1, max: 9999, step: 1 },
];
/** Periodic time for loopable fields; integer cycles keep the endpoints identical. */
export function temporalPhase(p: Pick<Params, 'temporalLoop' | 'animDuration' | 'temporalSpeed'>, time: number): number {
  if (!p.temporalLoop) return time * p.temporalSpeed;
  const cycles = Math.max(1, Math.round(p.temporalSpeed * p.animDuration));
  return (((time / p.animDuration) % 1 + 1) % 1) * cycles;
}
