import { newLayer, serializeLayer, type Layer } from '../layers';
import { DEFAULTS, LAYER_KEYS, layerParams, readLayer, type Listener, type ParamStore, type Params } from '../state';
import { store } from './core';

/**
 * Layer 2's settings seen as a store, so the regular dither / ASCII controls can edit them.
 * Reading gives layer 1's params with the layer's own settings on top; writing one of the
 * layer's own keys updates the `layer2` JSON, anything else goes to the page store.
 */
class LayerStore implements ParamStore {
  private listeners = new Set<Listener>();
  private view: Params;

  constructor() {
    this.view = this.compute();
    store.subscribe(() => {
      const prev = this.view;
      this.view = this.compute();
      // Tell each control whose value changed, the way the page store does.
      for (const key of Object.keys(this.view) as (keyof Params)[]) {
        if (this.view[key] !== prev[key]) for (const fn of this.listeners) fn(this.view, key);
      }
    });
  }

  /** The stored layer, or a fresh (off) one when there is none yet. */
  get layer(): Layer {
    return readLayer(store.params) ?? { ...newLayer(), on: false };
  }

  private compute(): Params {
    return layerParams(store.params, this.layer);
  }

  get params(): Params {
    return this.view;
  }

  set<K extends keyof Params>(key: K, value: Params[K]): void {
    if (!LAYER_KEYS.includes(key)) {
      store.set(key, value);
      return;
    }
    const layer = this.layer;
    const params = { ...layer.params };
    // Keep the stored JSON short: only what differs from the defaults.
    if (value === DEFAULTS[key]) delete params[key];
    else params[key] = value;
    store.set('layer2', serializeLayer({ ...layer, params }));
  }

  /** Change the layer's own switches (on, blend, opacity, mask target). */
  setLayer(patch: Partial<Omit<Layer, 'params'>>): void {
    store.set('layer2', serializeLayer({ ...this.layer, ...patch }));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const layerStore = new LayerStore();
