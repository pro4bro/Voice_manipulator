/** Keep short timestamped words selectable while suppressing labels that cannot fit. */
export const SUBTITLE_WORD_LABEL_MIN_WIDTH_PX = 22;

export function subtitleWordWidthPixels(
  start: number,
  end: number,
  windowStart: number,
  windowSpan: number,
  laneWidth: number,
): number {
  if (![start, end, windowStart, windowSpan, laneWidth].every(Number.isFinite) || windowSpan <= 0 || laneWidth <= 0) return 0;
  const visibleStart = Math.max(start, windowStart);
  const visibleEnd = Math.min(end, windowStart + windowSpan);
  return Math.max(0, ((visibleEnd - visibleStart) / windowSpan) * laneWidth);
}

export function isCompactSubtitleWord(widthPixels: number): boolean {
  return !Number.isFinite(widthPixels) || widthPixels < SUBTITLE_WORD_LABEL_MIN_WIDTH_PX;
}
