import type { ParamStore, Params } from '../state';

/** Subsequence matching: exact and word-prefix matches rank before sparse matches. */
export function matchScore(query: string, text: string): number {
  const q = query.trim().toLocaleLowerCase();
  const t = text.toLocaleLowerCase();
  if (!q) return 0;
  const exact = t.indexOf(q);
  if (exact >= 0) return exact + (exact === 0 || /\s/.test(t[exact - 1]) ? 0 : 10);
  let at = -1;
  let gaps = 0;
  for (const char of q) {
    const next = t.indexOf(char, at + 1);
    if (next < 0) return Infinity;
    gaps += next - at - 1;
    at = next;
  }
  return 100 + gaps;
}

type Key = keyof Params;
/** A setting's English name and how to show one of its values; used to say what a reveal changed. */
export interface DomainLabel { name: string; value(v: Params[Key]): string }
interface Domain { values: () => Params[Key][]; label?: DomainLabel }
const domains = new WeakMap<ParamStore, Map<Key, Domain>>();
const conditions = new WeakMap<HTMLElement, { store: ParamStore; when: (p: Params) => boolean; reveal?: () => void }>();
export const searchOptions = new WeakMap<HTMLSelectElement, () => { label: string; choose(): void }[]>();

export function searchDomain(store: ParamStore, key: Key, values: () => Params[Key][], label?: DomainLabel): void {
  if (!domains.has(store)) domains.set(store, new Map());
  domains.get(store)!.set(key, { values, label });
}

export function searchCondition(node: HTMLElement, store: ParamStore, when: (p: Params) => boolean, reveal?: () => void): void {
  conditions.set(node, { store, when, reveal });
}

/** One setting a reveal sets, with its English name and value when the control registered them. */
export interface RevealChange { store: ParamStore; key: Key; value: Params[Key]; name?: string; shown?: string }

/** One or two setting changes that make `when` true, or null. */
function patchFor(store: ParamStore, p: Params, when: (p: Params) => boolean): Partial<Params> | null {
  const choices = [...(domains.get(store) ?? [])].flatMap(([key, d]) =>
    d.values().filter((v) => v !== p[key]).map((value) => ({ [key]: value } as Partial<Params>)),
  );
  const one = choices.find((change) => when({ ...p, ...change }));
  if (one) return one;
  for (const a of choices) for (const b of choices) {
    if (when({ ...p, ...a, ...b })) return { ...a, ...b };
  }
  return null;
}

function changesOf(store: ParamStore, patch: Partial<Params>): RevealChange[] {
  return (Object.keys(patch) as Key[]).map((key) => {
    const label = domains.get(store)?.get(key)?.label;
    const value = patch[key]!;
    return { store, key, value, name: label?.name, shown: label?.value(value) };
  });
}

function ancestors(target: HTMLElement): HTMLElement[] {
  const list: HTMLElement[] = [];
  for (let n: HTMLElement | null = target; n; n = n.parentElement) list.unshift(n);
  return list;
}

/**
 * The settings `revealConditions` would change to show `target`, without changing them, or null
 * when it can't be shown. Conditions opened by their own code are not listed. Pass the same `cache`
 * to plan many controls against unchanged settings: controls under one condition share its search.
 */
export function revealPlan(target: HTMLElement, cache = new Map<HTMLElement, Partial<Params> | null>()): RevealChange[] | null {
  const planned = new Map<ParamStore, Params>();
  const changes: RevealChange[] = [];
  for (const node of ancestors(target)) {
    const c = conditions.get(node);
    if (!c || c.reveal) continue;
    const p = planned.get(c.store) ?? c.store.params;
    if (c.when(p)) continue;
    // The settings planned so far depend only on the conditions above, so a node's patch can be reused.
    if (!cache.has(node)) cache.set(node, patchFor(c.store, p, c.when));
    const patch = cache.get(node)!;
    if (!patch) return null;
    planned.set(c.store, { ...p, ...patch });
    changes.push(...changesOf(c.store, patch));
  }
  return changes;
}

/**
 * Reveal conditional controls using the same predicates as the panel, without bypassing them.
 * The settings it changed are added to `applied`.
 */
export function revealConditions(target: HTMLElement, applied: RevealChange[] = []): boolean {
  for (const node of ancestors(target)) {
    const c = conditions.get(node);
    if (!c || c.when(c.store.params)) continue;
    if (c.reveal) c.reveal();
    else {
      const patch = patchFor(c.store, c.store.params, c.when);
      if (!patch) return false;
      for (const key of Object.keys(patch) as Key[]) c.store.set(key, patch[key]!);
      applied.push(...changesOf(c.store, patch));
    }
    if (!c.when(c.store.params)) return false;
  }
  return !target.closest('[hidden]');
}
