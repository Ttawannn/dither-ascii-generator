export const BAND_SHAPES = [
  { id: 'empty', label: 'Empty', symbol: '·' },
  { id: 'circle', label: 'Circle', symbol: '●' },
  { id: 'square', label: 'Square', symbol: '■' },
  { id: 'diamond', label: 'Diamond', symbol: '◆' },
  { id: 'line', label: 'Line', symbol: '━' },
  { id: 'cross', label: 'Cross', symbol: '+' },
  { id: 'ring', label: 'Ring', symbol: '○' },
  { id: 'image', label: 'Image', symbol: '▧' },
] as const;

export interface ShapeBand {
  /** Inclusive upper boundary in sRGB brightness, 0–255. */
  end: number;
  shape: typeof BAND_SHAPES[number]['id'];
  size: number;
  color: string;
  /** Straight-alpha RGBA, 64×64, base64. Embedded so presets remain portable. */
  image?: string;
  imageName?: string;
}

export const MAX_SHAPE_BANDS = 12;
export const BAND_IMAGE_SIZE = 64;
export const BAND_IMAGE_BYTES = BAND_IMAGE_SIZE * BAND_IMAGE_SIZE * 4;
export const MAX_SHAPE_JSON = 300000;
const IMAGE_BASE64 = /^[A-Za-z0-9+/]{21846}==$/;
export const SHAPE_SETS = [
  { id: 'dots', label: 'Halftone Dots' },
  { id: 'geometric', label: 'Geometric' },
  { id: 'lines', label: 'Lines' },
];

export function shapeSet(id = 'dots'): ShapeBand[] {
  const shapes: ShapeBand['shape'][] = id === 'geometric'
    ? ['empty', 'circle', 'diamond', 'square', 'cross', 'ring']
    : id === 'lines' ? ['empty', 'line', 'line', 'cross', 'cross', 'square']
      : ['empty', 'circle', 'circle', 'circle', 'circle', 'circle'];
  return shapes.map((shape, i) => ({
    end: Math.floor((i + 1) * 256 / 6) - 1,
    shape,
    size: [0, 22, 38, 55, 72, 90][i],
    color: ['#171923', '#b8ac7d', '#8bbdc6', '#c6e7ed', '#e7f4f6', '#ffffff'][i],
  }));
}

export const DEFAULT_SHAPE_BANDS = JSON.stringify(shapeSet());

/** Reject malformed sets rather than silently changing the mapping. */
export function parseShapeBands(raw: string): ShapeBand[] | null {
  if (raw.length > MAX_SHAPE_JSON) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length < 2 || data.length > MAX_SHAPE_BANDS) return null;
    let previous = -1;
    const bands: ShapeBand[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') return null;
      const { end, shape, size, color, image, imageName } = item as Record<string, unknown>;
      if (typeof end !== 'number' || !Number.isInteger(end) || end <= previous || end > 255 || end < 0 ||
          !BAND_SHAPES.some((s) => s.id === shape) ||
          typeof size !== 'number' || !Number.isFinite(size) || size < 0 || size > 100 ||
          typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return null;
      if (image !== undefined && (typeof image !== 'string' || !IMAGE_BASE64.test(image))) return null;
      if (imageName !== undefined && (typeof imageName !== 'string' || imageName.length > 80)) return null;
      if (shape === 'image' && image === undefined) return null;
      bands.push({ end, shape: shape as ShapeBand['shape'], size, color: color.toLowerCase(),
        ...(image === undefined ? {} : { image: image as string }),
        ...(imageName === undefined ? {} : { imageName: imageName as string }) });
      previous = end;
    }
    return previous === 255 ? bands : null;
  } catch {
    return null;
  }
}

/** A boundary cannot cross its neighbours: each band retains at least one brightness level. */
export function moveShapeBoundary(bands: ShapeBand[], index: number, end: number): ShapeBand[] {
  if (index < 0 || index >= bands.length - 1 || !Number.isFinite(end)) return bands;
  const low = (bands[index - 1]?.end ?? -1) + 1;
  const high = bands[index + 1].end - 1;
  const next = Math.min(high, Math.max(low, Math.round(end)));
  return bands.map((b, i) => i === index ? { ...b, end: next } : b);
}

export function shapeBandWidthLimit(bands: ShapeBand[], index: number): number {
  return index === bands.length - 1
    ? 254 - (bands[index - 2]?.end ?? -1)
    : bands[index + 1].end - (bands[index - 1]?.end ?? -1) - 1;
}

export function resizeShapeBand(bands: ShapeBand[], index: number, width: number): ShapeBand[] {
  if (!bands[index]) return bands;
  return index === bands.length - 1
    ? moveShapeBoundary(bands, index - 1, 255 - width)
    : moveShapeBoundary(bands, index, (bands[index - 1]?.end ?? -1) + width);
}

export const decodeBandImage = (image: string): Uint8Array => Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
export const encodeBandImage = (pixels: Uint8ClampedArray): string =>
  btoa(Array.from(pixels, (b) => String.fromCharCode(b)).join(''));

export function splitShapeBand(bands: ShapeBand[], index: number): ShapeBand[] {
  const band = bands[index];
  const start = index ? bands[index - 1]?.end + 1 : 0;
  if (!band || bands.length >= MAX_SHAPE_BANDS || band.end <= start) return bands;
  return [...bands.slice(0, index), { ...band, end: Math.floor((start + band.end) / 2) },
    { ...band }, ...bands.slice(index + 1)];
}

export function distributeShapeBands(bands: ShapeBand[]): ShapeBand[] {
  return bands.map((band, i) => ({ ...band, end: Math.floor((i + 1) * 256 / bands.length) - 1 }));
}

/** Reverse the appearances while keeping the existing brightness boundaries. */
export function reverseShapeBands(bands: ShapeBand[]): ShapeBand[] {
  return bands.map((band, i) => ({ ...bands[bands.length - 1 - i], end: band.end }));
}
