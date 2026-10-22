import { EFFECTS, moveEffect, normalizeOrder, TINT_MODES } from '../../pipeline/effects';
import { FX_KEYS, FX_SLIDERS, type BooleanKey, type Params } from '../../state';
import { button, colorInput, el, section, select, showWhen, slider, toggle } from '../../ui/controls';
import { store } from '../core';

/** Controls an effect needs besides its sliders. */
const EXTRA_CONTROLS: Record<string, () => HTMLElement[]> = {
  reveal: () => [select('fxRevealTarget', 'Reveal target', [{ value: 'original', label: 'Original' }, { value: 'processed', label: 'Processed' }], store)],
  sort: () => [toggle('fxSortVertical', 'Vertical', store), toggle('fxSortReverse', 'Reverse sort', store)],
  tint: () => [
    el('div', { class: 'color-row single' }, colorInput('fxTintColor', 'Colour', store)),
    select(
      'fxTintMode',
      'Blend',
      TINT_MODES.map((m) => ({ value: m.id, label: m.label })),
      store,
    ),
  ],
};

const effectList = el('div', { class: 'effect-list' });
const effectCards = new Map<string, { card: HTMLElement; up: HTMLButtonElement; down: HTMLButtonElement }>();
for (const fx of EFFECTS) {
  const up = button('↑', () => store.set('fxOrder', moveEffect(store.params.fxOrder, fx.id, -1)), 'chip chip-icon');
  const down = button('↓', () => store.set('fxOrder', moveEffect(store.params.fxOrder, fx.id, 1)), 'chip chip-icon');
  up.title = 'Apply earlier';
  down.title = 'Apply later';
  const body = showWhen(
    el(
      'div',
      { class: 'effect-body' },
      ...(EXTRA_CONTROLS[fx.id]?.() ?? []),
      ...FX_SLIDERS[fx.id].map((s) => slider(s, store)),
      ...(fx.animated ? [el('div', { class: 'note' }, 'Moves when Boil is on')] : []),
    ),
    store,
    (p) => p[fx.enabled] === true,
  );
  const card = el(
    'div',
    { class: 'effect-card' },
    el('div', { class: 'effect-head' }, toggle(fx.enabled as BooleanKey, fx.label, store), up, down),
    body,
  );
  effectCards.set(fx.id, { card, up, down });
}

function syncEffectOrder(p: Params): void {
  const ids = normalizeOrder(p.fxOrder).split(',');
  effectList.replaceChildren(...ids.map((id) => effectCards.get(id)!.card));
  ids.forEach((id, i) => {
    const { up, down } = effectCards.get(id)!;
    up.disabled = i === 0;
    down.disabled = i === ids.length - 1;
  });
}
store.subscribe((p, changed) => changed === 'fxOrder' && syncEffectOrder(p));
syncEffectOrder(store.params);

export const effectsSection = section(
  'Effects',
  el('div', { class: 'note effects-note' }, 'Applied top to bottom, after Dither or ASCII'),
  effectList,
);
effectsSection.head.append(button('Reset', () => store.reset(FX_KEYS), 'link'));
