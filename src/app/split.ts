import { button, el } from '../ui/controls';
import { actions, rt, store } from './core';
import { canvas, footer, stage } from './shell';
import { renderer, viewer } from './gpu';

// Before / after split: the untouched source is drawn into an overlay canvas that sits exactly on
// the preview and is clipped at a draggable line (original on the left). It never touches the
// WebGL output, so exports and the async error-diffusion path are unaffected.

const overlay = el('canvas', { class: 'split-original', 'aria-hidden': 'true' });
const handle = el('div', { class: 'split-handle', role: 'slider', 'aria-label': 'Split position', tabindex: '0' });
stage.append(overlay, handle);

let on = false;
let pos = 0.5;

const toggleBtn = button('Split', () => setSplit(!on), 'btn small split-btn');
toggleBtn.title = 'Compare original and result side by side (S)';
footer.insertBefore(toggleBtn, footer.querySelector('.hold'));

export function setSplit(next: boolean): void {
  on = next;
  toggleBtn.classList.toggle('on', on);
  stage.classList.toggle('split', on);
  drawOriginal();
}
export const toggleSplit = () => setSplit(!on);

/** Keep the overlay and the handle on top of the preview canvas. */
function layout(): void {
  overlay.hidden = handle.hidden = !on || !renderer.hasSource;
  if (overlay.hidden) return;
  overlay.style.width = canvas.style.width;
  overlay.style.height = canvas.style.height;
  overlay.style.transform = canvas.style.transform;
  overlay.style.clipPath = `inset(0 ${((1 - pos) * 100).toFixed(3)}% 0 0)`;
  const c = canvas.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  handle.style.left = `${c.left - s.left + pos * c.width}px`;
  handle.style.top = `${Math.max(0, c.top - s.top)}px`;
  handle.style.height = `${Math.min(s.bottom, c.bottom) - Math.max(s.top, c.top)}px`;
  handle.setAttribute('aria-valuenow', `${Math.round(pos * 100)}`);
}

/** Redraw the original (each draw, so video frames and mirroring stay in step). */
function drawOriginal(): void {
  const src = rt.current;
  if (on && src && renderer.hasSource) {
    const [w, h] = renderer.sourceSize;
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
    const g = overlay.getContext('2d')!;
    g.setTransform(store.params.mirror ? -1 : 1, 0, 0, 1, store.params.mirror ? w : 0, 0);
    g.drawImage(src.element, 0, 0, w, h);
  }
  layout();
}
actions.drawSplit = drawOriginal;

const prevOnChange = viewer.onChange;
viewer.onChange = () => {
  prevOnChange();
  layout();
};

// Drag the line, or nudge it with the arrow keys.
let dragging = false;
handle.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); // don't start panning the stage
  dragging = true;
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // No active pointer to capture (synthetic event); dragging still works while over the handle.
  }
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  handle.addEventListener(type, () => (dragging = false));
}
handle.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const c = canvas.getBoundingClientRect();
  pos = Math.min(1, Math.max(0, (e.clientX - c.left) / c.width));
  layout();
});
handle.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  pos = Math.min(1, Math.max(0, pos + (e.key === 'ArrowLeft' ? -0.02 : 0.02)));
  layout();
});

layout();
