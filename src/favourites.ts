/**
 * Favourite algorithms, character sets and palettes, per picker. A per-browser preference like the
 * theme: kept in localStorage, never in presets or share links.
 */
const STORAGE_KEY = 'dag.favourites.v1';
const MAX_PER_LIST = 200;

type Lists = Record<string, string[]>;

/** Keep only string lists of strings, without duplicates. */
export function sanitizeFavourites(data: unknown): Lists {
  const out: Lists = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const [key, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue;
    const values = [...new Set(list.filter((v): v is string => typeof v === 'string' && v.length <= 80))];
    if (values.length) out[key] = values.slice(0, MAX_PER_LIST);
  }
  return out;
}

let lists: Lists = (() => {
  try {
    return sanitizeFavourites(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
})();
const listeners = new Set<() => void>();

export const favourites = (key: string): readonly string[] => lists[key] ?? [];

export function toggleFavourite(key: string, value: string): void {
  const list = favourites(key);
  lists = { ...lists, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    // Storage blocked: favourites last for this visit only.
  }
  for (const fn of listeners) fn();
}

export function onFavouritesChange(fn: () => void): void {
  listeners.add(fn);
}
