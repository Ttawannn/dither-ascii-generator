import { DEFAULTS, type BooleanKey, type ParamStore, type Params, type SliderSpec, type StringKey } from '../state';
import { favourites, onFavouritesChange, toggleFavourite } from '../favourites';
import { ALL, categoryFor, FAVOURITES, itemsIn, stepItem, type PickItem } from './picker';
import { sliderNumber } from './numeric';
import { CONTROL_HINTS } from './hints';
import { searchCondition, searchDomain, searchOptions } from './search';

type Attrs = Record<string, string>;

/** Tiny element helper: el('div', { class: 'x' }, child, 'text'). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', onClick);
  return b;
}

export function section(title: string, ...children: Node[]): { root: HTMLElement; head: HTMLElement } {
  const head = el('div', { class: 'section-head' }, el('span', { class: 'section-title' }, title));
  const root = el('section', { class: 'section' }, head, ...children);
  return { root, head };
}

let hintId = 0;

/** Accessible hint: hover, keyboard focus, or tap the info button on a touch screen. */
export function controlHint(root: HTMLElement, input: Element, text?: string): void {
  if (!text) return;
  const id = `control-hint-${++hintId}`;
  const tip = el('span', { id, class: 'control-tooltip', role: 'tooltip' }, text);
  const info = button('ⓘ', () => {
    const on = root.classList.toggle('hint-open');
    info.setAttribute('aria-expanded', `${on}`);
  }, 'hint-button');
  info.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  info.setAttribute('aria-label', 'About this setting');
  info.setAttribute('aria-describedby', id);
  info.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-describedby', id);
  root.querySelector('.value-editor')?.setAttribute('aria-describedby', id);
  root.classList.add('has-hint');
  const row = root.querySelector('.control-row');
  (row ?? root).append(info);
  root.append(tip);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      root.classList.remove('hint-open');
      info.setAttribute('aria-expanded', 'false');
    }
  });
}

/** Add the same value editor and focused-wheel behavior to any range control. */
export function editableRange(root: HTMLElement, input: HTMLInputElement, value: HTMLElement, write: (value: number) => void): void {
  const editor = el('input', { type: 'number', class: 'value-editor', hidden: '', min: input.min, max: input.max, step: input.step, 'aria-label': input.getAttribute('aria-label') ?? 'Value' });
  const edit = button('', () => {
    editor.value = input.value;
    edit.hidden = true;
    editor.hidden = false;
    editor.focus();
    editor.select();
  }, 'control-value value-button');
  edit.title = 'Type a value';
  value.replaceWith(edit, editor);
  value.classList.remove('control-value');
  edit.append(value);
  const finish = (commit: boolean) => {
    if (editor.hidden) return;
    if (commit && editor.value.trim() && Number.isFinite(editor.valueAsNumber)) {
      write(sliderNumber(editor.valueAsNumber, Number(input.min), Number(input.max), Number(input.step) || 1));
    }
    editor.hidden = true;
    edit.hidden = false;
  };
  editor.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      finish(e.key === 'Enter');
      edit.focus();
    }
  });
  editor.addEventListener('blur', () => finish(true));
  editor.addEventListener('dblclick', (e) => e.stopPropagation());
  edit.addEventListener('dblclick', (e) => e.stopPropagation());
  input.addEventListener('wheel', (e) => {
    if (document.activeElement !== input || !e.deltaY || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    write(sliderNumber(Number(input.value) + (e.deltaY < 0 ? 1 : -1) * Number(input.step || 1) * (e.shiftKey ? 10 : 1), Number(input.min), Number(input.max), Number(input.step) || 1));
  }, { passive: false });
  root.dataset.numeric = 'true';
}

/** Range slider bound to a numeric param. Double-click the track to reset. */
export function slider(spec: SliderSpec, store: ParamStore): HTMLElement {
  const fmt = spec.format ?? ((v: number) => `${v}`);
  const value = el('span', { class: 'control-value' });
  const input = el('input', { type: 'range', min: `${spec.min}`, max: `${spec.max}`, step: `${spec.step}`, 'aria-label': spec.label });
  const reset = el('button', { class: 'reset-one', type: 'button', title: 'Reset to default', 'aria-label': 'Reset to default' }, '↺');
  reset.addEventListener('click', () => store.set(spec.key, DEFAULTS[spec.key]));
  const root = el('div', { class: 'control' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, spec.label), reset, value), input);
  const sync = (p: Params) => {
    const v = p[spec.key];
    input.value = `${v}`;
    value.textContent = fmt(v);
    input.style.setProperty('--fill', `${((v - spec.min) / (spec.max - spec.min)) * 100}%`);
    root.classList.toggle('changed', v !== DEFAULTS[spec.key]);
  };
  input.addEventListener('input', () => store.set(spec.key, Number(input.value)));
  input.addEventListener('dblclick', () => store.set(spec.key, DEFAULTS[spec.key]));
  store.subscribe((p, changed) => changed === spec.key && sync(p));
  sync(store.params);
  editableRange(root, input, value, (v) => store.set(spec.key, v));
  controlHint(root, input, spec.hint ?? CONTROL_HINTS[spec.key]);
  searchDomain(store, spec.key, () => [spec.min, spec.max, DEFAULTS[spec.key]]);
  return root;
}

/** On/off switch bound to a boolean param. */
export function toggle(key: BooleanKey, label: string, store: ParamStore, hint = CONTROL_HINTS[key]): HTMLElement {
  const root = el(
    'button',
    { class: 'toggle control', type: 'button', role: 'switch' },
    el('span', { class: 'control-label' }, label),
    el('span', { class: 'box' }),
  );
  const sync = (p: Params) => {
    root.classList.toggle('on', p[key]);
    root.setAttribute('aria-checked', `${p[key]}`);
  };
  root.addEventListener('click', () => store.set(key, !store.params[key]));
  store.subscribe((p, changed) => changed === key && sync(p));
  sync(store.params);
  searchDomain(store, key, () => [false, true]);
  if (hint) {
    const wrapper = el('div', { class: 'control hinted-toggle' }, root);
    controlHint(wrapper, root, hint);
    return wrapper;
  }
  return root;
}

/** Segmented button group bound to a string param. */
export function segmented<K extends 'mode'>(
  key: K,
  options: { value: Params[K]; label: string }[],
  store: ParamStore,
): HTMLElement {
  searchDomain(store, key, () => options.map((o) => o.value));
  const root = el('div', { class: 'segmented', role: 'tablist' });
  const buttons = options.map((opt) => {
    const b = button(opt.label, () => store.set(key, opt.value), '');
    b.setAttribute('role', 'tab');
    root.append(b);
    return { b, value: opt.value };
  });
  const sync = (p: Params) => {
    for (const { b, value } of buttons) {
      const active = p[key] === value;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', `${active}`);
    }
  };
  store.subscribe((p, changed) => changed === key && sync(p));
  sync(store.params);
  return root;
}

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

/** Native <select> bound to a string param; options with a `group` go into <optgroup>s. */
export function select(key: StringKey, label: string, options: SelectOption[], store: ParamStore, hint = CONTROL_HINTS[key]): HTMLElement {
  const input = el('select', { 'aria-label': label });
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const opt of options) {
    const o = el('option', { value: opt.value }, opt.label);
    if (!opt.group) {
      input.append(o);
      continue;
    }
    if (!groups.has(opt.group)) {
      const g = el('optgroup', { label: opt.group });
      groups.set(opt.group, g);
      input.append(g);
    }
    groups.get(opt.group)!.append(o);
  }
  const root = el(
    'label',
    { class: 'control' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, label)),
    el('div', { class: 'select' }, input),
  );
  input.addEventListener('change', () => store.set(key, input.value as Params[typeof key]));
  store.subscribe((p, changed) => changed === key && (input.value = p[key]));
  input.value = store.params[key];
  searchDomain(store, key, () => options.map((o) => o.value));
  controlHint(root, input, hint);
  return root;
}

/**
 * Angle dial bound to a numeric param in degrees: drag around the ring (an axis, so 0–180 covers
 * every direction when `spec.max` is 180), arrow keys (Shift for 15°), or type the value.
 */
export function dial(spec: SliderSpec, store: ParamStore): HTMLElement {
  const key = spec.key;
  const span = spec.max - spec.min;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-1 -1 2 2');
  svg.setAttribute('class', 'dial');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'slider');
  svg.setAttribute('aria-label', spec.label);
  svg.setAttribute('aria-valuemin', `${spec.min}`);
  svg.setAttribute('aria-valuemax', `${spec.max}`);
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('r', '0.9');
  ring.setAttribute('class', 'dial-ring');
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('class', 'dial-line');
  const knob = document.createElementNS(NS, 'circle');
  knob.setAttribute('r', '0.16');
  knob.setAttribute('class', 'dial-knob');
  svg.append(ring, line, knob);
  const input = el('input', { type: 'number', min: `${spec.min}`, max: `${spec.max}`, step: `${spec.step}`, class: 'dial-input', 'aria-label': spec.label });

  const clamp = (v: number) => Math.min(spec.max, Math.max(spec.min, Math.round(v / spec.step) * spec.step));
  const sync = (v: number) => {
    // A full turn of the knob covers the range twice for an axis (0–180°), once otherwise.
    const a = ((v - spec.min) / span) * (span <= 180 ? Math.PI : 2 * Math.PI);
    const [x, y] = [Math.cos(a) * 0.72, -Math.sin(a) * 0.72];
    line.setAttribute('x1', `${span <= 180 ? -x : 0}`);
    line.setAttribute('y1', `${span <= 180 ? -y : 0}`);
    line.setAttribute('x2', `${x}`);
    line.setAttribute('y2', `${y}`);
    knob.setAttribute('cx', `${x}`);
    knob.setAttribute('cy', `${y}`);
    svg.setAttribute('aria-valuenow', `${v}`);
    input.value = `${v}`;
  };
  const set = (v: number) => store.set(key, clamp(v) as Params[typeof key]);
  const fromPointer = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const deg = (Math.atan2(r.top + r.height / 2 - e.clientY, e.clientX - r.left - r.width / 2) * 180) / Math.PI;
    const turn = span <= 180 ? 180 : 360;
    set(spec.min + ((((deg % turn) + turn) % turn) / turn) * span);
  };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  svg.addEventListener('pointermove', (e) => svg.hasPointerCapture(e.pointerId) && fromPointer(e));
  svg.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    set((store.params[key] as number) + d * (e.shiftKey ? 15 : spec.step));
  });
  svg.addEventListener('dblclick', () => store.set(key, DEFAULTS[key] as Params[typeof key]));
  input.addEventListener('change', () => set(Number(input.value)));
  store.subscribe((p, changed) => changed === key && sync(p[key] as number));
  sync(store.params[key] as number);
  return el(
    'div',
    { class: 'control dial-control' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, spec.label)),
    el('div', { class: 'dial-row' }, svg as unknown as HTMLElement, input),
  );
}

export interface PickerOptions {
  /** Category ids and labels, in display order. */
  categories: { id: string; label: string }[];
  /** Item names are user content or proper names: keep them out of translation. */
  noTranslate?: boolean;
  /** The current item when it isn't simply the param (Source palettes also carry a colour count). */
  read?: (p: Params) => string;
  /** Apply an item when it isn't simply setting the param. */
  write?: (value: string) => void;
  /** A picture for an item (colour swatches, a thumbnail); adds a ⊞ grid of the category to browse. */
  visual?: (item: PickItem) => HTMLElement | null;
}

/**
 * Two rows bound to a string param: a Category (with All and Favourites) and the item within it,
 * each with ‹ › to step through, plus a star that adds the current item to the favourites.
 * `items` is read again on `refresh()`, for lists that change (imported palettes).
 */
export function categoryPicker(
  key: StringKey,
  label: string,
  items: () => PickItem[],
  store: ParamStore,
  opts: PickerOptions,
): HTMLElement & { refresh(): void } {
  searchDomain(store, key, () => [...new Set(items().map((it) => it.value.startsWith('image@') ? 'image' : it.value))]);
  const favKey = key as string;
  const catSelect = el('select', { 'aria-label': `${label} category` });
  const itemSelect = el('select', { 'aria-label': label });
  if (opts.noTranslate) itemSelect.setAttribute('translate', 'no');
  let shown = ALL;
  const read = () => (opts.read ? opts.read(store.params) : store.params[key]);

  const step = (cls: string, text: string, name: string, onClick: () => void) => {
    const b = button(text, onClick, `btn small picker-step ${cls}`);
    b.setAttribute('aria-label', name);
    b.title = name;
    return b;
  };
  const star = button('☆', () => toggleFavourite(favKey, read()), 'link picker-star');
  star.title = 'Add to favourites';

  // Listed categories first, in their order, then any others the items use (user categories).
  const categoryIds = () => {
    const ids = [ALL, ...(favourites(favKey).length ? [FAVOURITES] : [])];
    const present = [...new Set(items().map((i) => i.category))];
    const known = opts.categories.map((c) => c.id);
    return [...ids, ...known.filter((id) => present.includes(id)), ...present.filter((id) => !known.includes(id))];
  };
  const categoryLabel = (id: string) =>
    id === ALL ? 'All' : id === FAVOURITES ? 'Favourites' : (opts.categories.find((c) => c.id === id)?.label ?? id);

  const render = () => {
    const list = items();
    const fav = favourites(favKey);
    const current = read();
    shown = categoryFor(list, current, shown, fav);
    catSelect.replaceChildren(...categoryIds().map((id) => el('option', { value: id }, categoryLabel(id))));
    catSelect.value = shown;
    const visible = itemsIn(list, shown, fav);
    if (shown === ALL) {
      // Grouped by category, like the plain select.
      const groups = new Map<string, HTMLOptGroupElement>();
      itemSelect.replaceChildren();
      for (const it of visible) {
        if (!groups.has(it.category)) {
          const g = el('optgroup', { label: categoryLabel(it.category) });
          groups.set(it.category, g);
          itemSelect.append(g);
        }
        groups.get(it.category)!.append(el('option', { value: it.value }, it.label));
      }
    } else {
      itemSelect.replaceChildren(...visible.map((it) => el('option', { value: it.value }, it.label)));
    }
    if (!visible.some((it) => it.value === current)) itemSelect.prepend(el('option', { value: current, disabled: '' }, list.find((i) => i.value === current)?.label ?? current));
    itemSelect.value = current;
    const on = fav.includes(current);
    star.textContent = on ? '★' : '☆';
    star.setAttribute('aria-pressed', `${on}`);
    star.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
  };

  const choose = (value: string) => {
    if (value === read()) return;
    if (opts.write) opts.write(value);
    else store.set(key, value as Params[typeof key]);
  };
  searchOptions.set(itemSelect, () => items().map((it) => ({ label: it.label, choose: () => choose(it.value) })));
  catSelect.addEventListener('change', () => {
    shown = catSelect.value;
    const first = itemsIn(items(), shown, favourites(favKey))[0];
    if (first && !itemsIn(items(), shown, favourites(favKey)).some((i) => i.value === read())) choose(first.value);
    render();
  });
  itemSelect.addEventListener('change', () => choose(itemSelect.value));
  const stepCategory = (dir: number) => {
    const ids = categoryIds();
    shown = ids[(ids.indexOf(shown) + dir + ids.length) % ids.length];
    const first = itemsIn(items(), shown, favourites(favKey))[0];
    if (first) choose(first.value);
    render();
  };
  const stepValue = (dir: number) => choose(stepItem(items(), read(), dir, shown, favourites(favKey)));

  // Source palettes read the colour count too, so a change of `levels` can change the item.
  store.subscribe((_, changed) => (changed === key || (opts.read && changed === 'levels')) && render());
  // ⊞: the items of the shown category as a grid of pictures, kept open while browsing.
  const grid = el('div', { class: 'picker-grid', hidden: '' });
  if (opts.noTranslate) grid.setAttribute('translate', 'no');
  const renderGrid = () => {
    if (grid.hidden || !opts.visual) return;
    const current = read();
    grid.replaceChildren(
      ...itemsIn(items(), shown, favourites(favKey)).map((it) => {
        const tile = button('', () => choose(it.value), 'picker-tile');
        tile.classList.toggle('active', it.value === current);
        tile.setAttribute('aria-pressed', `${it.value === current}`);
        const pic = opts.visual!(it);
        tile.append(...(pic ? [pic] : []), el('span', { class: 'picker-tile-name' }, it.label));
        tile.title = it.label;
        return tile;
      }),
    );
  };
  const gridBtn = opts.visual
    ? step('grid', '⊞', `Browse ${label.toLowerCase()}`, () => {
        grid.hidden = !grid.hidden;
        gridBtn!.setAttribute('aria-expanded', `${!grid.hidden}`);
        renderGrid();
      })
    : null;
  gridBtn?.setAttribute('aria-expanded', 'false');
  const renderAll = () => {
    render();
    renderGrid();
  };
  store.subscribe((_, changed) => (changed === key || (opts.read && changed === 'levels')) && renderGrid());
  catSelect.addEventListener('change', renderGrid);
  onFavouritesChange(renderAll);
  render();

  const root = el(
    'div',
    { class: 'control picker' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, 'Category')),
    el(
      'div',
      { class: 'picker-row' },
      el('div', { class: 'select' }, catSelect),
      step('prev', '‹', 'Previous category', () => stepCategory(-1)),
      step('next', '›', 'Next category', () => stepCategory(1)),
    ),
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, label), star),
    el(
      'div',
      { class: 'picker-row' },
      el('div', { class: 'select' }, itemSelect),
      step('prev', '‹', `Previous ${label.toLowerCase()}`, () => stepValue(-1)),
      step('next', '›', `Next ${label.toLowerCase()}`, () => stepValue(1)),
      ...(gridBtn ? [gridBtn] : []),
    ),
    grid,
  );
  if (gridBtn) root.classList.add('with-grid');
  return Object.assign(root, { refresh: renderAll });
}

export type ColorKey =
  | 'ink' | 'paper' | 'asciiFg' | 'asciiBg' | 'fxTintColor' | 'maskColor' | 'shapeBackground' | 'polyBorderColor' | 'fxGlowColor';

/** Colour swatch bound to a hex string param. */
export function colorInput(key: ColorKey, label: string, store: ParamStore): HTMLElement {
  const input = el('input', { type: 'color', 'aria-label': label });
  const hex = el('span', { class: 'control-value' });
  const root = el('label', { class: 'color-input' }, input, el('span', { class: 'control-label' }, label), hex);
  const sync = (p: Params) => {
    input.value = p[key];
    hex.textContent = p[key].toUpperCase();
  };
  input.addEventListener('input', () => store.set(key, input.value));
  store.subscribe((p, changed) => changed === key && sync(p));
  sync(store.params);
  return root;
}

/** Row of colour chips; re-render with `update`. */
export function swatches(): { root: HTMLElement; update: (hexes: string[], extra?: string) => void } {
  const root = el('div', { class: 'swatches' });
  return {
    root,
    update(hexes, extra) {
      root.replaceChildren(
        ...hexes.map((h) => el('span', { class: 'swatch', style: `background:${h}`, title: h.toUpperCase() })),
        ...(extra ? [el('span', { class: 'swatch-extra' }, extra)] : []),
      );
    },
  };
}

/** Show `node` only while `when(params)` is true. */
/** A row of colour swatches, for picker tiles. */
export function swatchStrip(colors: string[]): HTMLElement {
  return el('span', { class: 'tile-swatch', 'aria-hidden': 'true' }, ...colors.slice(0, 32).map((c) => el('span', { style: `background:${c}` })));
}

/** Mark a control as advanced: in Basic mode it shows only after "More settings…" in its section. */
export function advanced<T extends HTMLElement>(node: T): T {
  node.classList.add('adv');
  return node;
}

export function showWhen(node: HTMLElement, store: ParamStore, when: (p: Params) => boolean, reveal?: () => void): HTMLElement {
  searchCondition(node, store, when, reveal);
  const sync = (p: Params) => (node.hidden = !when(p));
  store.subscribe(sync);
  sync(store.params);
  return node;
}

/** Single-line text field bound to a string param. */
export function textInput(key: StringKey, label: string, store: ParamStore, maxLength = 64): HTMLElement {
  const input = el('input', { type: 'text', maxlength: `${maxLength}`, spellcheck: 'false', 'aria-label': label });
  const root = el(
    'label',
    { class: 'control' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, label)),
    input,
  );
  input.addEventListener('input', () => store.set(key, input.value as Params[typeof key]));
  store.subscribe((p, changed) => changed === key && input.value !== p[key] && (input.value = p[key]));
  input.value = store.params[key];
  return root;
}

/** Ink/paper style preset chips; `apply` receives the (dark, light) pair. */
export function colorPresets(
  presets: { label: string; ink: string; paper: string }[],
  apply: (ink: string, paper: string) => void,
): HTMLElement {
  return el(
    'div',
    { class: 'presets' },
    ...presets.map((m) => {
      const b = el(
        'button',
        { class: 'preset', type: 'button', title: m.label },
        el('span', { style: `background:${m.ink}` }),
        el('span', { style: `background:${m.paper}` }),
      );
      b.addEventListener('click', () => apply(m.ink, m.paper));
      return b;
    }),
  );
}

/** A range slider that isn't bound to a store key (for values held elsewhere, e.g. animation lanes). */
export function freeSlider(
  spec: Omit<SliderSpec, 'key'>,
  value: number,
  onInput: (v: number) => void,
): HTMLElement {
  const fmt = spec.format ?? ((v: number) => `${v}`);
  const out = el('span', { class: 'control-value' });
  const input = el('input', {
    type: 'range',
    min: `${spec.min}`,
    max: `${spec.max}`,
    step: `${spec.step}`,
    'aria-label': spec.label,
  });
  const show = (v: number) => {
    input.value = `${v}`;
    out.textContent = fmt(v);
    input.style.setProperty('--fill', `${((v - spec.min) / (spec.max - spec.min)) * 100}%`);
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    show(v);
    onInput(v);
  });
  show(value);
  const root = el(
    'div',
    { class: 'control' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, spec.label), out),
    input,
  );
  editableRange(root, input, out, (v) => { show(v); onInput(v); });
  controlHint(root, input, spec.hint);
  return root;
}

/** A <select> that isn't bound to a store key. */
export function freeSelect(
  label: string,
  options: SelectOption[],
  value: string,
  onChange: (v: string) => void,
): HTMLElement {
  const input = el('select', { 'aria-label': label });
  for (const opt of options) input.append(el('option', { value: opt.value }, opt.label));
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  return el(
    'label',
    { class: 'control' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, label)),
    el('div', { class: 'select' }, input),
  );
}
