import { DEFAULTS, sanitize, type Params } from './state';
import { readZip, writeZip, type ZipEntry, type ZipOptions } from './zip';

export const PROJECT_LIMIT = 128 * 1024 * 1024;
export interface ProjectAsset { path: string; name: string; type: string }
export interface ProjectManifest {
  format: 'dither-ascii-project';
  version: 1;
  appVersion: string;
  params: Params;
  source: ProjectAsset & { kind: 'image' | 'video'; time: number; trim: { start: number; end: number } | null };
  audio?: ProjectAsset;
  fonts: (ProjectAsset & { family: string })[];
  locks: { keys: string[]; colors: string[] };
  time: number;
}
export interface Project { manifest: ProjectManifest; assets: ZipEntry[] }
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid project manifest');
  return v as Record<string, unknown>;
};
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const asset = (v: unknown): ProjectAsset => {
  const a = record(v);
  if (typeof a.path !== 'string' || !/^assets\/[a-zA-Z0-9_.-]+$/.test(a.path) ||
      typeof a.name !== 'string' || a.name.length > 200 || typeof a.type !== 'string' || a.type.length > 100)
    throw new Error('Invalid project asset');
  return { path: a.path, name: a.name, type: a.type };
};

export function parseProjectManifest(value: unknown): ProjectManifest {
  const m = record(value);
  if (m.format !== 'dither-ascii-project') throw new Error('This is not a project file');
  if (m.version !== 1) throw new Error('This project version is not supported');
  const source = record(m.source);
  record(m.params);
  if (!['image', 'video'].includes(String(source.kind)) || !finite(source.time) || !finite(m.time))
    throw new Error('Invalid project timing');
  let trim: { start: number; end: number } | null = null;
  if (source.trim != null) {
    const t = record(source.trim);
    if (!finite(t.start) || !finite(t.end) || Number(t.end) <= Number(t.start)) throw new Error('Invalid project trim');
    trim = { start: Number(t.start), end: Number(t.end) };
  }
  if (!Array.isArray(m.fonts) || m.fonts.length > 2) throw new Error('Invalid project fonts');
  const fonts = m.fonts.map((f) => {
    const a = record(f);
    if (typeof a.family !== 'string' || !a.family || a.family.length > 100) throw new Error('Invalid font family');
    return { ...asset(a), family: a.family };
  });
  const locks = m.locks && typeof m.locks === 'object' ? m.locks as Record<string, unknown> : {};
  return {
    format: 'dither-ascii-project', version: 1, appVersion: String(m.appVersion ?? ''),
    params: { ...DEFAULTS, ...sanitize(m.params) },
    source: { ...asset(source), kind: source.kind as 'image' | 'video', time: Number(source.time), trim },
    ...(m.audio ? { audio: asset(m.audio) } : {}), fonts,
    locks: {
      keys: Array.isArray(locks.keys) ? locks.keys.filter((k): k is string => typeof k === 'string' && k in DEFAULTS) : [],
      colors: Array.isArray(locks.colors) ? locks.colors.filter((c): c is string => typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c)).slice(0, 32) : [],
    },
    time: Number(m.time),
  };
}

export function encodeProject(project: Project): Uint8Array {
  const manifest = parseProjectManifest(project.manifest);
  const entries = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) }, ...project.assets];
  if (entries.reduce((n, e) => n + e.data.length, 0) > PROJECT_LIMIT) throw new Error('Project exceeds 128 MB');
  return writeZip(entries);
}

export async function decodeProject(bytes: Uint8Array, options: ZipOptions = {}): Promise<Project> {
  if (bytes.length > PROJECT_LIMIT) throw new Error('Project exceeds 128 MB');
  const entries = await readZip(bytes, { ...options, strict: true, maxBytes: PROJECT_LIMIT, maxEntries: 16 });
  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  if (!manifestEntry || manifestEntry.data.length > 2 * 1024 * 1024) throw new Error('Missing or oversized project manifest');
  const manifest = parseProjectManifest(JSON.parse(new TextDecoder().decode(manifestEntry.data)));
  const assets = entries.filter((e) => e.name !== 'manifest.json');
  for (const ref of [manifest.source, manifest.audio, ...manifest.fonts])
    if (ref && !assets.some((a) => a.name === ref.path)) throw new Error('A project asset is missing');
  return { manifest, assets };
}
