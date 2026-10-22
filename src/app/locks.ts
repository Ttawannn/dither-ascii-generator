import { cleanLocks, type Locks } from '../locks';

let locks: Locks = { keys: [], colors: [] };
try { locks = cleanLocks(JSON.parse(localStorage.getItem('dag.locks') ?? '{}')); } catch { /* optional storage */ }
const listeners = new Set<() => void>();
export const getLocks = (): Locks => structuredClone(locks);
export function setLocks(value: unknown): void {
  const next = cleanLocks(value);
  if (JSON.stringify(next) === JSON.stringify(locks)) return;
  locks = next;
  try { localStorage.setItem('dag.locks', JSON.stringify(locks)); } catch { /* optional storage */ }
  listeners.forEach((fn) => fn());
}
export const onLocksChange = (fn: () => void) => listeners.add(fn);
export function toggleKeys(keys: string[]): void {
  const all = keys.every((k) => locks.keys.includes(k));
  setLocks({ ...locks, keys: all ? locks.keys.filter((k) => !keys.includes(k)) : [...locks.keys, ...keys] });
}
export function toggleColor(color: string): void {
  const c = color.toLowerCase();
  setLocks({ ...locks, colors: locks.colors.includes(c) ? locks.colors.filter((x) => x !== c) : [...locks.colors, c] });
}
export function renameLockedColor(before: string, after: string): void {
  if (locks.colors.includes(before)) setLocks({ ...locks, colors: locks.colors.map((c) => c === before ? after : c) });
}
