import { MAX_ZOOM, MIN_ZOOM, pinchStep, type Point } from './gesture';

/**
 * Zoom / pan for the preview canvas inside the stage.
 * The canvas is drawn at processed resolution and scaled up with CSS (pixelated),
 * so `zoom` is relative to the *source* image size.
 */
export class Viewer {
  zoom = 1;
  private x = 0;
  private y = 0;
  private w = 0;
  private h = 0;
  private fitted = true;
  onChange: () => void = () => {};

  constructor(
    private stage: HTMLElement,
    private canvas: HTMLCanvasElement,
  ) {
    stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    stage.addEventListener('dblclick', (e) => {
      if (e.target === stage || e.target === canvas) this.fit();
    });
    this.bindPan();
    new ResizeObserver(() => this.fitted && this.fit()).observe(stage);
  }

  /** Display size of the image in CSS pixels at zoom 1. Refits the view. */
  setImageSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.fit();
  }

  fit(): void {
    if (!this.w) return;
    const r = this.stage.getBoundingClientRect();
    const pad = 32;
    this.zoom = Math.max(0.01, Math.min((r.width - pad * 2) / this.w, (r.height - pad * 2) / this.h, 8));
    this.x = (r.width - this.w * this.zoom) / 2;
    this.y = (r.height - this.h * this.zoom) / 2;
    this.fitted = true;
    this.apply();
  }

  /** Set zoom, keeping the stage point (cx, cy) fixed. Defaults to stage centre. */
  setZoom(z: number, cx?: number, cy?: number): void {
    const r = this.stage.getBoundingClientRect();
    cx ??= r.width / 2;
    cy ??= r.height / 2;
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    this.x = cx - ((cx - this.x) * z) / this.zoom;
    this.y = cy - ((cy - this.y) * z) / this.zoom;
    this.zoom = z;
    this.fitted = false;
    this.apply();
  }

  private apply(): void {
    const c = this.canvas;
    c.style.width = `${this.w * this.zoom}px`;
    c.style.height = `${this.h * this.zoom}px`;
    c.style.transform = `translate(${Math.round(this.x)}px, ${Math.round(this.y)}px)`;
    this.onChange();
  }

  private onWheel(e: WheelEvent): void {
    if (!this.w) return;
    e.preventDefault();
    const r = this.stage.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    this.setZoom(this.zoom * factor, e.clientX - r.left, e.clientY - r.top);
  }

  /**
   * One pointer pans; two (touch) pinch-zoom around the point between them and pan together.
   * Lifting one finger of a pinch carries on as a pan with the other.
   */
  private bindPan(): void {
    const pointers = new Map<number, Point>();
    let last: Point[] = [];
    const at = (e: PointerEvent): Point => {
      const r = this.stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const snapshot = () => (last = [...pointers.values()].slice(0, 2));

    this.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.w || (e.target !== this.stage && e.target !== this.canvas)) return;
      pointers.set(e.pointerId, at(e));
      snapshot();
      try {
        this.stage.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointer: no capture, the gesture still works while over the stage.
      }
      this.stage.classList.add('panning');
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, at(e));
      const now = [...pointers.values()].slice(0, 2);
      if (now.length === 2 && last.length === 2) {
        const v = pinchStep({ x: this.x, y: this.y, zoom: this.zoom }, last[0], last[1], now[0], now[1]);
        this.x = v.x;
        this.y = v.y;
        this.zoom = v.zoom;
      } else if (now.length === 1 && last.length === 1) {
        this.x += now[0].x - last[0].x;
        this.y += now[0].y - last[0].y;
      }
      last = now;
      this.fitted = false;
      this.apply();
    });
    const end = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      snapshot();
      if (!pointers.size) this.stage.classList.remove('panning');
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
  }
}
