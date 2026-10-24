import { button, el, segmented } from '../ui/controls';
import { Transport } from '../ui/transport';
import { actions, rt, store } from './core';
import { currentLang, onLangChange, toggleLang } from './lang';

// The page frame: preview stage, header, footer status line, help overlay and theme.

export const canvas = el('canvas');
export const fileInput = el('input', { type: 'file', accept: 'image/*,video/*', hidden: '' });

export const stage = el(
  'main',
  { class: 'stage empty' },
  canvas,
  // Start screen while no picture is open: the three ways in, and the three steps to a result.
  el(
    'div',
    { class: 'empty-state' },
    el('div', { class: 'big' }, 'Start with a picture'),
    el(
      'div',
      { class: 'start-buttons' },
      button('Open image or video', () => fileInput.click(), 'btn primary start-btn'),
      button('Try the sample', () => void actions.openSample(), 'btn start-btn'),
      button('Webcam', () => void actions.toggleWebcam(), 'btn start-btn'),
    ),
    el('div', {}, 'or drop a file here · paste with Ctrl+V'),
    el(
      'ol',
      { class: 'start-steps' },
      el('li', {}, el('b', {}, '1'), el('span', {}, 'Pick a picture')),
      el('li', {}, el('b', {}, '2'), el('span', {}, 'Choose a preset, then fine-tune')),
      el('li', {}, el('b', {}, '3'), el('span', {}, 'Export')),
    ),
  ),
  el('div', { class: 'drop-overlay' }, 'DROP TO LOAD'),
  el('div', { class: 'badge' }, 'ORIGINAL'),
);

// ---------- theme ----------

type Theme = 'dark' | 'parchment';
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

// ---------- language ----------

// The button names the other language, in that language, so it can be found in either.
const langBtn = button('', () => toggleLang(), 'btn small lang-btn');
langBtn.setAttribute('translate', 'no');
const syncLangButton = () => {
  const thai = currentLang() === 'th';
  langBtn.textContent = thai ? 'EN' : 'ไทย';
  langBtn.title = thai ? 'Switch to English (L)' : 'เปลี่ยนเป็นภาษาไทย (L)';
};
syncLangButton();
onLangChange(syncLangButton);

// ---------- header / footer ----------

export const header = el(
  'header',
  { class: 'header' },
  el('div', { class: 'logo', translate: 'no' }, 'DITHER', el('span', {}, '/'), 'ASCII'),
  segmented(
    'mode',
    [
      { value: 'dither', label: 'Dither' },
      { value: 'ascii', label: 'ASCII' },
    ],
    store,
  ),
  el('div', { class: 'hint' }, 'Hold Space — original'),
  langBtn,
  themeBtn,
  button('?', () => toggleHelp(), 'btn small help-btn'),
);

export const transport = new Transport();

export const info = {
  name: el('span', { class: 'name', translate: 'no' }, '—'),
  size: el('span', { class: 'hide-sm' }),
  out: el('span', { class: 'out-size' }),
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
function holdOriginalButton(floating = false): HTMLButtonElement {
  const b = button(floating ? 'Hold to show original' : 'Original', () => {}, floating ? 'btn hold floating-original' : 'btn small hold');
  b.title = 'Hold to compare with the original (Space)';
  b.setAttribute('aria-pressed', 'false');
  const show = (on: boolean) => {
    actions.setOriginal(on);
    b.setAttribute('aria-pressed', `${on}`);
  };
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !rt.current) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    show(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    b.addEventListener(ev, () => show(false));
  }
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('keydown', (e) => {
    if (!['Space', 'Enter'].includes(e.code) || !rt.current) return;
    e.preventDefault(); e.stopPropagation(); show(true);
  });
  b.addEventListener('keyup', (e) => {
    if (!['Space', 'Enter'].includes(e.code)) return;
    e.preventDefault(); e.stopPropagation(); show(false);
  });
  b.addEventListener('blur', () => show(false));
  window.addEventListener('blur', () => show(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) show(false); });
  return b;
}
stage.append(holdOriginalButton(true));

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
  ['Ctrl+K', 'Search settings and commands'],
  ['Space (hold)', 'Show original'],
  ['S', 'Split: original | result'],
  ['F · double-click', 'Fit to view'],
  ['1', '100% zoom'],
  ['Wheel · drag', 'Zoom · pan'],
  ['D · A', 'Dither · ASCII mode'],
  ['K', 'Play / pause video'],
  ['[ · ]', 'Trim video: In · Out'],
  ['B', 'Toggle boil'],
  ['T', 'Dark / parchment theme'],
  ['L', 'English / Thai'],
  ['O', 'Open file'],
  ['E', 'Export'],
  ['Ctrl+Z · Ctrl+Shift+Z', 'Undo · redo'],
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
