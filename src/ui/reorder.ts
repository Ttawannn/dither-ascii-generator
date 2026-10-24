/** Insertion slot among the remaining cards, including the before/after divider. */
export function insertionIndex(y: number, rects: { top: number; height: number }[]): number {
  const at = rects.findIndex((r) => y < r.top + r.height / 2);
  return at < 0 ? rects.length : at;
}

/** Pointer-only drag: touch/pen hold briefly; mouse can drag immediately. Commit once on release. */
export function reorderGrip(grip: HTMLElement, card: HTMLElement, nodes: () => HTMLElement[], commit: (index: number) => void): void {
  let drag: { id: number; x: number; y: number; lastY: number; active: boolean; slot: number } | null = null;
  let timer = 0;
  let frame = 0;
  const cancel = () => finish(false);
  const clearMarks = () => nodes().forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  const mark = () => {
    if (!drag?.active) return;
    const others = nodes();
    clearMarks();
    drag.slot = insertionIndex(drag.lastY, others.map((n) => n.getBoundingClientRect()));
    if (drag.slot < others.length) others[drag.slot].classList.add('drop-before');
    else others.at(-1)?.classList.add('drop-after');
  };
  const autoScroll = () => {
    if (!drag?.active) return;
    const scroll = card.closest<HTMLElement>('.panel-scroll');
    if (scroll) {
      const r = scroll.getBoundingClientRect();
      const edge = 48;
      const delta = drag.lastY < r.top + edge ? -8 : drag.lastY > r.bottom - edge ? 8 : 0;
      if (delta) { scroll.scrollTop += delta; mark(); }
    }
    frame = requestAnimationFrame(autoScroll);
  };
  const activate = () => {
    if (!drag || !card.isConnected) return;
    drag.active = true;
    card.classList.add('dragging');
    grip.classList.add('grabbing');
    mark();
    autoScroll();
  };
  const finish = (apply: boolean) => {
    const d = drag;
    if (!d) return;
    drag = null;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    window.removeEventListener('blur', cancel);
    card.classList.remove('dragging');
    grip.classList.remove('grabbing');
    clearMarks();
    if (grip.hasPointerCapture(d.id)) grip.releasePointerCapture(d.id);
    if (apply && d.active) commit(d.slot);
  };
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastY: e.clientY, active: false, slot: 0 };
    grip.setPointerCapture(e.pointerId);
    window.addEventListener('blur', cancel);
    if (e.pointerType !== 'mouse') timer = window.setTimeout(activate, 250);
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag.lastY = e.clientY;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
      if (e.pointerType === 'mouse') activate();
      else { finish(false); return; }
    }
    mark();
  });
  grip.addEventListener('pointerup', (e) => { if (e.pointerId === drag?.id) { drag.lastY = e.clientY; mark(); finish(true); } });
  grip.addEventListener('pointercancel', () => finish(false));
  grip.addEventListener('lostpointercapture', () => finish(false));
}
