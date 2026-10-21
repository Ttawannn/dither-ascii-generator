// Draws the app icon (an ordered-dithered sphere on the dark background) and writes PNGs to
// public/. No dependencies: a minimal PNG encoder on top of node:zlib.
// Run with: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0a, 0x0a, 0x0a];
const INK = [0xe5, 0xe5, 0xe5];
const BAYER8 = (() => {
  const m = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let v = 0;
      for (let bit = 0; bit < 3; bit++) {
        const bx = (x >> bit) & 1;
        const by = (y >> bit) & 1;
        v |= (((bx ^ by) << 1) | by) << (2 * (2 - bit));
      }
      m.push((v + 0.5) / 64);
    }
  }
  return m;
})();

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Lit sphere, dithered in 32×32 cells; it stays inside the middle 70% (safe for maskable icons). */
function icon(size) {
  const cells = 32;
  const cell = size / cells;
  return png(size, (x, y) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const u = (cx + 0.5) / cells - 0.5;
    const v = (cy + 0.5) / cells - 0.5;
    const r = 0.33;
    const d = Math.hypot(u, v) / r;
    if (d > 1) return BG;
    const z = Math.sqrt(1 - d * d);
    // Lambert shading, light from the upper left; a soft curve keeps a visible gradient.
    const [lx, ly, lz] = [-0.5, -0.6, 0.62].map((c, _, l) => c / Math.hypot(...l));
    // A little ambient light keeps the shadow side dotted, so the whole circle reads.
    const light = 0.12 + 0.85 * Math.max(0, (u / r) * lx + (v / r) * ly + z * lz) ** 1.6;
    return light > BAYER8[(cy % 8) * 8 + (cx % 8)] ? INK : BG;
  });
}

for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, icon(size));
writeFileSync('public/apple-touch-icon.png', icon(180));
console.log('icons written to public/');
