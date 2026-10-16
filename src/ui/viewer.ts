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
    z = Math.min(64, Math.max(0.02, z));
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

  private bindPan(): void {
    let start: { px: number; py: number; x: number; y: number } | null = null;
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.w || (e.target !== this.stage && e.target !== this.canvas)) return;
      start = { px: e.clientX, py: e.clientY, x: this.x, y: this.y };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.classList.add('panning');
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!start) return;
      this.x = start.x + e.clientX - start.px;
      this.y = start.y + e.clientY - start.py;
      this.fitted = false;
      this.apply();
    });
    const end = () => {
      start = null;
      this.stage.classList.remove('panning');
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
  }
}
