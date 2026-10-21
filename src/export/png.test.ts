import { describe, expect, it } from 'vitest';
import { crc32 } from '../crc32';
import { withDpi } from './png';

function chunk(type: string, data: number[]): number[] {
  const body = [...type].map((c) => c.charCodeAt(0)).concat(data);
  const be = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  return [...be(data.length), ...body, ...be(crc32(Uint8Array.from(body)))];
}
const png = (...chunks: number[][]) => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunks.flat()]);
const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [1, 2, 3]);
const IEND = chunk('IEND', []);

/** Chunk types in order. */
function types(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer);
  const out: string[] = [];
  for (let p = 8; p < bytes.length; p += 12 + view.getUint32(p)) {
    out.push(String.fromCharCode(...bytes.subarray(p + 4, p + 8)));
  }
  return out;
}

describe('withDpi', () => {
  it('adds pHYs after IHDR in pixels per metre', () => {
    const out = withDpi(png(IHDR, IDAT, IEND), 300);
    expect(types(out)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    const view = new DataView(out.buffer);
    const at = 8 + IHDR.length;
    expect(view.getUint32(at + 8)).toBe(11811); // 300 / 0.0254
    expect(view.getUint32(at + 12)).toBe(11811);
    expect(out[at + 16]).toBe(1);
    expect(view.getUint32(at + 17)).toBe(crc32(out.subarray(at + 4, at + 17)));
  });

  it('replaces an existing pHYs', () => {
    const old = chunk('pHYs', [0, 0, 11, 19, 0, 0, 11, 19, 1]);
    const out = withDpi(png(IHDR, old, IDAT, IEND), 72);
    expect(types(out)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(new DataView(out.buffer).getUint32(8 + IHDR.length + 8)).toBe(2835);
  });

  it('rejects other files', () => {
    expect(() => withDpi(new Uint8Array(20), 300)).toThrow();
  });
});
