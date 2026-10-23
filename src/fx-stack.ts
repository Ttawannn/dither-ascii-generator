import { AFTER_ONLY, effectFor, getEffect, MAX_FX_LAYERS, normalizeOrder, parseStack, serializeStack, type FxLayer, type PostEffect } from './pipeline/effects';
import { DEFAULTS, FX_TYPE_KEYS, type Params } from './state';

/**
 * The effect stack as the renderer and the panel see it. A look saved before effect layers has no
 * `fxStack`: its stack is the effects switched on by the flat fx* settings, in `fxOrder`, each with
 * those settings, so it renders exactly as before. The panel writes `fxStack` on the first edit.
 */

const pick = (p: Partial<Params>, type: string): Partial<Params> => {
  const out: Partial<Params> = {};
  for (const key of FX_TYPE_KEYS[type] ?? []) if (p[key] !== undefined) Object.assign(out, { [key]: p[key] });
  return out;
};

/** The stack a look without `fxStack` stands for. */
export function stackFromFlat(p: Params): FxLayer[] {
  return normalizeOrder(p.fxOrder)
    .split(',')
    .filter((type) => p[getEffect(type).enabled] === true)
    .map((type) => ({ id: type, type, on: true, before: false, settings: pick(p, type) }));
}

let cache: { raw: string; list: FxLayer[] } | null = null;

/** The current stack (stored layers are already sanitized, so they are only parsed here). */
export function currentStack(p: Params): FxLayer[] {
  if (!p.fxStack) return stackFromFlat(p);
  if (cache?.raw !== p.fxStack) cache = { raw: p.fxStack, list: parseStack(p.fxStack, (_, s) => (s ?? {}) as Partial<Params>) ?? [] };
  return cache.list;
}

/** The params a layer renders with: the page params with the layer's own settings on top. */
export const layerView = (p: Params, layer: FxLayer): Params =>
  ({ ...p, ...layer.settings, [getEffect(layer.type).enabled]: true }) as Params;

/** Shader inputs of the layers that are on: those before dithering, and those after. */
export function stackEffects(p: Params): { pre: PostEffect[]; post: PostEffect[] } {
  const pre: PostEffect[] = [];
  const post: PostEffect[] = [];
  for (const layer of currentStack(p)) {
    if (!layer.on) continue;
    (layer.before ? pre : post).push(effectFor(getEffect(layer.type), layerView(p, layer)));
  }
  return { pre, post };
}

export const hasEffect = (p: Params, type: string) => currentStack(p).some((l) => l.on && l.type === type);

/** Any effect layer switched on. */
export const anyEffect = (p: Params) => currentStack(p).some((l) => l.on);

/** A new layer of `type` with default settings and an id not used in `list`. */
export function newFxLayer(type: string, list: FxLayer[]): FxLayer {
  let id = type;
  for (let n = 2; list.some((l) => l.id === id); n++) id = `${type}-${n}`;
  return { id, type, on: true, before: false, settings: pick(DEFAULTS, type) };
}

export const canAddLayer = (list: FxLayer[]) => list.length < MAX_FX_LAYERS;
export const canGoBefore = (type: string) => !AFTER_ONLY.includes(type);

const typeOfKey = new Map(Object.entries(FX_TYPE_KEYS).flatMap(([type, keys]) => keys.map((k) => [k as string, type])));

/**
 * Animation lanes name flat settings (fxGlowRadius…). With layers, such a lane drives the first
 * layer of that effect: `animate` runs the lanes on that layer's view (so an LFO swings around the
 * layer's own value), and the results go into the layer's settings.
 */
export function animateStack<L extends { key: string }>(
  p: Params,
  lanes: readonly L[],
  animate: (view: Params, lanes: L[]) => Params,
  animated: Params,
): Params {
  if (!p.fxStack) return animated;
  const fxLanes = lanes.filter((lane) => typeOfKey.has(lane.key));
  if (!fxLanes.length) return animated;
  const list = currentStack(p).map((l) => ({ ...l, settings: { ...l.settings } }));
  for (const type of new Set(fxLanes.map((lane) => typeOfKey.get(lane.key)!))) {
    const layer = list.find((l) => l.type === type);
    if (!layer) continue;
    const own = fxLanes.filter((lane) => typeOfKey.get(lane.key) === type);
    const view = animate(layerView(p, layer), own);
    for (const lane of own) Object.assign(layer.settings, { [lane.key]: view[lane.key as keyof Params] });
  }
  return { ...animated, fxStack: serializeStack(list) };
}

export { serializeStack };
