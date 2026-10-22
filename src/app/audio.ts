import { analyseLevels, BAND_IDS, levelAt, levelsFromDb, LEVEL_RATE, type Band } from '../audio-levels';
import { actions, animationPaused, audioInput, clock, seekAnimation, toggleAnimation } from './core';

// The audio that drives audio lanes: the microphone (live only) or an audio file. A file is analysed
// once, so exports read the same levels at the same frame times every run, and its sound can be
// added to WebM / MP4 exports.

type Input =
  | { kind: 'mic'; name: string; ctx: AudioContext; analyser: AnalyserNode; stream: MediaStream }
  | {
      kind: 'file';
      file: File;
      name: string;
      ctx: AudioContext;
      buffer: AudioBuffer;
      levels: Record<Band, Float32Array>;
      node: AudioBufferSourceNode | null;
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
export const audioFile = () => input?.kind === 'file' ? input.file : null;

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

audioInput.level = (band, window) => {
  if (!input) return 0;
  if (input.kind === 'file') {
    // Scrubbing and exports use the same clock as the renderer.
    const t = clock();
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
  void f.ctx.resume().catch(() => undefined);
  f.node?.stop();
  const node = f.ctx.createBufferSource();
  node.buffer = f.buffer;
  node.loop = true;
  node.connect(f.ctx.destination);
  node.start(0, position);
  f.node = node;
  f.pausedAt = null;
}

export async function useAudioFile(file: File): Promise<void> {
  const prepared = await prepareAudioFile(file);
  prepared.commit(true);
}

/** Decode without disturbing the current input, for transactional project loading. */
export async function prepareAudioFile(file: File): Promise<{ commit: (play?: boolean) => void; dispose: () => void }> {
  const ctx = new AudioContext();
  let buffer: AudioBuffer;
  try { buffer = await ctx.decodeAudioData(await file.arrayBuffer()); }
  catch { void ctx.close(); throw new Error('Could not decode audio data'); }
  // Analyse a mono mix.
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
  }
  const f: Extract<Input, { kind: 'file' }> = {
    kind: 'file',
    file,
    name: file.name,
    ctx,
    buffer,
    levels: analyseLevels(mono, buffer.sampleRate),
    node: null,
    pausedAt: 0,
  };
  return {
    commit(play = false) { stopAudio(); input = f; if (play) { seekAnimation(0); toggleAnimation(); } changed(); },
    dispose() { void ctx.close(); },
  };
}

export function toggleAudioPlayback(): void {
  if (input?.kind !== 'file') return;
  if (input.pausedAt === null) {
    seekAnimation(clock());
  } else {
    if (animationPaused()) toggleAnimation();
    else playFrom(input, clock() % input.buffer.duration);
  }
  changed();
}

actions.syncAudioClock = (time, playing) => {
  if (input?.kind !== 'file') return;
  const position = ((time % input.buffer.duration) + input.buffer.duration) % input.buffer.duration;
  const wasPlaying = input.pausedAt === null;
  if (playing) playFrom(input, position);
  else { input.node?.stop(); input.node = null; input.pausedAt = position; }
  if (wasPlaying !== playing) changed();
};

/** Loop the soundtrack from `start` for `seconds`; null for none or the microphone. */
export function exportAudio(seconds: number, start = 0): AudioBuffer | null {
  if (input?.kind !== 'file') return null;
  const src = input.buffer;
  const length = Math.max(1, Math.round(seconds * src.sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  const offset = Math.round(start * src.sampleRate);
  for (let c = 0; c < src.numberOfChannels; c++) {
    const samples = src.getChannelData(c), dest = out.getChannelData(c);
    for (let i = 0; i < length; i++) dest[i] = samples[(offset + i) % src.length];
  }
  return out;
}
