/** Keep typed and wheel values on the slider's step grid, including decimal steps. */
export function sliderNumber(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  return Number(Math.min(max, Math.max(min, min + Math.round((clamped - min) / step) * step)).toFixed(8));
}
