/**
 * Minimal .zip reader: stored and deflated entries, read through the central directory.
 * No zip64 or encryption. Deflate uses the browser's DecompressionStream, so there is no dependency.
 * `writeZip` stores files uncompressed (for PNGs, which are compressed already).
 */

import { crc32 } from './crc32';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function inflateRaw(data: Uint8Array, maxBytes = Infinity, signal?: AbortSignal): Promise<Uint8Array> {
  // slice() copies into a plain ArrayBuffer, which Blob requires.
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) throw new Error('Archive is too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

export interface ZipOptions {
  maxBytes?: number;
  maxEntries?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  strict?: boolean;
}

/** Files in the archive (folders skipped, unsupported compression skipped). Throws if it isn't a zip. */
export async function readZip(bytes: Uint8Array, options: ZipOptions = {}): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record sits at the end, before an optional comment of up to 64 KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');

  const count = view.getUint16(eocd + 10, true);
  if (count > (options.maxEntries ?? 10000)) throw new Error('Too many archive entries');
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  let totalBytes = 0;
  const names = new Set<string>();
  for (let n = 0; n < count; n++) {
    options.signal?.throwIfAborted();
    if (view.getUint32(p, true) !== CENTRAL) throw new Error('Damaged zip directory');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const unpacked = view.getUint32(p + 24, true);
    const expectedCrc = view.getUint32(p + 16, true);
    const flags = view.getUint16(p + 8, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (options.strict && (flags & 1 || names.has(name) || /(^\/|\\|(^|\/)\.\.(\/|$))/.test(name)))
      throw new Error('Invalid archive entry');
    names.add(name);
    if (totalBytes + unpacked > (options.maxBytes ?? Infinity)) throw new Error('Archive is too large');
    if (view.getUint32(local, true) !== LOCAL) throw new Error('Damaged zip entry');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (start + size > bytes.length) throw new Error('Damaged zip entry');
    const data = method === 0 ? raw.slice() : method === 8
      ? await inflateRaw(raw, (options.maxBytes ?? Infinity) - totalBytes, options.signal) : null;
    if (!data && options.strict) throw new Error('Unsupported archive compression');
    if (data) {
      if (options.strict && (data.length !== unpacked || crc32(data) !== expectedCrc)) throw new Error('Damaged zip entry');
      totalBytes += data.length;
      out.push({ name, data });
    }
    options.onProgress?.(n + 1, count);
    if (options.onProgress) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return out;
}

/**
 * A .zip of the files, stored without compression. Names are UTF-8; a repeated name gets " (2)",
 * " (3)"… before its extension.
 */
export function writeZip(files: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const used = new Set<string>();
  const unique = (name: string) => {
    let out = name;
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    for (let n = 2; used.has(out.toLowerCase()); n++) out = `${stem} (${n})${ext}`;
    used.add(out.toLowerCase());
    return out;
  };
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(unique(f.name));
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, CENTRAL, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const dirSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, EOCD, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
