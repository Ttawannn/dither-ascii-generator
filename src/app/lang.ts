import { initialLang, translate, type Lang } from '../i18n';

/**
 * Applies the UI language to the page. Every module writes its text in English; this keeps the
 * English of each text node and of the title / aria-label / placeholder / label attributes, shows the
 * translation, and follows changes through a MutationObserver. Switching the language therefore
 * never rebuilds a control (a slider being dragged keeps its pointer). Like the theme, the choice
 * is a per-browser preference (`localStorage['dag.lang']`), not part of a look or share link.
 */

const ATTRS = ['title', 'aria-label', 'placeholder', 'label']; // label: <optgroup>
// User content and characters: names, file names, glyphs.
const TEXT_SKIP = '[translate="no"], script, style, textarea, pre, .glyph-preview';
const ATTR_SKIP = '[translate="no"]';

let lang: Lang = 'en';
try {
  lang = initialLang(localStorage.getItem('dag.lang'), navigator.languages ?? [navigator.language]);
} catch {
  lang = initialLang(null, navigator.languages ?? [navigator.language]);
}

export const currentLang = () => lang;

// The English text, and what was last shown, so a change by the app (new English) can be told
// apart from our own write.
const textEn = new WeakMap<Text, string>();
const textShown = new WeakMap<Text, string>();
const attrEn = new WeakMap<Element, Map<string, string>>();
const attrShown = new WeakMap<Element, Map<string, string>>();

/** Search includes the English source even while the panel is displayed in Thai. */
export function englishText(root: Node): string {
  if (root instanceof Text) return textEn.get(root) ?? root.data;
  return [...root.childNodes].map(englishText).join(' ');
}

export function englishAttribute(root: Element, name: string): string {
  return attrEn.get(root)?.get(name) ?? root.getAttribute(name) ?? '';
}

function doText(node: Text): void {
  if (!node.parentElement || node.parentElement.closest(TEXT_SKIP)) return;
  const now = node.data;
  if (textShown.get(node) !== now) textEn.set(node, now);
  const out = translate(textEn.get(node)!, lang);
  if (out !== now) node.data = out;
  textShown.set(node, out);
}

function doAttr(el: Element, name: string): void {
  const now = el.getAttribute(name);
  if (now === null || el.closest(ATTR_SKIP)) return;
  const en = attrEn.get(el) ?? new Map<string, string>();
  const shown = attrShown.get(el) ?? new Map<string, string>();
  attrEn.set(el, en);
  attrShown.set(el, shown);
  if (shown.get(name) !== now) en.set(name, now);
  const out = translate(en.get(name)!, lang);
  if (out !== now) el.setAttribute(name, out);
  shown.set(name, out);
}

function walk(root: Node): void {
  if (root instanceof Text) return doText(root);
  if (!(root instanceof Element)) return;
  const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = texts.nextNode(); n; n = texts.nextNode()) doText(n as Text);
  for (const el of [root, ...root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))]) {
    for (const a of ATTRS) if (el.hasAttribute(a)) doAttr(el, a);
  }
}

const observer = new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === 'childList') r.addedNodes.forEach(walk);
    else if (r.type === 'characterData') walk(r.target);
    else if (r.attributeName) doAttr(r.target as Element, r.attributeName);
  }
});

const listeners = new Set<() => void>();
/** Called after the language changes. */
export const onLangChange = (fn: () => void) => listeners.add(fn);

/** Translate the page now and keep following it. Call once the page is mounted. */
export function startTranslating(): void {
  document.documentElement.lang = lang;
  walk(document.body);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next;
  walk(document.body);
  listeners.forEach((fn) => fn());
  try {
    localStorage.setItem('dag.lang', next);
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}

export const toggleLang = () => setLang(lang === 'en' ? 'th' : 'en');
