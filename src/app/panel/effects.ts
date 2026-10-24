import { EFFECTS, getEffect, TINT_MODES, type FxLayer } from '../../pipeline/effects';
import { canAddLayer, canGoBefore, currentStack, layerView, newFxLayer, serializeStack } from '../../fx-stack';
import { FX_KEYS, FX_SLIDERS, FX_TYPE_KEYS, type Listener, type ParamStore, type Params } from '../../state';
import { button, colorInput, dial, el, section, select, slider, toggle } from '../../ui/controls';
import { store } from '../core';
import { reorderGrip } from '../../ui/reorder';

// Effects as a stack of layers (the `fxStack` param): add from the menu, show / hide, duplicate,
// remove, reorder by dragging or with ↑ ↓. Layers above the Dither line run before dithering.
// Cards are rebuilt only when layers come or go, so a slider being dragged keeps its pointer
// while its value is written.

const stack = (): FxLayer[] => currentStack(store.params);
const write = (list: FxLayer[]) => store.set('fxStack', serializeStack(list));

/** One layer's settings seen as a store, so the regular controls can edit them. */
class FxLayerStore implements ParamStore {
  private listeners = new Set<Listener>();
  private view: Params;
  /** Stop following the page store (the layer was removed). */
  readonly dispose: () => void;

  constructor(private id: string) {
    this.view = this.compute();
    this.dispose = store.subscribe(() => {
      const prev = this.view;
      this.view = this.compute();
      for (const key of Object.keys(this.view) as (keyof Params)[]) {
        if (this.view[key] !== prev[key]) for (const fn of this.listeners) fn(this.view, key);
      }
    });
  }

  private layer(): FxLayer | undefined {
    return stack().find((l) => l.id === this.id);
  }

  private compute(): Params {
    const layer = this.layer();
    return layer ? layerView(store.params, layer) : store.params;
  }

  get params(): Params {
    return this.view;
  }

  set<K extends keyof Params>(key: K, value: Params[K]): void {
    const layer = this.layer();
    if (!layer || !FX_TYPE_KEYS[layer.type]?.includes(key)) {
      store.set(key, value);
      return;
    }
    write(stack().map((l) => (l.id === this.id ? { ...l, settings: { ...l.settings, [key]: value } } : l)));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** Controls an effect needs besides its sliders. */
const EXTRA_CONTROLS: Record<string, (s: ParamStore) => HTMLElement[]> = {
  reveal: (s) => [select('fxRevealTarget', 'Reveal target', [{ value: 'original', label: 'Original' }, { value: 'processed', label: 'Processed' }], s)],
  sort: (s) => [toggle('fxSortVertical', 'Vertical', s), toggle('fxSortReverse', 'Reverse sort', s)],
  glow: (s) => [
    dial(FX_SLIDERS.glow.find((spec) => spec.key === 'fxGlowAngle')!, s),
    toggle('fxGlowCompensate', 'Radius compensation', s),
    el('div', { class: 'color-row single' }, colorInput('fxGlowColor', 'Glow colour', s)),
  ],
  tint: (s) => [
    el('div', { class: 'color-row single' }, colorInput('fxTintColor', 'Colour', s)),
    select('fxTintMode', 'Blend', TINT_MODES.map((m) => ({ value: m.id, label: m.label })), s),
  ],
};

// ---------- moving layers ----------

const DIVIDER = '|';

/** Layers in display order with the Dither line between those before and after dithering. */
function displayOrder(list: FxLayer[]): string[] {
  return [...list.filter((l) => l.before).map((l) => l.id), DIVIDER, ...list.filter((l) => !l.before).map((l) => l.id)];
}

/** The stack for a display order (layers above the line go before dithering, if they can). */
function fromDisplay(order: string[], list: FxLayer[]): FxLayer[] {
  const line = order.indexOf(DIVIDER);
  return order
    .filter((id) => id !== DIVIDER)
    .map((id) => {
      const layer = list.find((l) => l.id === id)!;
      return { ...layer, before: order.indexOf(id) < line && canGoBefore(layer.type) };
    });
}

/** Move a layer to display position `to` (an index in the order without it). */
function moveTo(id: string, to: number): void {
  const list = stack();
  const order = displayOrder(list).filter((x) => x !== id);
  order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
  write(fromDisplay(order, list));
}

const step = (id: string, dir: -1 | 1) => moveTo(id, displayOrder(stack()).indexOf(id) + dir);

// ---------- cards ----------

interface Card {
  store: FxLayerStore;
  card: HTMLElement;
  name: HTMLElement;
  eye: HTMLButtonElement;
  up: HTMLButtonElement;
  down: HTMLButtonElement;
}

const list = el('div', { class: 'effect-list' });
const cards = new Map<string, Card>();
const divider = el('div', { class: 'fx-divider', role: 'separator' }, el('span', {}, 'Dither'));
const empty = el('div', { class: 'note' }, 'No effects yet — add one');

function iconButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = button(text, onClick, 'chip chip-icon');
  b.title = label;
  b.setAttribute('aria-label', label);
  return b;
}

function makeCard(layer: FxLayer): void {
  const fx = getEffect(layer.type);
  const s = new FxLayerStore(layer.id);
  const eye = iconButton('●', 'Hide', () => write(stack().map((l) => (l.id === layer.id ? { ...l, on: !l.on } : l))));
  const up = iconButton('↑', 'Move up', () => step(layer.id, -1));
  const down = iconButton('↓', 'Move down', () => step(layer.id, 1));
  const copy = iconButton('⧉', 'Duplicate', () => {
    const all = [...stack()];
    if (!canAddLayer(all)) return;
    const src = all.find((l) => l.id === layer.id)!;
    all.splice(all.indexOf(src) + 1, 0, { ...newFxLayer(src.type, all), before: src.before, settings: { ...src.settings } });
    write(all);
  });
  const remove = iconButton('×', 'Remove', () => write(stack().filter((l) => l.id !== layer.id)));
  const name = button('', () => (body.hidden = !body.hidden), 'fx-name');
  name.title = 'Show or hide the settings';
  const body = el(
    'div',
    { class: 'effect-body' },
    ...(EXTRA_CONTROLS[fx.id]?.(s) ?? []),
    ...FX_SLIDERS[fx.id].filter((spec) => spec.key !== 'fxGlowAngle').map((spec) => slider(spec, s)),
    ...(fx.animated ? [el('div', { class: 'note' }, 'Moves when Boil is on')] : []),
  );
  const grip = el('span', { class: 'fx-grip', title: 'Hold and drag to reorder', 'aria-hidden': 'true' }, '⋮⋮');
  const card = el('div', { class: 'effect-card' }, el('div', { class: 'effect-head' }, grip, eye, name, up, down, copy, remove), body);
  reorderGrip(grip, card,
    () => displayOrder(stack()).filter((id) => id !== layer.id).map((id) => id === DIVIDER ? divider : cards.get(id)!.card),
    (index) => moveTo(layer.id, index));
  cards.set(layer.id, { store: s, card, name, eye, up, down });
}

let shape = '';
let lastOrder = '';

function sync(p: Params): void {
  const layers = currentStack(p);
  const order = displayOrder(layers);
  const ids = layers.map((l) => l.id).sort().join();
  if (ids !== shape) {
    for (const [id, c] of [...cards]) {
      if (layers.some((l) => l.id === id)) continue;
      c.store.dispose();
      cards.delete(id);
    }
    for (const layer of layers) if (!cards.has(layer.id)) makeCard(layer);
    shape = ids;
  }
  if (order.join() !== lastOrder) {
    list.replaceChildren(...order.map((id) => (id === DIVIDER ? divider : cards.get(id)!.card)), ...(layers.length ? [] : [empty]));
    lastOrder = order.join();
  }
  divider.firstElementChild!.textContent = p.mode === 'ascii' ? 'ASCII' : 'Dither';
  const count = new Map<string, number>();
  order.forEach((id, i) => {
    if (id === DIVIDER) return;
    const layer = layers.find((l) => l.id === id)!;
    const n = (count.get(layer.type) ?? 0) + 1;
    count.set(layer.type, n);
    const c = cards.get(id)!;
    c.name.replaceChildren(el('span', {}, getEffect(layer.type).label), ...(n > 1 ? [el('span', { class: 'fx-num', translate: 'no' }, ` ${n}`)] : []));
    c.eye.textContent = layer.on ? '●' : '○';
    c.eye.setAttribute('aria-pressed', `${layer.on}`);
    c.eye.title = layer.on ? 'Hide' : 'Show';
    c.eye.setAttribute('aria-label', c.eye.title);
    c.card.classList.toggle('off', !layer.on);
    // Pixel sorting and ASCII Reveal stay after dithering: they can't move above the line.
    c.up.disabled = i === 0 || (order[i - 1] === DIVIDER && !canGoBefore(layer.type));
    c.down.disabled = i === order.length - 1;
  });
  addBtn.disabled = !canAddLayer(layers);
}

// ---------- add menu ----------

const menu = el('div', { class: 'fx-menu', hidden: '' });
const groups: [string, typeof EFFECTS][] = [
  ['Image', EFFECTS.filter((e) => !e.animated)],
  ['Animated', EFFECTS.filter((e) => e.animated)],
];
for (const [title, effects] of groups) {
  menu.append(el('div', { class: 'fx-menu-title' }, title));
  for (const fx of effects) {
    menu.append(
      button(
        fx.label,
        () => {
          const all = stack();
          if (canAddLayer(all)) write([...all, newFxLayer(fx.id, all)]);
          menu.hidden = true;
        },
        'fx-menu-item',
      ),
    );
  }
}
const addBtn = button('+ Add effect', () => (menu.hidden = !menu.hidden), 'btn wide');
addBtn.title = 'Up to 16 effect layers';
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== addBtn) menu.hidden = true;
});

store.subscribe((p, changed) => (changed === 'fxStack' || changed === 'mode' || FX_KEYS.includes(changed)) && sync(p));
sync(store.params);

export const effectsSection = section(
  'Effects',
  el('div', { class: 'note effects-note' }, 'Applied top to bottom · layers above the line change the picture before it is dithered'),
  list,
  el('div', { class: 'fx-add' }, addBtn, menu),
);
effectsSection.head.append(button('Reset', () => store.reset(FX_KEYS), 'link'));
