/**
 * Layer 2: a second rendering of the same source with its own mode and dither / ASCII settings,
 * blended over layer 1. Stored as JSON in the `layer2` param; `params` holds only the layer's own
 * settings that differ from the defaults (everything else is shared with layer 1).
 */
export interface Layer {
  on: boolean;
  /** One of LAYER_BLENDS. */
  blend: string;
  /** 0..100 */
  opacity: number;
  /** Apply the Mask to this layer only, instead of to the final result. */
  maskOnly: boolean;
  params: Record<string, unknown>;
}

export const LAYER_BLENDS = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'difference', label: 'Difference' },
];

export const newLayer = (): Layer => ({ on: true, blend: 'normal', opacity: 100, maskOnly: false, params: { mode: 'ascii' } });

/**
 * Read a stored layer, repairing what it can. `clean` sanitizes the layer's own settings (it is
 * passed in by state.ts, which keeps this module free of an import cycle). Null when empty or unreadable.
 */
export function parseLayer(json: string, clean: (data: unknown) => Record<string, unknown>): Layer | null {
  if (!json) return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const opacity = typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.min(100, Math.max(0, o.opacity)) : 100;
  return {
    on: o.on === true,
    blend: LAYER_BLENDS.some((b) => b.id === o.blend) ? (o.blend as string) : 'normal',
    opacity,
    maskOnly: o.maskOnly === true,
    params: clean(o.params),
  };
}

export const serializeLayer = (layer: Layer): string => JSON.stringify(layer);
