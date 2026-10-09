/** Keep short timestamped words selectable while suppressing labels that cannot fit. */
export const SUBTITLE_WORD_LABEL_MIN_WIDTH_PX = 22;
export const SUBTITLE_WORD_STRIPE_MIN_WIDTH_PX = 4;

export function isCompactSubtitleWord(widthPixels: number): boolean {
  return !Number.isFinite(widthPixels) || widthPixels < SUBTITLE_WORD_LABEL_MIN_WIDTH_PX;
}

export function subtitleIndexAtTime(words: readonly { start: number; end: number }[], seconds: number) {
  if (!words.length) return -1;
  let low = 0, high = words.length;
  while (low < high) { const middle = (low + high) >>> 1; if (words[middle].start <= seconds) low = middle + 1; else high = middle; }
  const before = Math.max(0, low - 1), after = Math.min(words.length - 1, low);
  return Math.max(0, seconds - words[before].end) <= Math.max(0, words[after].start - seconds) ? before : after;
}

export interface VisibleSubtitleWord {
  /** Index into the original timed-word array. */
  sourceIndex: number;
  /** Screen position within the visible lane; source timestamps remain untouched. */
  leftPixels: number;
  widthPixels: number;
  isCompact: boolean;
}

/**
 * Pick individually timed source words by screen position. Compact source
 * intervals receive a four-pixel visual stripe; their timestamps and the full
 * source-word hit-test map remain unchanged.
 */
export function visibleSubtitleWordLayout(
  words: readonly { start: number; end: number }[],
  windowStart: number,
  windowSpan: number,
  laneWidth: number,
  includeIndexes: readonly number[] = [],
): VisibleSubtitleWord[] {
  if (!words.length || ![windowStart, windowSpan, laneWidth].every(Number.isFinite) || windowSpan <= 0 || laneWidth <= 0) return [];
  const pixelsPerSecond = laneWidth / windowSpan;
  const windowEnd = windowStart + windowSpan;
  const lowerBound = (value: number, field: "start" | "end") => {
    let low = 0, high = words.length;
    while (low < high) { const middle = (low + high) >>> 1; if (words[middle][field] < value) low = middle + 1; else high = middle; }
    return low;
  };
  const first = lowerBound(windowStart, "end");
  const last = Math.min(words.length, lowerBound(windowEnd, "start"));
  if (first >= last) return [];
  const layoutFor = (sourceIndex: number): VisibleSubtitleWord => {
    const word = words[sourceIndex];
    const sourceWidth = Math.max(0, (word.end - word.start) * pixelsPerSecond);
    return { sourceIndex, leftPixels: (word.start - windowStart) * pixelsPerSecond,
      widthPixels: Math.max(SUBTITLE_WORD_STRIPE_MIN_WIDTH_PX, sourceWidth), isCompact: isCompactSubtitleWord(sourceWidth) };
  };
  const visibleBounds = (item: VisibleSubtitleWord) => ({ left: Math.max(0, item.leftPixels), right: Math.min(laneWidth, item.leftPixels + item.widthPixels) });
  const collides = (a: VisibleSubtitleWord, b: VisibleSubtitleWord) => {
    const firstBounds = visibleBounds(a), secondBounds = visibleBounds(b);
    return firstBounds.left < secondBounds.right && firstBounds.right > secondBounds.left;
  };
  const selected: VisibleSubtitleWord[] = [];
  const forcedIndexes = [...new Set(includeIndexes)].filter((index) => index >= first && index < last).slice(-16).reverse();
  for (const index of forcedIndexes) {
    const item = layoutFor(index);
    const bounds = visibleBounds(item);
    if (bounds.left < bounds.right && selected.every((existing) => !collides(item, existing))) selected.push(item);
  }

  const startIndexAtOrAfterPixel = (pixel: number) => Math.max(first, lowerBound(windowStart + (pixel / pixelsPerSecond), "start"));
  const maxItems = Math.ceil(laneWidth / SUBTITLE_WORD_STRIPE_MIN_WIDTH_PX) + forcedIndexes.length;
  let index = first;
  while (index < last && selected.length < maxItems) {
    if (forcedIndexes.includes(index)) { index += 1; continue; }
    const item = layoutFor(index);
    const bounds = visibleBounds(item);
    if (bounds.left >= bounds.right) { index += 1; continue; }
    const collision = selected.find((existing) => collides(item, existing));
    if (collision) {
      const collisionBounds = visibleBounds(collision);
      const next = startIndexAtOrAfterPixel(collisionBounds.right);
      index = next > index ? next : index + 1;
      continue;
    }
    selected.push(item);
    const next = startIndexAtOrAfterPixel(Math.max(0, item.leftPixels + item.widthPixels));
    index = next > index ? next : index + 1;
  }
  return selected.sort((a, b) => a.leftPixels - b.leftPixels || a.sourceIndex - b.sourceIndex);
}
