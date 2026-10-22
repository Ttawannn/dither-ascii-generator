import { describe, expect, it } from 'vitest';
import { decodeProject, encodeProject, parseProjectManifest, type Project } from './project';
import { DEFAULTS } from './state';
import { writeZip } from './zip';

const fixture = (): Project => ({
  manifest: {
    format: 'dither-ascii-project', version: 1, appVersion: '0.1.0',
    params: { ...DEFAULTS, layer2: JSON.stringify({ on: true, blend: 'screen', opacity: 50, maskOnly: true, params: { algorithm: 'modulation' } }),
      maskMode: 'luma', brightness: 17, exportDpi: 600 },
    source: { path: 'assets/source', name: 'clip.mp4', type: 'video/mp4', kind: 'video', time: 2.5, trim: { start: 1, end: 5 } },
    audio: { path: 'assets/audio', name: 'music.wav', type: 'audio/wav' },
    fonts: [{ path: 'assets/font0', family: 'My Font', name: 'My Font.font', type: '' }],
    locks: { keys: ['brightness'], colors: ['#123456'] }, time: 1.25,
  },
  assets: [{ name: 'assets/source', data: new Uint8Array([1, 2, 3]) }, { name: 'assets/audio', data: new Uint8Array([4, 5]) },
    { name: 'assets/font0', data: new Uint8Array([6]) }],
});

describe('portable projects', () => {
  it('round-trips media, fonts, layer, mask, export settings, locks and timing', async () => {
    const project = fixture();
    expect(await decodeProject(encodeProject(project))).toEqual(project);
  });
  it('rejects unsupported versions and wrong formats', () => {
    expect(() => parseProjectManifest({ ...fixture().manifest, version: 99 })).toThrow('version');
    expect(() => parseProjectManifest({ ...fixture().manifest, format: 'look' })).toThrow('not a project');
  });
  it('rejects broken timings before any asset is installed', () => {
    const m = fixture().manifest;
    for (const source of [{ ...m.source, time: NaN }, { ...m.source, trim: { start: 5, end: 1 } }])
      expect(() => parseProjectManifest({ ...m, source })).toThrow();
  });
  it('rejects missing assets, duplicate names and damaged asset bytes', async () => {
    const p = fixture();
    await expect(decodeProject(encodeProject({ ...p, assets: [] }))).rejects.toThrow('missing');
    const bytes = encodeProject(p);
    // Change a stored asset without updating its CRC.
    const start = bytes.findIndex((v, i) => v === 1 && bytes[i + 1] === 2 && bytes[i + 2] === 3);
    bytes[start] = 9;
    await expect(decodeProject(bytes)).rejects.toThrow('Damaged');
    const bad = writeZip([{ name: '../outside', data: new Uint8Array([1]) }]);
    await expect(decodeProject(bad)).rejects.toThrow('Invalid archive');
  });
  it('honours cancellation and reports archive progress', async () => {
    const ac = new AbortController(); ac.abort();
    await expect(decodeProject(encodeProject(fixture()), { signal: ac.signal })).rejects.toThrow();
    const steps: number[] = [];
    await decodeProject(encodeProject(fixture()), { onProgress: (n) => steps.push(n) });
    expect(steps).toEqual([1, 2, 3, 4]);
  });
  it('repairs settings and drops unknown lock keys', () => {
    const p = fixture().manifest;
    const repaired = parseProjectManifest({ ...p, params: { ...p.params, brightness: 999, unknown: 'x' }, locks: { keys: ['brightness', 'unknown'], colors: ['red'] } });
    expect(repaired.params.brightness).toBe(100);
    expect(repaired.locks).toEqual({ keys: ['brightness'], colors: [] });
    expect('unknown' in repaired.params).toBe(false);
  });
});
