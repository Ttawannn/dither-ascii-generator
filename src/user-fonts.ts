import { fontNameFromFile } from './ascii/charsets';

/**
 * Fonts the user adds for ASCII mode. The files live in this browser's IndexedDB (localStorage is
 * too small) and are registered with the FontFace API under their own family name. Presets and
 * share links only carry the name, so on another browser such a font falls back to the default.
 */

interface StoredFont {
  name: string;
  data: ArrayBuffer;
}

const DB_NAME = 'dag';
const STORE = 'fonts';
const MAX_BYTES = 20 * 1024 * 1024;

let names: string[] = [];
const listeners = new Set<() => void>();
const faces = new Map<string, FontFace>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function register(name: string, data: ArrayBuffer): Promise<void> {
  const face = new FontFace(name, data);
  await face.load(); // throws on a file that isn't a usable font
  const old = faces.get(name);
  if (old) document.fonts.delete(old);
  document.fonts.add(face);
  faces.set(name, face);
}

function changed(): void {
  for (const fn of listeners) fn();
}

/** Names of the fonts added in this browser, in the order added. */
export const userFonts = (): string[] => names;

/** Call `fn` whenever the list of user fonts (or a font itself) changes. */
export function onUserFontsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Load and register every stored font. Resolves with their names (empty when storage is unavailable). */
export async function loadUserFonts(): Promise<string[]> {
  try {
    const stored = await run<StoredFont[]>('readonly', (s) => s.getAll() as IDBRequest<StoredFont[]>);
    const ok: string[] = [];
    for (const f of stored) {
      try {
        await register(f.name, f.data);
        ok.push(f.name);
      } catch {
        // A stored file that no longer loads is skipped.
      }
    }
    names = ok;
    changed();
  } catch {
    names = [];
  }
  return names;
}

/** Read a font file, check that it loads, keep it, and register it. Resolves with its name. */
export async function addUserFont(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('That font file is larger than 20 MB');
  const name = fontNameFromFile(file.name);
  if (!name) throw new Error('That file name can’t be used as a font name');
  const data = await file.arrayBuffer();
  try {
    await register(name, data);
  } catch {
    throw new Error(`${file.name} isn’t a font this browser can read`);
  }
  try {
    await run('readwrite', (s) => s.put({ name, data } satisfies StoredFont));
  } catch {
    // Storage blocked: the font still works until the page is closed.
  }
  names = [...names.filter((n) => n !== name), name];
  changed();
  return name;
}

export async function removeUserFont(name: string): Promise<void> {
  const face = faces.get(name);
  if (face) document.fonts.delete(face);
  faces.delete(name);
  try {
    await run('readwrite', (s) => s.delete(name));
  } catch {
    // Nothing stored.
  }
  names = names.filter((n) => n !== name);
  changed();
}
