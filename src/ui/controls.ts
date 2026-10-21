import { DEFAULTS, type BooleanKey, type ParamStore, type Params, type SliderSpec, type StringKey } from '../state';

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

/** Range slider bound to a numeric param. Double-click resets to default. */
export function slider(spec: SliderSpec, store: ParamStore): HTMLElement {
  const fmt = spec.format ?? ((v: number) => `${v}`);
  const value = el('span', { class: 'control-value' });
  const input = el('input', {
    type: 'range',
    min: `${spec.min}`,
    max: `${spec.max}`,
    step: `${spec.step}`,
    'aria-label': spec.label,
  });
  const root = el(
    'div',
    { class: 'control', title: 'Double-click to reset' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, spec.label), value),
    input,
  );

  const sync = (p: Params) => {
    const v = p[spec.key];
    input.value = `${v}`;
    value.textContent = fmt(v);
    input.style.setProperty('--fill', `${((v - spec.min) / (spec.max - spec.min)) * 100}%`);
    root.classList.toggle('changed', v !== DEFAULTS[spec.key]);
  };

  input.addEventListener('input', () => store.set(spec.key, Number(input.value)));
  root.addEventListener('dblclick', () => store.set(spec.key, DEFAULTS[spec.key]));
  store.subscribe((p, changed) => changed === spec.key && sync(p));
  sync(store.params);
  return root;
}

/** On/off switch bound to a boolean param. */
export function toggle(key: BooleanKey, label: string, store: ParamStore): HTMLElement {
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
  return root;
}

/** Segmented button group bound to a string param. */
export function segmented<K extends 'mode'>(
  key: K,
  options: { value: Params[K]; label: string }[],
  store: ParamStore,
): HTMLElement {
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
export function select(key: StringKey, label: string, options: SelectOption[], store: ParamStore): HTMLElement {
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
  return root;
}

export type ColorKey = 'ink' | 'paper' | 'asciiFg' | 'asciiBg' | 'fxTintColor' | 'maskColor';

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
export function showWhen(node: HTMLElement, store: ParamStore, when: (p: Params) => boolean): HTMLElement {
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
  return el(
    'div',
    { class: 'control' },
    el('div', { class: 'control-row' }, el('span', { class: 'control-label' }, spec.label), out),
    input,
  );
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
