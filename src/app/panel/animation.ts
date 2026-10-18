import { EASES, LOOPS, MAX_LANES, newLane, serializeLanes, type Lane } from '../../anim';
import { LFO_SHAPES } from '../../ascii/lfo';
import { EFFECTS } from '../../pipeline/effects';
import {
  ADJUST_SLIDERS,
  ANIM_DURATION_SLIDER,
  ANIM_KEYS,
  animatableSpec,
  ASCII_SLIDERS,
  BOIL_SLIDER,
  DITHER_SLIDERS,
  FX_SLIDERS,
  type Params,
} from '../../state';
import { button, el, freeSelect, freeSlider, section, showWhen, slider, toggle } from '../../ui/controls';
import { lanesOf, store } from '../core';

/** Settings a lane can drive, labelled with enough context to tell them apart. */
const LANE_TARGETS = [
  ...ADJUST_SLIDERS.map((s) => ({ group: 'Adjust', key: s.key, label: s.label })),
  ...Object.values(DITHER_SLIDERS).map((s) => ({ group: 'Dither', key: s.key, label: s.label })),
  ...Object.entries(ASCII_SLIDERS).map(([name, s]) => ({
    group: 'ASCII',
    key: s.key,
    label: /^offset./.test(name) ? `Offset LFO · ${s.label}` : /^depth./.test(name) ? `Depth LFO · ${s.label}` : s.label,
  })),
  ...EFFECTS.flatMap((fx) => FX_SLIDERS[fx.id].map((s) => ({ group: 'Effects', key: s.key, label: `${fx.label} · ${s.label}` }))),
].filter((t) => animatableSpec(t.key));
const targetLabel = (key: string) => LANE_TARGETS.find((t) => t.key === key)?.label ?? key;

const laneTarget = el('select', { 'aria-label': 'Setting to animate' });
for (const group of [...new Set(LANE_TARGETS.map((t) => t.group))]) {
  const og = el('optgroup', { label: group });
  for (const t of LANE_TARGETS.filter((x) => x.group === group)) og.append(el('option', { value: t.key }, t.label));
  laneTarget.append(og);
}
laneTarget.value = 'contrast';
const addLaneBtn = button('+ Animate', () => addLane(), 'btn small');
const laneList = el('div', { class: 'lane-list' });

// Edits from a lane's own sliders must not rebuild the cards (that would drop the slider being dragged).
let editingLanes = false;
function setLanes(lanes: Lane[], rebuild: boolean): void {
  editingLanes = !rebuild;
  store.set('animLanes', serializeLanes(lanes));
  editingLanes = false;
}
const updateLane = (id: number, patch: Partial<Lane>, rebuild = false) =>
  setLanes(
    lanesOf(store.params).map((l) => (l.id === id ? { ...l, ...patch } : l)),
    rebuild,
  );

function addLane(): void {
  const key = laneTarget.value as Lane['key'];
  const spec = animatableSpec(key);
  const lanes = lanesOf(store.params);
  if (!spec || lanes.length >= MAX_LANES || lanes.some((l) => l.key === key)) return;
  const id = lanes.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  setLanes([...lanes, newLane(id, key, spec, store.params[key])], true);
}

function laneCard(lane: Lane): HTMLElement {
  const spec = animatableSpec(lane.key)!;
  const modeBtn = (mode: Lane['mode'], label: string) => {
    const b = button(label, () => updateLane(lane.id, { mode }, true), lane.mode === mode ? 'chip active' : 'chip');
    b.setAttribute('aria-pressed', `${lane.mode === mode}`);
    return b;
  };
  const remove = button('×', () => setLanes(lanesOf(store.params).filter((l) => l.id !== lane.id), true), 'chip chip-icon');
  remove.title = 'Stop animating';
  const useCurrent = (field: 'from' | 'to') => {
    const b = button('Use current', () => updateLane(lane.id, { [field]: store.params[lane.key] }, true), 'link');
    b.title = 'Set to the slider’s current value';
    return b;
  };
  const range = { min: spec.min, max: spec.max, step: spec.step, format: spec.format };

  const body =
    lane.mode === 'lfo'
      ? [
          freeSelect(
            'Shape',
            LFO_SHAPES.filter((l) => l.id !== 'off').map((l) => ({ value: l.id, label: l.label })),
            lane.shape,
            (v) => updateLane(lane.id, { shape: v }),
          ),
          freeSlider(
            { label: 'Speed', min: 0.05, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)} Hz` },
            lane.hz,
            (v) => updateLane(lane.id, { hz: v }),
          ),
          freeSlider(
            { label: 'Swing', min: 0, max: 100, step: 1, format: (v) => `±${v / 2}%` },
            Math.round(lane.amount * 100),
            (v) => updateLane(lane.id, { amount: v / 100 }),
          ),
        ]
      : [
          el('div', { class: 'lane-key' }, freeSlider({ ...range, label: 'From' }, lane.from, (v) => updateLane(lane.id, { from: v })), useCurrent('from')),
          el('div', { class: 'lane-key' }, freeSlider({ ...range, label: 'To' }, lane.to, (v) => updateLane(lane.id, { to: v })), useCurrent('to')),
          freeSelect(
            'Easing',
            EASES.map((e) => ({ value: e.id, label: e.label })),
            lane.ease,
            (v) => updateLane(lane.id, { ease: v as Lane['ease'] }),
          ),
          freeSelect(
            'Loop',
            LOOPS.map((l) => ({ value: l.id, label: l.label })),
            lane.loop,
            (v) => updateLane(lane.id, { loop: v as Lane['loop'] }),
          ),
        ];

  return el(
    'div',
    { class: 'lane-card' },
    el(
      'div',
      { class: 'lane-head' },
      el('span', { class: 'lane-title' }, targetLabel(lane.key)),
      modeBtn('lfo', 'LFO'),
      modeBtn('keys', 'Keys'),
      remove,
    ),
    el('div', { class: 'lane-body' }, ...body),
  );
}

function renderLanes(): void {
  const lanes = lanesOf(store.params);
  laneList.replaceChildren(...lanes.map(laneCard));
  for (const opt of laneTarget.querySelectorAll('option')) opt.disabled = lanes.some((l) => l.key === opt.value);
  addLaneBtn.disabled = lanes.length >= MAX_LANES;
}
store.subscribe((_, changed) => changed === 'animLanes' && !editingLanes && renderLanes());
renderLanes();

const hasKeyLanes = (p: Params) => lanesOf(p).some((l) => l.mode === 'keys');

export const animationSection = section(
  'Animation',
  toggle('animate', 'Boil', store),
  showWhen(slider(BOIL_SLIDER, store), store, (p) => p.animate),
  el('div', { class: 'subhead' }, 'Animate settings'),
  el('div', { class: 'lane-add' }, el('div', { class: 'select' }, laneTarget), addLaneBtn),
  laneList,
  showWhen(slider(ANIM_DURATION_SLIDER, store), store, hasKeyLanes),
  showWhen(
    el('div', { class: 'note lane-tip' }, 'Export the same duration as the timeline for a seamless loop.'),
    store,
    hasKeyLanes,
  ),
);
animationSection.head.append(button('Reset', () => store.reset(ANIM_KEYS), 'link'));
