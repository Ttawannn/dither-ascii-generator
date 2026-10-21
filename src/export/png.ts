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

/** The processed canvas as PNG, upscaled by `scale` with nearest-neighbour, with a print resolution when `dpi` is set. */
export async function pngBlob(source: HTMLCanvasElement, scale: number, dpi?: number): Promise<Blob> {
  const out = document.createElement('canvas');
  out.width = source.width * scale;
  out.height = source.height * scale;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(source, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  if (!dpi) return blob;
  const bytes = withDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new Blob([bytes.slice()], { type: 'image/png' });
}

/** Save the processed canvas as PNG. */
export async function exportPng(source: HTMLCanvasElement, scale: number, filename: string, dpi?: number): Promise<void> {
  download(await pngBlob(source, scale, dpi), filename);
}
