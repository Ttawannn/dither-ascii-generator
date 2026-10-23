/**
 * Panel preferences kept per browser, like the theme: Basic or Advanced mode and which sections
 * are folded. Never part of presets or share links.
 */
export type PanelMode = 'basic' | 'advanced';

export interface UiPrefs {
  mode: PanelMode;
  /** Sections the user folded or unfolded, by id; others use their default. */
  folded: Record<string, boolean>;
}

const STORAGE_KEY = 'dag.ui.v1';
/** Where the app keeps the last settings: present for anyone who has used it before. */
const PARAMS_KEY = 'dag.params.v1';

/**
 * Read stored preferences. Without any, people new to the app start in Basic mode and people who
 * already have settings saved start in Advanced, so nothing they used before disappears.
 */
export function sanitizeUiPrefs(data: unknown, usedBefore: boolean): UiPrefs {
  const fresh: UiPrefs = { mode: usedBefore ? 'advanced' : 'basic', folded: {} };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fresh;
  const { mode, folded } = data as Record<string, unknown>;
  const out: UiPrefs = { mode: mode === 'basic' || mode === 'advanced' ? mode : fresh.mode, folded: {} };
  if (folded && typeof folded === 'object' && !Array.isArray(folded)) {
    for (const [id, v] of Object.entries(folded)) if (typeof v === 'boolean' && id.length <= 40) out.folded[id] = v;
  }
  return out;
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

let prefs: UiPrefs = (() => {
  const ls = storage();
  let raw: unknown = null;
  let usedBefore = false;
  try {
    raw = JSON.parse(ls?.getItem(STORAGE_KEY) ?? 'null');
    usedBefore = !!ls?.getItem(PARAMS_KEY);
  } catch {
    // Unreadable: start fresh.
  }
  const read = sanitizeUiPrefs(raw, usedBefore);
  // Remember the starting mode, so it doesn't change once settings get saved.
  if (!raw) save(read);
  return read;
})();
const listeners = new Set<() => void>();

function save(p: UiPrefs): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: the preference lasts for this visit only.
  }
}

function update(next: UiPrefs): void {
  prefs = next;
  save(prefs);
  for (const fn of listeners) fn();
}

export const panelMode = (): PanelMode => prefs.mode;
export const setPanelMode = (mode: PanelMode) => update({ ...prefs, mode });

export const isFolded = (id: string, byDefault: boolean) => prefs.folded[id] ?? byDefault;
export const setFolded = (id: string, folded: boolean) => update({ ...prefs, folded: { ...prefs.folded, [id]: folded } });

export function onPrefsChange(fn: () => void): void {
  listeners.add(fn);
}
