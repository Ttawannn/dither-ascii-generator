import { isVideo, type Source } from '../source/source';
import { button, el } from './controls';

const fmt = (t: number) => {
  if (!Number.isFinite(t)) return '--:--';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** Play / scrub / loop / sound controls for video sources; a LIVE badge for the webcam. */
export class Transport {
  readonly root: HTMLElement;
  private video: HTMLVideoElement | null = null;
  private play = button('▶', () => this.toggle(), 'btn small icon');
  private scrub = el('input', { type: 'range', min: '0', max: '1', step: '0.01', 'aria-label': 'Seek' });
  private time = el('span', { class: 'time' });
  private loop = button('Loop', () => this.toggleLoop(), 'btn small');
  private sound = button('Sound', () => this.toggleSound(), 'btn small');
  private live = el('span', { class: 'live' }, '● LIVE');
  private unbind: (() => void) | null = null;

  constructor() {
    this.root = el('div', { class: 'transport', hidden: '' }, this.play, this.live, this.scrub, this.time, this.loop, this.sound);
    this.scrub.addEventListener('input', () => {
      if (this.video) this.video.currentTime = Number(this.scrub.value);
    });
  }

  attach(src: Source | null): void {
    this.unbind?.();
    this.unbind = null;
    this.video = isVideo(src) ? src.element : null;
    this.root.hidden = !this.video;
    if (!this.video || !src) return;

    const v = this.video;
    const webcam = src.kind === 'webcam';
    for (const node of [this.scrub, this.time, this.loop, this.sound]) node.hidden = webcam;
    this.live.hidden = !webcam;

    const sync = () => this.sync();
    const events = ['play', 'pause', 'timeupdate', 'seeked', 'durationchange', 'volumechange'];
    for (const e of events) v.addEventListener(e, sync);
    this.unbind = () => events.forEach((e) => v.removeEventListener(e, sync));
    sync();
  }

  toggle(): void {
    const v = this.video;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
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
    this.play.textContent = v.paused ? '▶' : '❚❚';
    this.play.title = v.paused ? 'Play (K)' : 'Pause (K)';
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    this.scrub.max = `${duration || 1}`;
    this.scrub.value = `${v.currentTime}`;
    this.scrub.style.setProperty('--fill', `${duration ? (v.currentTime / duration) * 100 : 0}%`);
    this.time.textContent = `${fmt(v.currentTime)} / ${fmt(duration)}`;
    this.loop.classList.toggle('on', v.loop);
    this.sound.classList.toggle('on', !v.muted);
  }
}
