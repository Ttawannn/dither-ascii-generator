/** IEC sRGB transfer functions. Palette entries and exported pixels always remain sRGB. */
export const srgbToLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function linearPalette(colors: ArrayLike<number>): Float32Array {
  return Float32Array.from(colors, srgbToLinear);
}
