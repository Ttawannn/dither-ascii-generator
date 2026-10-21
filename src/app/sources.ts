import { isImageFile, loadImageFile, sampleImage } from '../source/image';
import { isVideo, type Source } from '../source/source';
import { isVideoFile, loadVideoFile, openWebcam } from '../source/video';
import { actions, requestRender, rt, store } from './core';
import { syncSwatches } from './dither-view';
import { renderer, viewer } from './gpu';
import { setExportEnabled } from './panel/export';
import { webcamBtn } from './panel/source';
import { watchVideo } from './render';
import { flash, info, stage, transport } from './shell';

const MAX_SOURCE_SIZE = 4096;

export function setSource(src: Source): void {
  rt.current?.dispose();
  rt.current = src;
  renderer.setSource(src.element, src.width, src.height);
  if (store.params.palette === 'image') syncSwatches();
  stage.classList.remove('empty');
  info.name.textContent = src.name;
  setExportEnabled(true);
  webcamBtn.textContent = src.kind === 'webcam' ? 'Stop webcam' : 'Webcam';
  webcamBtn.classList.toggle('active', src.kind === 'webcam');
  transport.attach(src);
  viewer.setImageSize(src.width, src.height);
  if (isVideo(src)) watchVideo(src);
  requestRender();
  actions.refreshThumbs(true);
}

function clearSource(): void {
  rt.current?.dispose();
  rt.current = null;
  transport.attach(null);
  webcamBtn.textContent = 'Webcam';
  webcamBtn.classList.remove('active');
  stage.classList.add('empty');
  info.name.textContent = '—';
  for (const node of [info.size, info.out, info.status, info.zoom]) node.textContent = '';
  setExportEnabled(false);
}

export async function openFile(file: File | undefined): Promise<void> {
  if (!file) return;
  const video = isVideoFile(file);
  if (!video && !isImageFile(file)) {
    flash(`Unsupported file: ${file.type || file.name}`);
    return;
  }
  try {
    setSource(
      video ? await loadVideoFile(file) : await loadImageFile(file, Math.min(renderer.maxTextureSize, MAX_SOURCE_SIZE)),
    );
  } catch (err) {
    console.error(err);
    flash(video ? 'Could not play this video' : 'Could not decode image');
  }
}

export async function openSample(): Promise<void> {
  setSource(await sampleImage());
}
actions.openSample = openSample;

actions.toggleWebcam = async () => {
  if (rt.current?.kind === 'webcam') {
    clearSource();
    return;
  }
  try {
    const cam = await openWebcam();
    store.set('mirror', true); // selfie view feels natural; the toggle stays available
    setSource(cam);
  } catch (err) {
    console.error(err);
    const denied = err instanceof DOMException && err.name === 'NotAllowedError';
    flash(denied ? 'Camera permission denied' : 'No camera available');
  }
};
