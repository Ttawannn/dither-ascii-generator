import { DEFAULTS, type BooleanKey, type Params, type SliderSpec, type Store } from '../state';

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
export function slider(spec: SliderSpec, store: Store): HTMLElement {
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
export function toggle(key: BooleanKey, label: string, store: Store): HTMLElement {
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
  store: Store,
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
