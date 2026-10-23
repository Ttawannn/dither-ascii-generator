import { anyEffect } from '../../fx-stack';
import { ADJUST_KEYS, ASCII_KEYS, DEFAULTS, DITHER_KEYS, MASK_KEYS, type Params } from '../../state';
import { button, el, section } from '../../ui/controls';
import { isFolded, onPrefsChange, panelMode, setFolded, setPanelMode } from '../../ui/prefs';
import { activeLayer, lanesOf, store } from '../core';
import { adjustSection } from './adjust';
import { animationSection } from './animation';
import { asciiControls } from './ascii';
import { ditherControls } from './dither';
import { effectsSection } from './effects';
import { exportFoot, exportSection } from './export';
import { layerSection } from './layer';
import { maskSection } from './mask';
import { presetsSection } from './presets';
import { sourceSection } from './source';
import { projectSection } from './project';

// The settings panel, top to bottom. Each section lives in its own module; this one adds what all
// sections share: folding (remembered per browser), a dot when a section's settings differ from the
// defaults, Basic / Advanced mode with "More settings…", and a row of icons to jump to a section.

const effectSection = section('Effect', ditherControls, asciiControls);
effectSection.head.append(
  button('Reset', () => store.reset(store.params.mode === 'ascii' ? ASCII_KEYS : DITHER_KEYS), 'link'),
);

const EXPORT_KEYS = Object.keys(DEFAULTS).filter((k) => k.startsWith('export')) as (keyof Params)[];
const differs = (keys: (keyof Params)[]) => (p: Params) => keys.some((k) => p[k] !== DEFAULTS[k]);

interface PanelSection {
  id: string;
  s: { root: HTMLElement; head: HTMLElement };
  /** SVG path(s) for the icon row, 24×24, stroked. */
  icon: string;
  folded: boolean;
  changed?: (p: Params) => boolean;
}

const SECTIONS: PanelSection[] = [
  { id: 'source', s: sourceSection, folded: false, icon: 'M4 6h16v12H4z M4 15l5-4 4 3 3-2 4 3' },
  { id: 'project', s: projectSection, folded: true, icon: 'M3 7h7l2 2h9v9H3z' },
  { id: 'presets', s: presetsSection, folded: false, icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
  { id: 'adjust', s: adjustSection, folded: true, changed: differs(ADJUST_KEYS), icon: 'M5 4v16 M12 4v16 M19 4v16 M3 8h4 M10 15h4 M17 10h4' },
  {
    id: 'effect',
    s: effectSection,
    folded: false,
    changed: (p) => differs(p.mode === 'ascii' ? ASCII_KEYS : DITHER_KEYS)(p),
    icon: 'M6 6h2v2H6z M11 6h2v2h-2z M16 6h2v2h-2z M8.5 11h2v2h-2z M13.5 11h2v2h-2z M6 16h2v2H6z M11 16h2v2h-2z M16 16h2v2h-2z',
  },
  { id: 'layer', s: layerSection, folded: true, changed: (p) => !!activeLayer(p), icon: 'M12 4l9 5-9 5-9-5z M3 14l9 5 9-5' },
  { id: 'animation', s: animationSection, folded: true, changed: (p) => p.animate || lanesOf(p).length > 0, icon: 'M8 5v14l11-7z' },
  { id: 'effects', s: effectsSection, folded: true, changed: anyEffect, icon: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M18 6l-2.5 2.5 M8.5 15.5L6 18' },
  { id: 'mask', s: maskSection, folded: true, changed: (p) => p.maskMode !== 'off' || differs(MASK_KEYS)(p), icon: 'M12 4a8 8 0 1 0 0 16z M12 4a8 8 0 0 1 0 16' },
  { id: 'export', s: exportSection, folded: false, changed: differs(EXPORT_KEYS), icon: 'M12 4v11 M7 10l5 5 5-5 M5 20h14' },
];

const svgIcon = (d: string) => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
};

const scroll = el('div', { class: 'panel-scroll' });
const jump = el('nav', { class: 'panel-jump', 'aria-label': 'Sections' });
const jumpButtons = new Map<string, HTMLButtonElement>();
const dots = new Map<string, HTMLElement>();

for (const sec of SECTIONS) {
  const { root, head } = sec.s;
  root.dataset.section = sec.id;
  // The title becomes the fold switch; the head's other buttons (Reset…) stay where they are.
  const title = head.querySelector('.section-title')!;
  const dot = el('span', { class: 'section-dot', title: 'Changed from the defaults' });
  const fold = el('button', { class: 'section-fold', type: 'button' }, el('span', { class: 'section-chevron', 'aria-hidden': 'true' }, '▾'), title, dot);
  head.prepend(fold);
  const apply = () => {
    const folded = isFolded(sec.id, sec.folded);
    root.classList.toggle('folded', folded);
    fold.setAttribute('aria-expanded', `${!folded}`);
  };
  fold.addEventListener('click', () => setFolded(sec.id, !root.classList.contains('folded')));
  onPrefsChange(apply);
  apply();
  dots.set(sec.id, dot);

  // In Basic mode, advanced controls wait behind "More settings…" at the end of their section.
  if (root.querySelector('.adv')) {
    const more = button('More settings…', () => {
      const on = root.classList.toggle('show-adv');
      more.textContent = on ? 'Fewer settings' : 'More settings…';
      more.setAttribute('aria-expanded', `${on}`);
    }, 'link more-settings');
    more.setAttribute('aria-expanded', 'false');
    root.append(more);
  }

  const label = title.textContent ?? sec.id;
  const jumpBtn = button('', () => {
    setFolded(sec.id, false);
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 'jump-btn');
  jumpBtn.append(svgIcon(sec.icon));
  jumpBtn.title = label;
  jumpBtn.setAttribute('aria-label', label);
  jump.append(jumpBtn);
  jumpButtons.set(sec.id, jumpBtn);
  scroll.append(root);
}

// Basic / Advanced as two buttons under the icons.
const basicBtn = button('Basic', () => setPanelMode('basic'), 'mode-btn');
basicBtn.title = 'Show the main settings';
const advancedBtn = button('Advanced', () => setPanelMode('advanced'), 'mode-btn');
advancedBtn.title = 'Show all settings';
const modeRow = el('div', { class: 'panel-mode', role: 'group', 'aria-label': 'Settings shown' }, basicBtn, advancedBtn);

export const panel = el('aside', { class: 'panel' }, el('div', { class: 'panel-top' }, jump, modeRow), scroll, exportFoot);

function syncMode(): void {
  const basic = panelMode() === 'basic';
  panel.classList.toggle('ui-basic', basic);
  panel.classList.toggle('ui-advanced', !basic);
  basicBtn.setAttribute('aria-pressed', `${basic}`);
  advancedBtn.setAttribute('aria-pressed', `${!basic}`);
}
onPrefsChange(syncMode);
syncMode();

function syncDots(p: Params): void {
  for (const sec of SECTIONS) {
    const on = !!sec.changed?.(p);
    dots.get(sec.id)!.hidden = !on;
    jumpButtons.get(sec.id)!.classList.toggle('has-changes', on);
  }
}
store.subscribe((p) => syncDots(p));
syncDots(store.params);

// Highlight the icon of the section at the top of the panel.
const seen = new Map<string, boolean>();
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) seen.set((e.target as HTMLElement).dataset.section!, e.isIntersecting);
    const current = SECTIONS.find((sec) => seen.get(sec.id));
    for (const [id, b] of jumpButtons) b.classList.toggle('current', id === current?.id);
  },
  { root: scroll, rootMargin: '0px 0px -70% 0px' },
);
for (const sec of SECTIONS) observer.observe(sec.s.root);
