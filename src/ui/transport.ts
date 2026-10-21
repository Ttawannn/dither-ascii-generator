import { isVideo, type Source } from '../source/source';
import { button, el } from './controls';

const fmt = (t: number) => {
  if (!Number.isFinite(t)) return '--:--';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** With tenths, for trim marks: 00:01.7 */
const fmtMark = (t: number) => `${fmt(t)}.${Math.floor((t % 1) * 10)}`;

/** Shortest trimmed range, in seconds. */
const MIN_TRIM = 0.1;

/**
 * Play / scrub / loop / sound controls for video sources; a LIVE badge for the webcam.
 * In / Out marks trim a video file: playback stays inside them and exports render only that range.
 */
export class Transport {
  readonly root: HTMLElement;
  /** Called when the In / Out marks change. */
  onTrimChange: () => void = () => undefined;
  private video: HTMLVideoElement | null = null;
  private trimIn: number | null = null;
  private trimOut: number | null = null;
  private play = button('▶', () => this.toggle(), 'btn small icon');
  private scrub = el('input', { type: 'range', min: '0', max: '1', step: '0.01', 'aria-label': 'Seek' });
  private band = el('div', { class: 'trim-band', hidden: '' });
  private time = el('span', { class: 'time' });
  private inBtn = button('In', () => this.mark('in'), 'btn small');
  private outBtn = button('Out', () => this.mark('out'), 'btn small');
  private clearBtn = button('×', () => this.clearTrim(), 'btn small icon');
  private loop = button('Loop', () => this.toggleLoop(), 'btn small');
  private sound = button('Sound', () => this.toggleSound(), 'btn small');
  private live = el('span', { class: 'live' }, '● LIVE');
  private unbind: (() => void) | null = null;

  constructor() {
    this.inBtn.title = 'Start the trimmed range here ([)';
    this.outBtn.title = 'End the trimmed range here (])';
    this.clearBtn.title = 'Clear the trim';
    this.root = el(
      'div',
      { class: 'transport', hidden: '' },
      this.play,
      this.live,
      el('div', { class: 'scrub' }, this.band, this.scrub),
      this.time,
      this.inBtn,
      this.outBtn,
      this.clearBtn,
      this.loop,
      this.sound,
    );
    this.scrub.addEventListener('input', () => {
      if (this.video) this.video.currentTime = Number(this.scrub.value);
    });
  }

  attach(src: Source | null): void {
    this.unbind?.();
    this.unbind = null;
    this.video = isVideo(src) ? src.element : null;
    this.root.hidden = !this.video;
    const hadTrim = this.trimmed();
    this.trimIn = this.trimOut = null;
    if (hadTrim) this.onTrimChange();
    if (!this.video || !src) return;

    const v = this.video;
    const webcam = src.kind === 'webcam';
    for (const node of [this.scrub.parentElement!, this.time, this.inBtn, this.outBtn, this.loop, this.sound]) {
      node.hidden = webcam;
    }
    this.live.hidden = !webcam;

    const sync = () => this.sync();
    const events = ['play', 'pause', 'timeupdate', 'seeked', 'durationchange', 'volumechange'];
    for (const e of events) v.addEventListener(e, sync);
    // The trimmed range loops (or stops) at Out; timeupdate alone is too coarse for that.
    let frame = 0;
    const watch = () => {
      this.keepInRange();
      frame = v.requestVideoFrameCallback(watch);
    };
    if (!webcam) frame = v.requestVideoFrameCallback(watch);
    this.unbind = () => {
      events.forEach((e) => v.removeEventListener(e, sync));
      v.cancelVideoFrameCallback(frame);
    };
    sync();
  }

  /** True when In or Out is set. */
  trimmed(): boolean {
    return this.trimIn !== null || this.trimOut !== null;
  }

  /** The range to play and export, in seconds (the whole video when not trimmed). */
  range(): { start: number; end: number } {
    const duration = this.video && Number.isFinite(this.video.duration) ? this.video.duration : 0;
    return { start: this.trimIn ?? 0, end: this.trimOut ?? duration };
  }

  toggle(): void {
    const v = this.video;
    if (!v) return;
    if (v.paused) {
      const { start, end } = this.range();
      if (this.trimmed() && (v.currentTime < start || v.currentTime >= end - 0.02)) v.currentTime = start;
      void v.play().catch(() => undefined);
    } else v.pause();
  }

  /** Set In or Out at the current position (keyboard: [ and ]). */
  mark(which: 'in' | 'out'): void {
    const v = this.video;
    if (!v || !Number.isFinite(v.duration)) return;
    const t = v.currentTime;
    if (which === 'in') {
      this.trimIn = t;
      if (this.trimOut !== null && this.trimOut < t + MIN_TRIM) this.trimOut = null;
    } else {
      this.trimOut = Math.max(t, MIN_TRIM);
      if (this.trimIn !== null && this.trimIn > this.trimOut - MIN_TRIM) this.trimIn = null;
    }
    this.sync();
    this.onTrimChange();
  }

  clearTrim(): void {
    if (!this.trimmed()) return;
    this.trimIn = this.trimOut = null;
    this.sync();
    this.onTrimChange();
  }

  private keepInRange(): void {
    const v = this.video;
    if (!v || v.paused || !this.trimmed()) return;
    const { start, end } = this.range();
    if (v.currentTime >= end) {
      if (v.loop) v.currentTime = start;
      else {
        v.pause();
        v.currentTime = end;
      }
    } else if (v.currentTime < start - 0.05) {
      v.currentTime = start;
    }
  }

  private toggleLoop(): void {
    if (this.video) this.video.loop = !this.video.loop;
    this.sync();
  }

  private toggleSound(): void {
    if (this.video) this.video.muted = !this.video.muted;
  }

  private sync(): void {
    const v = this.video;
    if (!v) return;
    this.keepInRange();
    this.play.textContent = v.paused ? '▶' : '❚❚';
    this.play.title = v.paused ? 'Play (K)' : 'Pause (K)';
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    this.scrub.max = `${duration || 1}`;
    this.scrub.value = `${v.currentTime}`;
    this.scrub.style.setProperty('--fill', `${duration ? (v.currentTime / duration) * 100 : 0}%`);
    const { start, end } = this.range();
    this.band.hidden = !this.trimmed() || !duration;
    if (duration) {
      this.band.style.left = `${(start / duration) * 100}%`;
      this.band.style.width = `${((end - start) / duration) * 100}%`;
    }
    // Trimmed, the band shows the range; the time keeps it short and the tooltip has the marks.
    this.time.textContent = this.trimmed() ? fmtMark(v.currentTime) : `${fmt(v.currentTime)} / ${fmt(duration)}`;
    this.time.title = this.trimmed() ? `Trimmed ${fmtMark(start)}–${fmtMark(end)}` : '';
    this.inBtn.classList.toggle('on', this.trimIn !== null);
    this.outBtn.classList.toggle('on', this.trimOut !== null);
    this.clearBtn.hidden = !this.trimmed();
    this.loop.classList.toggle('on', v.loop);
    this.sound.classList.toggle('on', !v.muted);
  }
}
