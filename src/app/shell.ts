import { button, el, segmented } from '../ui/controls';
import { Transport } from '../ui/transport';
import { actions, rt, store } from './core';

// The page frame: preview stage, header, footer status line, help overlay and theme.

export const canvas = el('canvas');
export const fileInput = el('input', { type: 'file', accept: 'image/*,video/*', hidden: '' });

export const stage = el(
  'main',
  { class: 'stage empty' },
  canvas,
  el(
    'div',
    { class: 'empty-state' },
    el('div', { class: 'big' }, 'Drop an image or video'),
    el('div', {}, 'or paste · browse · webcam'),
    el(
      'div',
      { class: 'row' },
      button('Browse', () => fileInput.click()),
      button('Sample', () => void actions.openSample()),
      button('Webcam', () => void actions.toggleWebcam()),
    ),
  ),
  el('div', { class: 'drop-overlay' }, 'DROP TO LOAD'),
  el('div', { class: 'badge' }, 'ORIGINAL'),
);

// ---------- theme ----------

const THEMES = ['dark', 'parchment'] as const;
type Theme = (typeof THEMES)[number];
export const THEME_COLOR: Record<Theme, string> = { dark: '#0a0a0a', parchment: '#efe6d2' };

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'parchment' ? 'parchment' : 'dark';
}

const themeBtn = button('◐', () => toggleTheme(), 'btn small theme-btn');
const syncThemeButton = () =>
  (themeBtn.title = currentTheme() === 'dark' ? 'Switch to the parchment theme (T)' : 'Switch to the dark theme (T)');
syncThemeButton();

/** Switch the UI theme without reloading; remembered per browser (it is not part of a look or share link). */
export function setTheme(theme: Theme): void {
  if (theme === 'dark') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  syncThemeButton();
  try {
    localStorage.setItem('dag.theme', theme);
  } catch {
    // Storage blocked: the theme just won't be remembered.
  }
}

export const toggleTheme = () => setTheme(currentTheme() === 'dark' ? 'parchment' : 'dark');

// ---------- header / footer ----------

export const header = el(
  'header',
  { class: 'header' },
  el('div', { class: 'logo' }, 'DITHER', el('span', {}, '/'), 'ASCII'),
  segmented(
    'mode',
    [
      { value: 'dither', label: 'Dither' },
      { value: 'ascii', label: 'ASCII' },
    ],
    store,
  ),
  el('div', { class: 'hint' }, 'Hold Space — original'),
  themeBtn,
  button('?', () => toggleHelp(), 'btn small help-btn'),
);

export const transport = new Transport();

export const info = {
  name: el('span', { class: 'name' }, '—'),
  size: el('span', { class: 'hide-sm' }),
  out: el('span'),
  zoom: el('span', { class: 'hide-sm' }),
  status: el('span', { class: 'busy' }),
};

let statusTimer = 0;
let flashing = false;
/** Show a short message in the footer for three seconds. */
export function flash(msg: string): void {
  info.status.textContent = msg;
  flashing = true;
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    flashing = false;
    info.status.textContent = '';
  }, 3000);
}

/** Render status (e.g. diffusion time); held back while a flash message is showing. */
export function setStatus(text: string): void {
  if (!flashing) info.status.textContent = text;
}

/** Press-and-hold comparison for touch screens (Space does the same on a keyboard). */
function holdOriginalButton(): HTMLButtonElement {
  const b = button('Original', () => {}, 'btn small hold');
  b.title = 'Hold to compare with the original (Space)';
  b.addEventListener('pointerdown', (e) => {
    if (!rt.current) return;
    b.setPointerCapture(e.pointerId);
    actions.setOriginal(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    b.addEventListener(ev, () => actions.setOriginal(false));
  }
  return b;
}

export const footer = el(
  'footer',
  { class: 'footer' },
  info.name,
  transport.root,
  info.size,
  info.out,
  info.status,
  el('span', { class: 'spacer' }),
  info.zoom,
  holdOriginalButton(),
  button('Fit', () => actions.fit(), 'btn small'),
  button('1:1', () => actions.zoom100(), 'btn small hide-sm'),
);

// ---------- help ----------

const SHORTCUTS: [string, string][] = [
  ['Space (hold)', 'Show original'],
  ['F · double-click', 'Fit to view'],
  ['1', '100% zoom'],
  ['Wheel · drag', 'Zoom · pan'],
  ['D · A', 'Dither · ASCII mode'],
  ['K', 'Play / pause video'],
  ['B', 'Toggle boil'],
  ['T', 'Dark / parchment theme'],
  ['O', 'Open file'],
  ['E', 'Export'],
  ['Ctrl+V', 'Paste image'],
  ['?', 'This help'],
];

export const help = el(
  'div',
  { class: 'help', hidden: '', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
  el(
    'div',
    { class: 'help-card' },
    el(
      'div',
      { class: 'section-head' },
      el('span', { class: 'section-title' }, 'Shortcuts'),
      button('Close', () => toggleHelp(false), 'link'),
    ),
    el('dl', {}, ...SHORTCUTS.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
  ),
);
help.addEventListener('click', (e) => e.target === help && toggleHelp(false));

export function toggleHelp(on = help.hidden): void {
  help.hidden = !on;
}
