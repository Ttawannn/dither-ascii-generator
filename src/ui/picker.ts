/** One choice in a category picker. */
export interface PickItem {
  value: string;
  label: string;
  category: string;
}

/** Pseudo-categories shown before the real ones. */
export const ALL = '*all';
export const FAVOURITES = '*favourites';

/** The items shown for a category: every item, the favourites (in item order), or one category. */
export function itemsIn(items: PickItem[], category: string, favourites: readonly string[]): PickItem[] {
  if (category === ALL) return items;
  if (category === FAVOURITES) return items.filter((i) => favourites.includes(i.value));
  return items.filter((i) => i.category === category);
}

/**
 * The value `dir` steps (±1) from `current` within `category`, wrapping around. When `current` is
 * not in that category, › starts at its first item and ‹ at its last.
 */
export function stepItem(items: PickItem[], current: string, dir: number, category: string, favourites: readonly string[]): string {
  const list = itemsIn(items, category, favourites);
  if (!list.length) return current;
  const i = list.findIndex((it) => it.value === current);
  if (i < 0) return list[dir > 0 ? 0 : list.length - 1].value;
  return list[(i + dir + list.length) % list.length].value;
}

/** The category to show for `current`: kept when it still contains it, otherwise the item's own. */
export function categoryFor(items: PickItem[], current: string, shown: string, favourites: readonly string[]): string {
  if (itemsIn(items, shown, favourites).some((i) => i.value === current)) return shown;
  return items.find((i) => i.value === current)?.category ?? ALL;
}
