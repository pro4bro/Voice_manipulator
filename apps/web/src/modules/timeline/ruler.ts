/**
 * Ruler marks that follow the zoom.
 *
 * The ruler used to cut whatever was loaded into eight equal parts, so the
 * numbers on it changed meaning with every file and told you nothing about how
 * long anything was once you zoomed in. Instead the step is chosen from a ladder
 * of round intervals - the smallest one that still leaves marks far enough apart
 * to read - so a mark always stands for a round amount of time, and the unit
 * walks from hours down to milliseconds as the user zooms.
 */

/** Round intervals people actually read a clock in, from 1 ms to 6 hours. */
const STEPS_SECONDS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5,
  1, 2, 5, 10, 15, 30,
  60, 120, 300, 600, 900, 1800,
  3600, 7200, 10800, 21600,
];

/** Below this the labels start colliding at the widths this ruler renders at. */
const MINIMUM_MARK_SPACING_PX = 88;

export interface RulerMark {
  time: number;
  label: string;
  /** Fraction of the whole duration, ready to use as a CSS percentage. */
  position: number;
}

export function rulerStep(duration: number, pixelWidth: number): number {
  const pixelsPerSecond = pixelWidth / Math.max(duration, 0.001);
  const wanted = MINIMUM_MARK_SPACING_PX / Math.max(pixelsPerSecond, 1e-9);
  return STEPS_SECONDS.find((step) => step >= wanted) ?? STEPS_SECONDS[STEPS_SECONDS.length - 1];
}

/**
 * How precisely a mark has to be written for its step to be legible: marks a
 * fifth of a second apart cannot all read "12s".
 */
export function rulerLabel(time: number, step: number): string {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const safe = Math.max(0, time);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe - hours * 3600 - minutes * 60;
  const secondsText = seconds.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secondsText}`;
  if (minutes > 0 || step >= 60) return `${minutes}:${secondsText}`;
  return `${seconds.toFixed(decimals)}s`;
}

export interface RulerView {
  /** Pixels scrolled past, within `pixelWidth`. */
  left: number;
  /** Pixels actually on screen. */
  width: number;
}

/**
 * Marks for the stretch the user can see.
 *
 * Zoomed all the way in the track is over 200,000 px wide, which at a tenth of a
 * second per mark is a few thousand of them. Building the lot put thousands of
 * nodes in the document for the sake of the dozen on screen, and any cap low
 * enough to be safe left the far end of the timeline with no marks at all. So the
 * window decides: only what is visible is built, plus a step either side so
 * nothing pops in at the edge while scrolling.
 */
export function rulerMarks(duration: number, pixelWidth: number, view?: RulerView): RulerMark[] {
  const span = Math.max(duration, 0.001);
  if (!Number.isFinite(span) || pixelWidth <= 0) return [];
  const step = rulerStep(span, pixelWidth);
  const perPixel = span / pixelWidth;
  const from = view && view.width > 0 ? Math.max(0, view.left * perPixel - step) : 0;
  const to = view && view.width > 0 ? Math.min(span, (view.left + view.width) * perPixel + step) : span;
  const marks: RulerMark[] = [];
  for (let index = Math.floor(from / step); index * step <= to; index += 1) {
    const time = index * step;
    if (time < 0) continue;
    marks.push({ time, label: rulerLabel(time, step), position: time / span });
  }
  return marks;
}
