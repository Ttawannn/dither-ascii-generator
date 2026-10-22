import { EASES, lanePoints, MAX_POINTS, type Keyframe, type Lane } from '../../anim';
import { animatableSpec } from '../../state';
import { button, el } from '../../ui/controls';
import { actions, animationPaused, clock, requestRender, seekAnimation, store, toggleAnimation } from '../core';

const scrub = el('input', { type: 'range', min: '0', max: '4', step: '0.01', 'aria-label': 'Animation playhead' });
const time = el('output', { translate: 'no' }, '0.00 s');
const play = button('Pause animation', toggleAnimation, 'btn small');
scrub.addEventListener('input', () => seekAnimation(Number(scrub.value)));
export const timelineControls = el('div', { class: 'timeline-controls' },
  el('div', { class: 'btn-row' }, play, button('Restart animation', () => seekAnimation(0), 'btn small'), time), scrub,
  el('div', { class: 'note' }, 'Sliders show base values; edit animated values in keyframes.'));
function sync(): void {
  scrub.max = `${store.params.animDuration}`;
  const now = clock();
  const t = animationPaused() && now <= store.params.animDuration ? now : now % store.params.animDuration;
  if (document.activeElement !== scrub) scrub.value = `${t}`;
  time.textContent = `${t.toFixed(2)} s`;
  play.textContent = animationPaused() ? 'Play animation' : 'Pause animation';
  requestAnimationFrame(sync);
}
requestAnimationFrame(sync);

/** Values live in a stable card while a marker is dragged; commit one undo gesture. */
export function keyframeEditor(lane: Lane, update: (patch: Partial<Lane>, rebuild?: boolean) => void): HTMLElement {
  const spec = animatableSpec(lane.key)!;
  let points = lanePoints(lane).map((p) => ({ ...p }));
  const duration = store.params.animDuration;
  const start = Math.min(lane.start ?? 0, duration - 0.01), end = Math.min(lane.end ?? duration, duration);
  const span = Math.max(0.01, end - start);
  const root = el('div', { class: 'keyframe-editor' });
  const track = el('div', { class: 'keyframe-track', 'aria-label': 'Keyframes' });
  const input = (label: string, value: number, min: number, max: number, step: number, change: (v: number) => void) => {
    const n = el('input', { type: 'number', value: `${value}`, min: `${min}`, max: `${max}`, step: `${step}`, 'aria-label': label });
    n.addEventListener('change', () => { const v = Number(n.value); if (Number.isFinite(v)) { actions.beginUndo(); change(Math.min(max, Math.max(min, v))); } });
    return el('label', {}, el('span', {}, label), n);
  };
  const write = (rebuild = true) => update({ points: points.map((p) => ({ ...p })) }, rebuild);
  root.append(el('div', { class: 'keyframe-row' },
    input('Lane start', start, 0, Math.max(0, end - 0.01), 0.01, (v) => update({ start: v }, true)),
    input('Lane end', end, start + 0.01, duration, 0.01, (v) => update({ end: v }, true))));
  points.forEach((p, i) => {
    const marker = button('◆', () => seekAnimation(start + p.time * span), 'keyframe-marker');
    marker.style.left = `${p.time * 100}%`;
    marker.setAttribute('aria-label', `Keyframe ${i + 1}`);
    marker.setAttribute('role', 'slider'); marker.setAttribute('aria-valuemin', '0'); marker.setAttribute('aria-valuemax', `${span}`);
    marker.setAttribute('aria-valuenow', `${p.time * span}`);
    marker.style.touchAction = 'none';
    const move = (event: PointerEvent) => {
      const bounds = track.getBoundingClientRect();
      const lo = i ? points[i - 1].time + 0.001 : 0, hi = i < points.length - 1 ? points[i + 1].time - 0.001 : 1;
      p.time = Math.max(lo, Math.min(hi, (event.clientX - bounds.left) / bounds.width));
      marker.style.left = `${p.time * 100}%`; marker.setAttribute('aria-valuenow', `${p.time * span}`);
      write(false); seekAnimation(start + p.time * span);
    };
    marker.addEventListener('pointerdown', (event) => {
      actions.beginUndoGesture(); marker.setPointerCapture(event.pointerId);
      marker.addEventListener('pointermove', move);
      const done = () => { marker.removeEventListener('pointermove', move); write(true); actions.endUndoGesture(); };
      marker.addEventListener('pointerup', done, { once: true });
      marker.addEventListener('pointercancel', done, { once: true });
    });
    marker.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); actions.beginUndo();
      const lo = i ? points[i - 1].time + 0.001 : 0, hi = i < points.length - 1 ? points[i + 1].time - 0.001 : 1;
      p.time = Math.max(lo, Math.min(hi, event.key === 'Home' ? lo : event.key === 'End' ? hi : p.time + (event.key === 'ArrowRight' ? 0.01 : -0.01)));
      write(true);
    });
    track.append(marker);
  });
  root.append(track);
  points.forEach((p, i) => {
    const ease = el('select', { 'aria-label': 'Keyframe easing' }, ...EASES.map((e) => el('option', { value: e.id }, e.label)));
    ease.value = p.ease;
    ease.addEventListener('change', () => { actions.beginUndo(); p.ease = ease.value as Keyframe['ease']; write(); });
    const remove = button('×', () => { actions.beginUndo(); points = points.filter((_, j) => j !== i); write(); }, 'chip');
    remove.title = 'Remove keyframe'; remove.disabled = points.length <= 2;
    root.append(el('div', { class: 'keyframe-row' },
      input('Keyframe time', +(start + p.time * span).toFixed(3), start, end, 0.01, (v) => {
        p.time = Math.max(i ? points[i - 1].time + 0.001 : 0, Math.min(i < points.length - 1 ? points[i + 1].time - 0.001 : 1, (v - start) / span)); write();
      }),
      input('Keyframe value', p.value, spec.min, spec.max, spec.step, (v) => { p.value = v; write(); }), ease, remove));
  });
  const add = button('Add keyframe', () => {
    actions.beginUndo();
    let gap = 0;
    for (let i = 1; i < points.length - 1; i++) if (points[i + 1].time - points[i].time > points[gap + 1].time - points[gap].time) gap = i;
    const a = points[gap], b = points[gap + 1];
    points.splice(gap + 1, 0, { time: (a.time + b.time) / 2, value: (a.value + b.value) / 2, ease: a.ease }); write(); requestRender();
  }, 'btn small');
  add.disabled = points.length >= MAX_POINTS;
  root.append(add);
  return root;
}
