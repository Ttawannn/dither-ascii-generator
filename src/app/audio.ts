import { analyseLevels, BAND_IDS, levelAt, levelsFromDb, LEVEL_RATE, type Band } from '../audio-levels';
import { audioInput, rt } from './core';

// The audio that drives audio lanes: the microphone (live only) or an audio file. A file is analysed
// once, so exports read the same levels at the same frame times every run, and its sound can be
// added to WebM / MP4 exports.

type Input =
  | { kind: 'mic'; name: string; ctx: AudioContext; analyser: AnalyserNode; stream: MediaStream }
  | {
      kind: 'file';
      name: string;
      ctx: AudioContext;
      buffer: AudioBuffer;
      levels: Record<Band, Float32Array>;
      node: AudioBufferSourceNode | null;
      /** ctx.currentTime when playback (re)started, minus the position it started from. */
      startedAt: number;
      /** Position in seconds while paused. */
      pausedAt: number | null;
    };

let input: Input | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

/** Called when the input starts, stops, or pauses. */
export function onAudioChange(fn: () => void): void {
  listeners.add(fn);
}

export const audioName = () => input?.name ?? null;
export const audioKind = () => input?.kind ?? null;
export const audioPlaying = () => input?.kind === 'file' && input.pausedAt === null;

// Live microphone levels, kept briefly so a lane can average over its smoothing window.
const MIC_HISTORY = 2 * LEVEL_RATE;
const micHistory = Object.fromEntries(BAND_IDS.map((b) => [b, new Float32Array(MIC_HISTORY)])) as Record<Band, Float32Array>;
let micFilled = 0;
let micLastSample = 0;
let micDb: Float32Array<ArrayBuffer> | null = null;

function sampleMic(analyser: AnalyserNode, ctx: AudioContext): void {
  const now = performance.now();
  if (now - micLastSample < 1000 / LEVEL_RATE) return;
  micLastSample = now;
  micDb ??= new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(micDb);
  const levels = levelsFromDb(micDb, ctx.sampleRate, analyser.fftSize);
  for (const b of BAND_IDS) {
    micHistory[b].copyWithin(0, 1);
    micHistory[b][MIC_HISTORY - 1] = levels[b];
  }
  micFilled = Math.min(MIC_HISTORY, micFilled + 1);
}

/** Current position in an audio file, in seconds (wrapping, since it loops). */
function filePosition(f: Extract<Input, { kind: 'file' }>): number {
  const t = f.pausedAt ?? f.ctx.currentTime - f.startedAt;
  return ((t % f.buffer.duration) + f.buffer.duration) % f.buffer.duration;
}

audioInput.level = (band, window) => {
  if (!input) return 0;
  if (input.kind === 'file') {
    // Exports step the clock frame by frame; live playback follows the file's own position.
    const t = rt.clockOverride ?? filePosition(input);
    return levelAt(input.levels[band], t % input.buffer.duration, window);
  }
  sampleMic(input.analyser, input.ctx);
  const series = micHistory[band].subarray(MIC_HISTORY - Math.max(1, micFilled));
  return levelAt(series, (series.length - 1) / LEVEL_RATE, window);
};

export function stopAudio(): void {
  if (!input) return;
  if (input.kind === 'mic') input.stream.getTracks().forEach((t) => t.stop());
  else input.node?.stop();
  void input.ctx.close();
  input = null;
  micFilled = 0;
  changed();
}

export async function useMicrophone(): Promise<void> {
  stopAudio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  ctx.createMediaStreamSource(stream).connect(analyser);
  input = { kind: 'mic', name: 'Microphone', ctx, analyser, stream };
  changed();
}

function playFrom(f: Extract<Input, { kind: 'file' }>, position: number): void {
  f.node?.stop();
  const node = f.ctx.createBufferSource();
  node.buffer = f.buffer;
  node.loop = true;
  node.connect(f.ctx.destination);
  node.start(0, position);
  f.node = node;
  f.startedAt = f.ctx.currentTime - position;
  f.pausedAt = null;
}

export async function useAudioFile(file: File): Promise<void> {
  stopAudio();
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  // Analyse a mono mix.
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
  }
  const f: Extract<Input, { kind: 'file' }> = {
    kind: 'file',
    name: file.name,
    ctx,
    buffer,
    levels: analyseLevels(mono, buffer.sampleRate),
    node: null,
    startedAt: 0,
    pausedAt: 0,
  };
  input = f;
  playFrom(f, 0);
  changed();
}

export function toggleAudioPlayback(): void {
  if (input?.kind !== 'file') return;
  if (input.pausedAt === null) {
    input.pausedAt = filePosition(input);
    input.node?.stop();
    input.node = null;
  } else {
    playFrom(input, input.pausedAt);
  }
  changed();
}

/** The first `seconds` of the audio file, for adding sound to a video export; null for none or the mic. */
export function exportAudio(seconds: number): AudioBuffer | null {
  if (input?.kind !== 'file') return null;
  const src = input.buffer;
  const length = Math.min(src.length, Math.round(seconds * src.sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let c = 0; c < src.numberOfChannels; c++) out.copyToChannel(src.getChannelData(c).subarray(0, length), c);
  return out;
}
