import { baseName } from './image';
import type { Source } from './source';

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/**
 * Videos live in the DOM (invisible) because some browsers stop decoding
 * detached or fully hidden elements, which would freeze the preview.
 */
function makeVideo(): HTMLVideoElement {
  const v = document.createElement('video');
  v.className = 'offscreen-video';
  v.muted = true;
  v.playsInline = true;
  v.loop = true;
  v.preload = 'auto';
  document.body.append(v);
  return v;
}

function waitForFrame(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    v.addEventListener('loadeddata', () => resolve(), { once: true });
    v.addEventListener('error', () => reject(new Error('Could not decode video')), { once: true });
  });
}

export async function loadVideoFile(file: File, autoplay = true): Promise<Source> {
  const v = makeVideo();
  const url = URL.createObjectURL(file);
  v.src = url;
  const palette: { frame?: ImageBitmap } = {};
  const dispose = () => {
    palette.frame?.close();
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
    URL.revokeObjectURL(url);
  };
  try {
    await waitForFrame(v);
  } catch (err) {
    dispose();
    throw err;
  }
  try { palette.frame = await createImageBitmap(v); }
  catch (error) { dispose(); throw error; }
  if (autoplay) await v.play().catch(() => undefined);
  return {
    kind: 'video',
    name: baseName(file),
    width: v.videoWidth,
    height: v.videoHeight,
    originalWidth: v.videoWidth,
    originalHeight: v.videoHeight,
    element: v,
    file,
    paletteElement: palette.frame,
    dispose,
  };
}

export async function openWebcam(): Promise<Source> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  const v = makeVideo();
  v.srcObject = stream;
  const dispose = () => {
    for (const t of stream.getTracks()) t.stop();
    v.srcObject = null;
    v.remove();
  };
  try {
    await v.play();
    await waitForFrame(v);
  } catch (err) {
    dispose();
    throw err;
  }
  return {
    kind: 'webcam',
    name: 'webcam',
    width: v.videoWidth,
    height: v.videoHeight,
    originalWidth: v.videoWidth,
    originalHeight: v.videoHeight,
    element: v,
    dispose,
  };
}
