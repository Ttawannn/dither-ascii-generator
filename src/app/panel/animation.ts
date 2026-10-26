import { BAND_LABELS, LOOPS, MAX_LANES, newLane, serializeLanes, type Lane } from '../../anim';
import { BAND_IDS } from '../../audio-levels';
import { TEMPORAL_PATTERNS, TEMPORAL_SLIDERS } from '../../temporal';
import {
  audioKind,
  audioName,
  audioPlaying,
  onAudioChange,
  stopAudio,
  toggleAudioPlayback,
  useAudioFile,
  useMicrophone,
} from '../audio';
import { flash } from '../shell';
import { LFO_SHAPES } from '../../ascii/lfo';
import { EFFECTS } from '../../pipeline/effects';
import {
  ADJUST_SLIDERS,
  ANIM_DURATION_SLIDER,
  ANIM_KEYS,
  animatableSpec,
  ASCII_SLIDERS,
  BOIL_AMOUNT_SLIDER,
  BOIL_PATTERNS,
  BOIL_SLIDER,
  DITHER_SLIDERS,
  FX_SLIDERS,
  MASK_SLIDERS,
  type Params,
} from '../../state';
import { button, el, freeSelect, freeSlider, section, select, showWhen, slider, toggle } from '../../ui/controls';
import { lanesOf, store } from '../core';
import { keyframeEditor, timelineControls } from './timeline';

/** Dither sliders that share a label with another one, prefixed with what they belong to. */
const DITHER_CONTEXT: Partial<Record<string, string>> = {
  waveFollow: 'Wave', patternFollow: 'Pattern',
  axisSmooth: 'Single-axis', cmykSupersample: 'Halftone CMYK',
  shapeSizeJitter: 'Luma Shapes', orbRandom: 'Orbs',
};

/** Settings a lane can drive, labelled with enough context to tell them apart. */
const LANE_TARGETS = [
  ...TEMPORAL_SLIDERS.map((s) => ({ group: 'Animation', key: s.key, label: s.label })),
  ...ADJUST_SLIDERS.map((s) => ({ group: 'Adjust', key: s.key, label: s.label })),
  ...Object.values(DITHER_SLIDERS).map((s) => ({ group: 'Dither', key: s.key, label: DITHER_CONTEXT[s.key] ? `${DITHER_CONTEXT[s.key]} · ${s.label}` : s.label })),
  ...Object.entries(ASCII_SLIDERS).map(([name, s]) => ({
    group: 'ASCII',
    key: s.key,
    label: /^offset./.test(name) ? `Offset LFO · ${s.label}` : /^depth./.test(name) ? `Depth LFO · ${s.label}` : s.label,
  })),
  ...EFFECTS.flatMap((fx) => FX_SLIDERS[fx.id].map((s) => ({ group: 'Effects', key: s.key, label: `${fx.label} · ${s.label}` }))),
  ...Object.values(MASK_SLIDERS).map((s) => ({ group: 'Mask', key: s.key, label: s.label })),
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
  const modeBtn = (mode: Lane['mode'], label: string) => {
    const b = button(label, () => updateLane(lane.id, { mode }, true), lane.mode === mode ? 'chip active' : 'chip');
    b.setAttribute('aria-pressed', `${lane.mode === mode}`);
    return b;
  };
  const remove = button('×', () => setLanes(lanesOf(store.params).filter((l) => l.id !== lane.id), true), 'chip chip-icon');
  remove.title = 'Stop animating';

  const body =
    lane.mode === 'audio'
      ? [
          freeSelect(
            'Band',
            BAND_IDS.map((b) => ({ value: b, label: BAND_LABELS[b] })),
            lane.band,
            (v) => updateLane(lane.id, { band: v as Lane['band'] }),
          ),
          freeSlider(
            { label: 'Strength', min: 0, max: 100, step: 1, format: (v) => `+${v}%` },
            Math.round(lane.amount * 100),
            (v) => updateLane(lane.id, { amount: v / 100 }),
          ),
          freeSlider(
            { label: 'Smoothing', min: 0, max: 1, step: 0.05, format: (v) => `${v.toFixed(2)} s` },
            lane.smooth,
            (v) => updateLane(lane.id, { smooth: v }),
          ),
          ...(audioKind() ? [] : [el('div', { class: 'note' }, 'Choose a microphone or an audio file above')]),
        ]
      : lane.mode === 'lfo'
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
          keyframeEditor(lane, (patch, rebuild) => updateLane(lane.id, patch, rebuild)),
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
      modeBtn('audio', 'Audio'),
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
store.subscribe((_, changed) => changed === 'animDuration' && renderLanes());
renderLanes();

const hasKeyLanes = (p: Params) => lanesOf(p).some((l) => l.mode === 'keys');

// ---------- audio input for audio lanes ----------

const audioPicker = el('input', { type: 'file', accept: 'audio/*', hidden: '' });
audioPicker.addEventListener('change', () => {
  const file = audioPicker.files?.[0];
  audioPicker.value = '';
  if (file) {
    useAudioFile(file)
      .then(() => flash(`Audio: ${file.name}`))
      .catch(() => flash(`Could not read ${file.name} as audio`));
  }
});
const audioStatus = el('div', { class: 'note' });
const playBtn = button('Pause', () => toggleAudioPlayback(), 'btn small');
const stopBtn = button('Stop', () => stopAudio(), 'btn small');
function syncAudio(): void {
  const kind = audioKind();
  audioStatus.textContent = kind
    ? `${audioName()}${kind === 'file' ? ' · sound is added to WebM / MP4 exports' : ' · live only (exports use real time)'}`
    : 'Audio lanes follow a microphone or an audio file';
  playBtn.hidden = kind !== 'file';
  playBtn.textContent = audioPlaying() ? 'Pause' : 'Play';
  stopBtn.hidden = !kind;
}
let previousAudioKind = audioKind();
onAudioChange(() => {
  syncAudio();
  if (previousAudioKind !== audioKind()) {
    previousAudioKind = audioKind(); renderLanes();
  }
});
syncAudio();

const audioControls = el(
  'div',
  {},
  el('div', { class: 'subhead' }, 'Audio input'),
  el(
    'div',
    { class: 'pal-actions' },
    button('Microphone', () => void useMicrophone().catch(() => flash('Microphone not available or not allowed')), 'btn small'),
    button('Audio file…', () => audioPicker.click(), 'btn small'),
    playBtn,
    stopBtn,
  ),
  audioStatus,
  audioPicker,
);

export const animationSection = section(
  'Animation',
  toggle('animate', 'Boil', store),
  showWhen(
    el(
      'div',
      {},
      slider(BOIL_SLIDER, store),
      select('boilPattern', 'Pattern', BOIL_PATTERNS.map((b) => ({ value: b.id, label: b.label })), store),
      slider(BOIL_AMOUNT_SLIDER, store),
      select('temporalPattern', 'Temporal pattern', TEMPORAL_PATTERNS.map((p) => ({ value: p.id, label: p.label })), store),
      showWhen(el('div', {}, ...TEMPORAL_SLIDERS.map((s) => slider(s, store)),
        toggle('temporalLoop', 'Loop temporal pattern', store)), store, (p) => p.temporalPattern !== 'off'),
      el('div', { class: 'note' }, 'Pattern and amount shape the jitter in error diffusion and ASCII'),
    ),
    store,
    (p) => p.animate,
  ),
  el('div', { class: 'subhead' }, 'Animate settings'),
  el('div', { class: 'lane-add' }, el('div', { class: 'select' }, laneTarget), addLaneBtn),
  laneList,
  timelineControls,
  slider(ANIM_DURATION_SLIDER, store),
  showWhen(
    el('div', { class: 'note lane-tip' }, 'Export the same duration as the timeline for a seamless loop.'),
    store,
    hasKeyLanes,
  ),
  audioControls,
);
animationSection.head.append(button('Reset', () => store.reset(ANIM_KEYS), 'link'));
