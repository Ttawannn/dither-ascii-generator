import { describe, expect, it } from 'vitest';
import { mergeLibrary, sanitizeLibrary } from './palette-library';
import { readZip } from './zip';

const enc = new TextEncoder();

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A small zip writer for the tests (CRC left at 0; the reader doesn't check it). */
async function makeZip(files: { name: string; text: string; deflate?: boolean }[], comment = ''): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = enc.encode(f.text);
    const body = f.deflate ? await deflateRaw(raw) : raw;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, f.deflate ? 8 : 0, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, body);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, f.deflate ? 8 : 0, true);
    dir.setUint32(20, body.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const dirSize = central.reduce((s, p) => s + p.length, 0);
  const note = enc.encode(comment);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, note.length, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer), note];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('readZip', () => {
  it('reads stored and deflated entries, skipping folders', async () => {
    const zip = await makeZip(
      [
        { name: 'pals/', text: '' },
        { name: 'pals/Raven.json', text: '{"name":"Raven","colors":["#000","#fff"]}' },
        { name: 'pals/Long.txt', text: '#123456 '.repeat(200), deflate: true },
      ],
      'a trailing comment',
    );
    const entries = await readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['pals/Raven.json', 'pals/Long.txt']);
    const dec = new TextDecoder();
    expect(dec.decode(entries[0].data)).toContain('Raven');
    expect(dec.decode(entries[1].data)).toBe('#123456 '.repeat(200));
  });

  it('rejects data that is not a zip', async () => {
    await expect(readZip(enc.encode('just some text, definitely not an archive'))).rejects.toThrow('Not a zip file');
  });
});

describe('palette library', () => {
  it('keeps only named palettes with at least two valid colours', () => {
    expect(
      sanitizeLibrary([
        { name: 'Ok', colors: ['#000000', '#FFF', 'nope'] },
        { name: 'One', colors: ['#000000'] },
        { colors: ['#000', '#fff'] },
        'junk',
      ]),
    ).toEqual([{ name: 'Ok', colors: ['#000000', '#ffffff'] }]);
    expect(sanitizeLibrary({})).toEqual([]);
  });

  it('replaces palettes with the same name and keeps the newest last', () => {
    const a = { name: 'A', colors: ['#000000', '#ffffff'] };
    const b = { name: 'B', colors: ['#111111', '#eeeeee'] };
    const a2 = { name: 'A', colors: ['#ff0000', '#00ff00'] };
    expect(mergeLibrary([a, b], [a2])).toEqual([b, a2]);
  });
});
