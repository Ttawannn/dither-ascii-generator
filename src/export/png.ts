import { crc32 } from '../crc32';

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * The PNG with its print resolution set (a pHYs chunk right after IHDR, replacing any existing one),
 * so layout and print programs open it at the intended physical size.
 */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (PNG_SIGNATURE.some((b, i) => png[i] !== b)) throw new Error('Not a PNG');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrEnd = 8 + 12 + view.getUint32(8); // signature + IHDR (length, type, data, CRC)

  const chunk = new Uint8Array(21);
  const c = new DataView(chunk.buffer);
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  c.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  c.setUint32(8, ppm);
  c.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  c.setUint32(17, crc32(chunk.subarray(4, 17)));

  // Copy every chunk after IHDR except an existing pHYs.
  const rest: Uint8Array[] = [];
  for (let p = ihdrEnd; p + 8 <= png.length; ) {
    const len = view.getUint32(p);
    const end = p + 12 + len;
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    if (type !== 'pHYs') rest.push(png.subarray(p, end));
    p = end;
  }
  const out = new Uint8Array(ihdrEnd + chunk.length + rest.reduce((s, r) => s + r.length, 0));
  out.set(png.subarray(0, ihdrEnd));
  out.set(chunk, ihdrEnd);
  let at = ihdrEnd + chunk.length;
  for (const r of rest) {
    out.set(r, at);
    at += r.length;
  }
  return out;
}

/**
 * The JPEG with its print resolution set in the JFIF header (APP0 right after SOI), inserting the
 * header when the encoder left it out.
 */
export function withJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG');
  const d = Math.min(65535, Math.round(dpi));
  const isJfif = jpeg[2] === 0xff && jpeg[3] === 0xe0 && String.fromCharCode(...jpeg.subarray(6, 11)) === 'JFIF\0';
  if (isJfif) {
    const out = jpeg.slice();
    out[13] = 1; // units: dots per inch
    out.set([d >> 8, d & 255, d >> 8, d & 255], 14);
    return out;
  }
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 255, d >> 8, d & 255, 0, 0];
  const out = new Uint8Array(jpeg.length + app0.length);
  out.set(jpeg.subarray(0, 2));
  out.set(app0, 2);
  out.set(jpeg.subarray(2), 2 + app0.length);
  return out;
}

export interface ImageOptions {
  /** 'image/png' (default), 'image/jpeg' or 'image/webp'. */
  type?: string;
  /** 0..1, for JPEG and WebP. */
  quality?: number;
  /** Print resolution, stored in PNG and JPEG. */
  dpi?: number;
  /** Background filled under transparent pixels (JPEG has no alpha). */
  matte?: string;
}

/** The processed canvas as an image file, upscaled by `scale` with nearest-neighbour. */
export async function imageBlob(source: HTMLCanvasElement, scale: number, opts: ImageOptions = {}): Promise<Blob> {
  const type = opts.type ?? 'image/png';
  const out = document.createElement('canvas');
  out.width = source.width * scale;
  out.height = source.height * scale;
  const g = out.getContext('2d')!;
  if (opts.matte) {
    g.fillStyle = opts.matte;
    g.fillRect(0, 0, out.width, out.height);
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(source, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, type, opts.quality));
  if (!blob || blob.type !== type) throw new Error(`This browser can’t save ${type.slice(6).toUpperCase()}`);
  if (!opts.dpi || type === 'image/webp') return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const marked = type === 'image/jpeg' ? withJpegDpi(bytes, opts.dpi) : withDpi(bytes, opts.dpi);
  return new Blob([marked.slice()], { type });
}

/** The processed canvas as PNG, with a print resolution when `dpi` is set. */
export const pngBlob = (source: HTMLCanvasElement, scale: number, dpi?: number) => imageBlob(source, scale, { dpi });

/** Save the processed canvas as PNG. */
export async function exportPng(source: HTMLCanvasElement, scale: number, filename: string, dpi?: number): Promise<void> {
  download(await pngBlob(source, scale, dpi), filename);
}
