import type { Params } from '../state';

/** Shared English copy; the language observer translates both the tooltip and its button. */
export const CONTROL_HINTS: Partial<Record<keyof Params, string>> = {
  fxGlowEpsilon: 'Softens the centre of the glow falloff. Increase it for a more even halo.',
  fxGlowDistance: 'Changes how glow falloff is distributed when Epsilon is above zero.',
  fxGlowFalloff: 'Controls how quickly the glow fades away from bright pixels.',
  fxGlowCompensate: 'Compensates for brightness changes when the glow radius changes.',
  gaussSpread: 'Spreads quantization error over a wider area for a softer grain pattern.',
  edgeCrack: 'How much of the error runs along the nearest edge instead of across it. 0 splits it evenly; 100 sends it all along the edge, leaving crack-like lines.',
  axisBleed: 'Share of the error that leaks to the next line instead of staying on its own. 0 keeps every line separate.',
  paletteMixing: 'Pattern mixes nearby palette colours with an ordered pattern instead of choosing only the nearest colour.',
  linearLight: 'Calculates brightness and dithering in linear light for more accurate tonal balance.',
  perceptual: 'Chooses palette colours by perceived colour distance instead of RGB distance.',
  waveFollow: 'Makes the diffusion wave respond to the brightness of the source image.',
  patternFollow: 'Makes the pattern follow the brightness and detail of the source image.',
};
