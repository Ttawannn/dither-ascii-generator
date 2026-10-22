import { isUserFontId, userFontName } from '../ascii/charsets';
import { download } from '../export/png';
import { decodeProject, encodeProject, PROJECT_LIMIT, type ProjectAsset, type ProjectManifest } from '../project';
import { loadImageFile } from '../source/image';
import { loadVideoFile } from '../source/video';
import type { Source } from '../source/source';
import { layerParams, readLayer } from '../state';
import { prepareProjectFont, userFontData } from '../user-fonts';
import type { ZipEntry } from '../zip';
import { audioFile, prepareAudioFile, stopAudio } from './audio';
import { actions, clock, requestRender, rt, seekAnimation, store } from './core';
import { renderer } from './gpu';
import { getLocks, setLocks } from './locks';
import { flash, transport } from './shell';
import { setSource } from './sources';

let controller: AbortController | null = null;
actions.cancelProject = () => controller?.abort();
const yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0));
async function operation(work: (signal: AbortSignal) => Promise<void>): Promise<void> {
  if (controller || rt.exporting) return;
  controller = new AbortController();
  try { await work(controller.signal); actions.projectStatus('Project ready', false); }
  catch (err) {
    const message = controller.signal.aborted ? 'Cancelled' : (err instanceof Error ? err.message : 'Could not open project');
    actions.projectStatus(message, false); flash(message);
  } finally { controller = null; }
}

actions.saveProject = () => operation(async (signal) => {
  const src = rt.current;
  if (!src) throw new Error('Load a source first');
  actions.projectStatus('Saving project…', true);
  const params = structuredClone(store.params);
  const savedAudio = audioFile(), savedLocks = getLocks();
  const savedTrim = src.kind === 'video' && transport.trimmed() ? transport.range() : null;
  const savedTime = clock();
  const savedSourceTime = src.kind === 'video' ? (src.element as HTMLVideoElement).currentTime : 0;
  const assets: ZipEntry[] = [];
  let bytes = 0;
  const add = async (file: Blob, path: string, name: string): Promise<ProjectAsset> => {
    bytes += file.size;
    if (bytes > PROJECT_LIMIT) throw new Error('Project exceeds 128 MB');
    signal.throwIfAborted();
    assets.push({ name: path, data: new Uint8Array(await file.arrayBuffer()) });
    await yieldTask(); signal.throwIfAborted();
    return { path, name, type: file.type };
  };
  let sourceFile: Blob = src.file ?? new Blob();
  if (!src.file) {
    const canvas = new OffscreenCanvas(src.width, src.height);
    canvas.getContext('2d')!.drawImage(src.element, 0, 0);
    sourceFile = await canvas.convertToBlob({ type: 'image/png' });
  }
  const source = await add(sourceFile, 'assets/source', src.file?.name ?? `${src.name}.png`);
  const video = src.kind === 'video' ? src.element as HTMLVideoElement : null;
  const audio = savedAudio;
  const fonts: ProjectManifest['fonts'] = [];
  const storedLayer = readLayer(params);
  for (const p of [params, storedLayer ? layerParams(params, storedLayer) : null]) {
    if (!p || !isUserFontId(p.asciiFont)) continue;
    const family = userFontName(p.asciiFont);
    if (fonts.some((f) => f.family === family)) continue;
    const data = userFontData(family);
    if (!data) throw new Error(`Missing font: ${family}`);
    fonts.push({ ...await add(new Blob([data]), `assets/font${fonts.length}`, `${family}.font`), family });
  }
  const manifest: ProjectManifest = {
    format: 'dither-ascii-project', version: 1, appVersion: '0.1.0', params,
    source: { ...source, kind: video ? 'video' : 'image', time: savedSourceTime, trim: savedTrim },
    ...(audio ? { audio: await add(audio, 'assets/audio', audio.name) } : {}),
    fonts, locks: savedLocks, time: savedTime,
  };
  signal.throwIfAborted();
  const packed = encodeProject({ manifest, assets });
  await yieldTask(); signal.throwIfAborted();
  download(new Blob([packed.slice().buffer]), `${src.name}.dither-project`);
});

actions.openProject = (file) => operation(async (signal) => {
  const previousSource = rt.current, previousParams = store.params, previousAudio = audioFile();
  if (file.size > PROJECT_LIMIT) throw new Error('Project exceeds 128 MB');
  actions.projectStatus('Opening project…', true);
  const project = await decodeProject(new Uint8Array(await file.arrayBuffer()), {
    signal, onProgress: (n, total) => actions.projectStatus(`Opening project… ${Math.round(n / total * 100)}%`, true),
  });
  signal.throwIfAborted();
  const { manifest: m } = project;
  const asFile = (a: ProjectAsset) => new File([project.assets.find((e) => e.name === a.path)!.data.slice().buffer], a.name, { type: a.type });
  let source: Source | null = null;
  let audio: Awaited<ReturnType<typeof prepareAudioFile>> | null = null;
  try {
    source = m.source.kind === 'video' ? await loadVideoFile(asFile(m.source), false)
      : await loadImageFile(asFile(m.source), Math.min(4096, renderer.maxTextureSize));
    if (source.kind === 'video') {
      const v = source.element as HTMLVideoElement;
      if (m.source.time > v.duration || m.source.trim && m.source.trim.end > v.duration + 0.01) throw new Error('Invalid project timing');
      if (m.source.time > 0) await new Promise<void>((resolve, reject) => {
        v.addEventListener('seeked', () => resolve(), { once: true });
        v.addEventListener('error', () => reject(new Error('Could not decode video')), { once: true });
        v.currentTime = m.source.time;
      });
    }
    const fonts = await Promise.all(m.fonts.map((f) => prepareProjectFont(f.family, project.assets.find((e) => e.name === f.path)!.data.slice().buffer)));
    const layer = readLayer(m.params);
    for (const id of [m.params.asciiFont, layer?.params.asciiFont]) {
      if (typeof id === 'string' && isUserFontId(id) && !m.fonts.some((f) => f.family === userFontName(id))) throw new Error('A project font is missing');
    }
    if (m.audio) audio = await prepareAudioFile(asFile(m.audio));
    signal.throwIfAborted();
    if (rt.current !== previousSource || store.params !== previousParams || audioFile() !== previousAudio)
      throw new Error('Work changed — open the project again');
    // Every asset is decoded before replacing any part of the current work.
    fonts.forEach((commit) => commit());
    if (audio) audio.commit(); else stopAudio();
    setSource(source); source = null;
    store.apply(m.params);
    setLocks(m.locks);
    transport.restoreTrim(m.source.trim);
    seekAnimation(m.source.kind === 'video' ? m.source.time : m.time);
    actions.resetHistory();
    requestRender();
  } catch (error) { source?.dispose(); audio?.dispose(); throw error; }
});
