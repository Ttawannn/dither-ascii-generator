import { parseColorList } from './pipeline/palettes';

/** Palettes kept in this browser for the Custom palette's library list. */
export interface LibraryPalette {
  name: string;
  colors: string[];
  /** Picker category ("Imported", "Saved" or the user's own); none in older libraries. */
  category?: string;
}

const STORAGE_KEY = 'dag.palettes.v1';
export const MAX_LIBRARY = 500;

/** Keep only well-formed entries: a name and 2–32 valid colours. */
export function sanitizeLibrary(data: unknown): LibraryPalette[] {
  if (!Array.isArray(data)) return [];
  const out: LibraryPalette[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const { name, colors, category } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !Array.isArray(colors)) continue;
    const list = parseColorList(colors.filter((c): c is string => typeof c === 'string').join(' '));
    if (list.length < 2) continue;
    out.push({ name: name.slice(0, 60), colors: list, ...(typeof category === 'string' && category.trim() ? { category: category.trim().slice(0, 40) } : {}) });
  }
  return out.slice(-MAX_LIBRARY);
}

/** Add palettes: one with the same name replaces the old entry; newest last; oldest dropped past the cap. */
export function mergeLibrary(list: LibraryPalette[], added: LibraryPalette[]): LibraryPalette[] {
  const names = new Set(added.map((p) => p.name));
  return [...list.filter((p) => !names.has(p.name)), ...added].slice(-MAX_LIBRARY);
}

export function loadLibrary(): LibraryPalette[] {
  try {
    return sanitizeLibrary(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function storeLibrary(list: LibraryPalette[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
