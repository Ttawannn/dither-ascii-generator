/** Bottom-sheet heights and snapping for the settings panel on narrow screens. */

export const SHEET_LEVELS = ['peek', 'half', 'full'] as const;
export type SheetLevel = (typeof SHEET_LEVELS)[number];

/** Pixel height of each level: just the head, half the screen, everything below the page header. */
export function sheetHeights(viewport: number, header: number, peek: number): Record<SheetLevel, number> {
  const full = Math.max(peek, viewport - header);
  return { peek, half: Math.min(full, Math.max(peek, Math.round(viewport * 0.5))), full };
}

/**
 * The level a released drag settles on: the nearest one, or the next one in the direction of a
 * quick flick (`velocity` in px/ms, positive = upwards).
 */
export function snapSheet(height: number, heights: Record<SheetLevel, number>, velocity = 0): SheetLevel {
  const FLICK = 0.5;
  if (Math.abs(velocity) > FLICK) {
    const up = velocity > 0;
    const order = up ? SHEET_LEVELS : [...SHEET_LEVELS].reverse();
    return order.find((l) => (up ? heights[l] > height : heights[l] < height)) ?? order[order.length - 1];
  }
  return SHEET_LEVELS.reduce((best, l) => (Math.abs(heights[l] - height) < Math.abs(heights[best] - height) ? l : best));
}

/** Tapping the handle steps peek → half → full → peek. */
export const nextLevel = (l: SheetLevel): SheetLevel => SHEET_LEVELS[(SHEET_LEVELS.indexOf(l) + 1) % SHEET_LEVELS.length];
