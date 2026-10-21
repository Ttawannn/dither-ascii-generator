import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';

export type AnimationFormat = 'gif' | 'webm' | 'mp4';

export interface FrameSequence {
  count: number;
  fps: number;
  /** Render frame `i`; when it resolves, the source canvas shows that frame. */
  render(i: number): Promise<void>;
}

export interface ExportJob {
  format: AnimationFormat;
  source: HTMLCanvasElement;
  scale: number;
  frames: FrameSequence;
  onProgress: (done: number, total: number) => void;
  isCancelled: () => boolean;
  /** The canvas has a transparent background that should be kept where the format allows. */
  transparent: boolean;
  /** Colour to fill transparent areas with when the format cannot store alpha. */
  matte: string;
  /** Tells the user about a fallback (e.g. transparency dropped). */
  onNote: (message: string) => void;
  /** Sound to add to WebM / MP4 (from time 0); GIF has none. */
  audio?: AudioBuffer | null;
}

export class ExportCancelled extends Error {}

const MAX_VIDEO_SIDE = 4096;
const PREFERRED: Record<'webm' | 'mp4', VideoCodec[]> = {
  webm: ['vp9', 'av1', 'vp8'],
  mp4: ['avc', 'hevc', 'av1', 'vp9'],
};
const PREFERRED_AUDIO: Record<'webm' | 'mp4', AudioCodec[]> = {
  webm: ['opus', 'vorbis'],
  mp4: ['aac', 'opus'],
};

/**
 * Upscales each frame with nearest-neighbour into a 2D canvas the encoders can read.
 * With `matte`, transparent areas are filled with that colour; otherwise they stay transparent.
 */
function frameCanvas(source: HTMLCanvasElement, scale: number, even: boolean, matte: string | null) {
  let w = source.width * scale;
  let h = source.height * scale;
  if (even) {
    // Most video codecs need even dimensions; dropping one pixel row/column is invisible.
    w -= w & 1;
    h -= h & 1;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const g = canvas.getContext('2d', { willReadFrequently: !even })!;
  g.imageSmoothingEnabled = false;
  const copy = () => {
    if (matte) {
      g.fillStyle = matte;
      g.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      g.clearRect(0, 0, canvas.width, canvas.height);
    }
    g.drawImage(source, 0, 0, source.width * scale, source.height * scale);
  };
  return { canvas, g, copy };
}

export async function exportAnimation(job: ExportJob): Promise<Blob> {
  const { frames } = job;
  await frames.render(0); // size is known once the first frame is drawn
  if (job.format === 'gif') return encodeGif(job);
  if (job.format === 'webm' && job.transparent) {
    try {
      return await encodeVideo(job, 'webm', true);
    } catch (err) {
      if (err instanceof ExportCancelled) throw err;
      console.warn('Transparent WebM failed, retrying opaque', err);
      job.onNote('This browser can’t encode transparent WebM — saved with the background colour');
      await frames.render(0);
      return encodeVideo(job, 'webm', false);
    }
  }
  return encodeVideo(job, job.format, false);
}

async function encodeGif(job: ExportJob): Promise<Blob> {
  const { frames } = job;
  const { canvas, g, copy } = frameCanvas(job.source, job.scale, false, null);
  const gif = GIFEncoder();
  const delay = Math.round(1000 / frames.fps);

  for (let i = 0; i < frames.count; i++) {
    if (job.isCancelled()) throw new ExportCancelled();
    if (i > 0) await frames.render(i);
    copy();
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
    if (job.transparent) {
      // GIF transparency is on/off per pixel: quantize with 1-bit alpha and mark the clear entry.
      const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(data, palette, 'rgba4444');
      const clear = palette.findIndex((c) => c[3] === 0);
      gif.writeFrame(index, canvas.width, canvas.height, {
        palette,
        delay,
        transparent: clear >= 0,
        transparentIndex: Math.max(0, clear),
        dispose: 2, // clear each frame, or earlier frames would show through the transparent pixels
      });
    } else {
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette, delay });
    }
    job.onProgress(i + 1, frames.count);
  }
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}

async function encodeVideo(job: ExportJob, kind: 'webm' | 'mp4', keepAlpha: boolean): Promise<Blob> {
  const { frames } = job;
  const { canvas, copy } = frameCanvas(job.source, job.scale, true, keepAlpha ? null : job.matte);
  const { width, height } = canvas;
  if (width > MAX_VIDEO_SIDE || height > MAX_VIDEO_SIDE) {
    throw new Error(`${width}×${height} is too large for video — lower the scale`);
  }

  const format = kind === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
  // Dithered frames are mostly high-frequency noise, so they need far more bits than camera footage.
  const bitrate = Math.min(40e6, Math.max(2e6, width * height * frames.fps * 0.5));
  const supported = format.getSupportedVideoCodecs();
  const codec = await getFirstEncodableVideoCodec(
    PREFERRED[kind].filter((c) => supported.includes(c)),
    { width, height, bitrate },
  );
  if (!codec) throw new Error(`This browser cannot encode ${kind.toUpperCase()} (needs WebCodecs)`);

  const output = new Output({ format, target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec, bitrate, alpha: keepAlpha ? 'keep' : 'discard' });
  output.addVideoTrack(video, { frameRate: frames.fps });

  let audio: AudioBufferSource | null = null;
  if (job.audio) {
    const supportedAudio = format.getSupportedAudioCodecs();
    const audioCodec = await getFirstEncodableAudioCodec(
      PREFERRED_AUDIO[kind].filter((c) => supportedAudio.includes(c)),
      { numberOfChannels: job.audio.numberOfChannels, sampleRate: job.audio.sampleRate, quality: QUALITY_HIGH },
    );
    if (audioCodec) {
      audio = new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH });
      output.addAudioTrack(audio);
    } else {
      job.onNote(`This browser can’t encode audio for ${kind.toUpperCase()} — saved without sound`);
    }
  }
  await output.start();

  try {
    if (audio && job.audio) {
      await audio.add(job.audio);
      audio.close();
    }
    for (let i = 0; i < frames.count; i++) {
      if (job.isCancelled()) throw new ExportCancelled();
      if (i > 0) await frames.render(i);
      copy();
      await video.add(i / frames.fps, 1 / frames.fps);
      job.onProgress(i + 1, frames.count);
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => undefined);
    throw err;
  }
  const buffer = (output.target as BufferTarget).buffer!;
  return new Blob([buffer], { type: format.mimeType });
}
