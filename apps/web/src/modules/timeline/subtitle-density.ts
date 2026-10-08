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

/** Dense overviews keep a bounded set of markers; hit testing uses all source words. */
export function boundedSubtitleIndexes(first: number, last: number, include: number[] = [], sourceLength = last) {
  const indexes = new Set<number>();
  const stride = Math.max(1, Math.ceil((last - first) / 384));
  for (let index = first; index < last; index += stride) indexes.add(index);
  if (last > first) indexes.add(last - 1);
  for (const index of include.slice(-16)) if (index >= 0 && index < sourceLength) indexes.add(index);
  return [...indexes].sort((a, b) => a - b);
}

export function subtitleIndexAtTime(words: readonly { start: number; end: number }[], seconds: number) {
  if (!words.length) return -1;
  let low = 0, high = words.length;
  while (low < high) { const middle = (low + high) >>> 1; if (words[middle].start <= seconds) low = middle + 1; else high = middle; }
  const before = Math.max(0, low - 1), after = Math.min(words.length - 1, low);
  return Math.max(0, seconds - words[before].end) <= Math.max(0, words[after].start - seconds) ? before : after;
}

export function visibleSubtitleIndexes(words: readonly { start: number; end: number }[], start: number, span: number, playhead: number) {
  if (!words.length) return [];
  const first = Math.max(0, subtitleIndexAtTime(words, start) - 1);
  const last = Math.min(words.length, subtitleIndexAtTime(words, start + span) + 2);
  return boundedSubtitleIndexes(first, last, [subtitleIndexAtTime(words, playhead)], words.length);
}
