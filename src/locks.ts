import { ADJUST_KEYS, ASCII_KEYS, DEFAULTS, DITHER_KEYS, FX_KEYS, type Params } from './state';

export interface Locks { keys: string[]; colors: string[] }
export function cleanLocks(value: unknown): Locks {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Locks>;
  return {
    keys: [...new Set(Array.isArray(v.keys) ? v.keys.filter((k) => typeof k === 'string' && k in DEFAULTS) : [])],
    colors: [...new Set(Array.isArray(v.colors) ? v.colors.filter((c) => typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c)).map((c) => c.toLowerCase()) : [])],
  };
}
export function protectLook(current: Params, next: Partial<Params>, locks: Locks): Partial<Params> {
  const out = { ...next };
  for (const key of locks.keys as (keyof Params)[]) if (key in out) delete out[key];
  if (locks.colors.some((c) => current.customPalette.toLowerCase().includes(c))) {
    for (const key of ['customPalette', 'palette', 'asciiPalette', 'asciiColor'] as const) delete out[key];
  }
  for (const key of Object.keys(out) as (keyof Params)[]) if (out[key] === current[key]) delete out[key];
  return out;
}
export const LOCK_GROUPS: { label: string; keys: (keyof Params)[] }[] = [
  { label: 'Algorithm', keys: ['mode', 'algorithm', 'asciiCharset', 'asciiCustom'] },
  { label: 'Palette', keys: ['palette', 'levels', 'ink', 'paper', 'customPalette', 'asciiPalette', 'asciiColor', 'asciiFg', 'asciiBg'] },
  { label: 'Effects', keys: FX_KEYS },
];
export const ADJUST_LOCK_KEYS = ADJUST_KEYS;
export const LOOK_KEYS = [...new Set([...ADJUST_KEYS, ...DITHER_KEYS, ...ASCII_KEYS, ...FX_KEYS])];
