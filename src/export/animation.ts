import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
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
}

export class ExportCancelled extends Error {}

const MAX_VIDEO_SIDE = 4096;
const PREFERRED: Record<'webm' | 'mp4', VideoCodec[]> = {
  webm: ['vp9', 'av1', 'vp8'],
  mp4: ['avc', 'hevc', 'av1', 'vp9'],
};

/** Upscales each frame with nearest-neighbour into a 2D canvas the encoders can read. */
function frameCanvas(source: HTMLCanvasElement, scale: number, even: boolean) {
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
  const copy = () => g.drawImage(source, 0, 0, source.width * scale, source.height * scale);
  return { canvas, g, copy };
}

export async function exportAnimation(job: ExportJob): Promise<Blob> {
  const { frames } = job;
  await frames.render(0); // size is known once the first frame is drawn
  return job.format === 'gif' ? encodeGif(job) : encodeVideo(job, job.format);
}

async function encodeGif(job: ExportJob): Promise<Blob> {
  const { frames } = job;
  const { canvas, g, copy } = frameCanvas(job.source, job.scale, false);
  const gif = GIFEncoder();
  const delay = Math.round(1000 / frames.fps);

  for (let i = 0; i < frames.count; i++) {
    if (job.isCancelled()) throw new ExportCancelled();
    if (i > 0) await frames.render(i);
    copy();
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette, delay });
    job.onProgress(i + 1, frames.count);
  }
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}

async function encodeVideo(job: ExportJob, kind: 'webm' | 'mp4'): Promise<Blob> {
  const { frames } = job;
  const { canvas, copy } = frameCanvas(job.source, job.scale, true);
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
  const video = new CanvasSource(canvas, { codec, bitrate });
  output.addVideoTrack(video, { frameRate: frames.fps });
  await output.start();

  try {
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
