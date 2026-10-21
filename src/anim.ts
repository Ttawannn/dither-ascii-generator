import { lfo } from './ascii/lfo';
import { BAND_IDS, type Band } from './audio-levels';
import type { NumericKey, Params, SliderSpec } from './state';

/**
 * An animation lane drives one numeric setting over time: with an oscillator ("lfo"), between two
 * keyframes ("keys"), or by the loudness of a frequency band of the audio input ("audio").
 * Lanes are stored as a JSON string in `Params.animLanes`.
 */
export interface Lane {
  id: number;
  key: NumericKey;
  mode: 'lfo' | 'keys' | 'audio';
  // lfo
  shape: string;
  hz: number;
  /** Swing as a fraction of the setting's range (0..1), centred on the slider value. */
  amount: number;
  // keys
  from: number;
  to: number;
  ease: 'linear' | 'smooth' | 'step';
  loop: 'repeat' | 'pingpong' | 'once';
  // audio
  band: Band;
  /** Seconds of audio averaged, 0..1 (0 = follow every beat). */
  smooth: number;
}

/** Loudness 0..1 of a band, averaged over `window` seconds (supplied by the app's audio input). */
export type AudioLevel = (band: Band, window: number) => number;

export const MAX_LANES = 8;
export const LANE_MODES = ['lfo', 'keys', 'audio'] as const;
export const BAND_LABELS: Record<Band, string> = { bass: 'Bass', mid: 'Mids', high: 'Highs' };
export const EASES = [
  { id: 'linear', label: 'Linear' },
  { id: 'smooth', label: 'Ease in-out' },
  { id: 'step', label: 'Hold, then jump' },
] as const;
export const LOOPS = [
  { id: 'repeat', label: 'Repeat' },
  { id: 'pingpong', label: 'Ping-pong' },
  { id: 'once', label: 'Once' },
] as const;
const LFO_IDS = ['sine', 'triangle', 'saw'];

type SpecFor = (key: string) => SliderSpec | undefined;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** A new lane for `key`, starting from the current value. */
export function newLane(id: number, key: NumericKey, spec: SliderSpec, current: number): Lane {
  return {
    id,
    key,
    mode: 'lfo',
    shape: 'sine',
    hz: 0.5,
    amount: 0.25,
    from: current,
    to: clamp(current + (spec.max - spec.min) / 2, spec.min, spec.max),
    ease: 'smooth',
    loop: 'pingpong',
    band: 'bass',
    smooth: 0.1,
  };
}

/** Parse and repair stored lanes: unknown targets and duplicates are dropped, values clamped. */
export function parseLanes(json: string, specFor: SpecFor): Lane[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const lanes: Lane[] = [];
  const used = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const spec = typeof o.key === 'string' ? specFor(o.key) : undefined;
    if (!spec || used.has(spec.key)) continue;
    used.add(spec.key);
    lanes.push({
      id: Math.max(0, Math.round(num(o.id, lanes.length))),
      key: spec.key,
      mode: pick(o.mode, LANE_MODES, 'lfo'),
      shape: pick(o.shape, LFO_IDS, 'sine'),
      hz: clamp(num(o.hz, 0.5), 0.05, 4),
      amount: clamp(num(o.amount, 0.25), 0, 1),
      from: clamp(num(o.from, spec.min), spec.min, spec.max),
      to: clamp(num(o.to, spec.max), spec.min, spec.max),
      ease: pick(o.ease, EASES.map((e) => e.id), 'smooth'),
      loop: pick(o.loop, LOOPS.map((l) => l.id), 'pingpong'),
      band: pick(o.band, BAND_IDS, 'bass'),
      smooth: clamp(num(o.smooth, 0.1), 0, 1),
    });
    if (lanes.length === MAX_LANES) break;
  }
  return lanes;
}

export const serializeLanes = (lanes: Lane[]) => JSON.stringify(lanes);

/** Position 0..1 along the from → to ramp at time `t`, for a timeline `duration` seconds long. */
export function keyProgress(lane: Pick<Lane, 'ease' | 'loop'>, t: number, duration: number): number {
  const cycles = t / duration;
  let x: number;
  if (lane.loop === 'once') x = Math.min(1, Math.max(0, cycles));
  else if (lane.loop === 'pingpong') {
    const phase = ((cycles % 2) + 2) % 2;
    x = phase <= 1 ? phase : 2 - phase;
  } else x = ((cycles % 1) + 1) % 1;
  if (lane.ease === 'smooth') return x * x * (3 - 2 * x);
  if (lane.ease === 'step') return x < 1 ? 0 : 1;
  return x;
}

/** The lane's value at time `t`; `base` is the setting's own (slider) value. */
export function laneValue(
  lane: Lane,
  base: number,
  spec: SliderSpec,
  t: number,
  duration: number,
  audio?: AudioLevel,
): number {
  let v: number;
  if (lane.mode === 'lfo') {
    v = base + (lfo(lane.shape, t, lane.hz) * lane.amount * (spec.max - spec.min)) / 2;
  } else if (lane.mode === 'audio') {
    // Louder pushes the value up from the slider by up to `amount` of the range.
    v = base + (audio ? audio(lane.band, lane.smooth) : 0) * lane.amount * (spec.max - spec.min);
  } else {
    v = lane.from + (lane.to - lane.from) * keyProgress(lane, t, duration);
  }
  v = Math.round(v / spec.step) * spec.step;
  return clamp(Number(v.toFixed(6)), spec.min, spec.max);
}

/** Params with every animated setting replaced by its value at time `t`. Unchanged when there are no lanes. */
export function applyAnimation(p: Params, lanes: Lane[], t: number, specFor: SpecFor, audio?: AudioLevel): Params {
  if (!lanes.length) return p;
  const out = { ...p };
  for (const lane of lanes) {
    const spec = specFor(lane.key);
    if (spec) out[lane.key] = laneValue(lane, p[lane.key], spec, t, p.animDuration, audio);
  }
  return out;
}
