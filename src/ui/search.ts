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
const domains = new WeakMap<ParamStore, Map<Key, () => Params[Key][]>>();
const conditions = new WeakMap<HTMLElement, { store: ParamStore; when: (p: Params) => boolean; reveal?: () => void }>();
export const searchOptions = new WeakMap<HTMLSelectElement, () => { label: string; choose(): void }[]>();

export function searchDomain(store: ParamStore, key: Key, values: () => Params[Key][]): void {
  if (!domains.has(store)) domains.set(store, new Map());
  domains.get(store)!.set(key, values);
}

export function searchCondition(node: HTMLElement, store: ParamStore, when: (p: Params) => boolean, reveal?: () => void): void {
  conditions.set(node, { store, when, reveal });
}

/** Reveal conditional controls using the same predicates as the panel, without bypassing them. */
export function revealConditions(target: HTMLElement): boolean {
  const ancestors: HTMLElement[] = [];
  for (let n: HTMLElement | null = target; n; n = n.parentElement) ancestors.unshift(n);
  for (const node of ancestors) {
    const c = conditions.get(node);
    if (!c || c.when(c.store.params)) continue;
    if (c.reveal) c.reveal();
    else {
      const p = c.store.params;
      const choices = [...(domains.get(c.store) ?? [])].flatMap(([key, values]) =>
        values().filter((v) => v !== p[key]).map((value) => ({ [key]: value } as Partial<Params>)),
      );
      let patch = choices.find((change) => c.when({ ...p, ...change }));
      if (!patch) {
        outer: for (const a of choices) for (const b of choices) {
          if (c.when({ ...p, ...a, ...b })) { patch = { ...a, ...b }; break outer; }
        }
      }
      if (!patch) return false;
      for (const key of Object.keys(patch) as Key[]) c.store.set(key, patch[key]!);
    }
    if (!c.when(c.store.params)) return false;
  }
  return !target.closest('[hidden]');
}
