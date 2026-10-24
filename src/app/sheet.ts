import { el } from '../ui/controls';
import { nextLevel, sheetHeights, snapSheet, type SheetLevel } from '../ui/sheet';
import { panel } from './panel';
import { exportFoot } from './panel/export';
import { header } from './shell';

// On narrow screens the settings panel is a sheet pulled up from the bottom: its handle and the
// Export button, half the screen, or all of it below the header. The preview keeps the space
// above the sheet (at most half the screen is taken from it, so it never disappears).

const NARROW = matchMedia('(max-width: 767px)');
const root = document.documentElement;

const handle = el(
  'button',
  { class: 'sheet-handle', type: 'button', 'aria-label': 'Settings panel', 'aria-expanded': 'true' },
  el('span', { class: 'sheet-grip' }),
);
panel.prepend(handle);

let level: SheetLevel = 'half';

function heights() {
  return sheetHeights(window.innerHeight, header.offsetHeight, handle.offsetHeight + exportFoot.offsetHeight);
}

function setHeight(h: number): void {
  const { half } = heights();
  root.style.setProperty('--sheet-h', `${Math.round(h)}px`);
  root.style.setProperty('--sheet-space', `${Math.round(Math.min(h, half))}px`);
}

function setLevel(next: SheetLevel): void {
  level = next;
  panel.dataset.sheet = next;
  handle.setAttribute('aria-expanded', String(next !== 'peek'));
  setHeight(heights()[next]);
}

function sync(): void {
  if (NARROW.matches) setLevel(level);
  else {
    root.style.removeProperty('--sheet-h');
    root.style.removeProperty('--sheet-space');
    delete panel.dataset.sheet;
  }
}
NARROW.addEventListener('change', sync);
window.addEventListener('resize', () => NARROW.matches && setLevel(level));
sync();
panel.addEventListener('reveal-settings', () => { if (NARROW.matches) setLevel('full'); });

// Drag the handle to any height; on release it settles on a level. A tap steps to the next level.
let drag: { id: number; y: number; h: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null = null;
handle.addEventListener('pointerdown', (e) => {
  if (!NARROW.matches || e.button !== 0 || drag) return;
  const now = performance.now();
  drag = { id: e.pointerId, y: e.clientY, h: heights()[level], lastY: e.clientY, lastT: now, velocity: 0, moved: false };
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic pointer: dragging still works while over the handle.
  }
  panel.classList.add('dragging');
});
handle.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const { peek, full } = heights();
  if (Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
  setHeight(Math.min(full, Math.max(peek, drag.h + drag.y - e.clientY)));
  const now = performance.now();
  drag.velocity = (drag.lastY - e.clientY) / Math.max(1, now - drag.lastT); // px/ms, up is positive
  drag.lastY = e.clientY;
  drag.lastT = now;
});
const release = (e: PointerEvent) => {
  if (!drag || drag.id !== e.pointerId) return;
  const d = drag;
  drag = null;
  panel.classList.remove('dragging');
  if (!d.moved) return setLevel(nextLevel(level));
  const { peek, full } = heights();
  const h = Math.min(full, Math.max(peek, d.h + d.y - e.clientY));
  // A flick only counts when the finger was still moving at release (not after a pause).
  const velocity = performance.now() - d.lastT < 80 ? d.velocity : 0;
  setLevel(snapSheet(h, heights(), velocity));
};
handle.addEventListener('pointerup', release);
const cancel = () => {
  if (!drag) return;
  drag = null;
  panel.classList.remove('dragging');
  setLevel(level);
};
handle.addEventListener('pointercancel', cancel);
handle.addEventListener('lostpointercapture', cancel);
window.addEventListener('blur', cancel);
// Pointer taps use `release`; keyboard / assistive-technology clicks have detail zero.
handle.addEventListener('click', (e) => { if (!e.detail && NARROW.matches) setLevel(nextLevel(level)); });
handle.addEventListener('keydown', (e) => {
  if (!NARROW.matches || ![' ', 'Enter'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  if (!e.repeat) setLevel(nextLevel(level));
});
handle.addEventListener('keyup', (e) => {
  if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
});
// ASCII adds export buttons: a peeked sheet must still fit its footer after switching mode.
const sizeObserver = new ResizeObserver(() => { if (NARROW.matches && !drag) setLevel(level); });
sizeObserver.observe(exportFoot);
sizeObserver.observe(header);
