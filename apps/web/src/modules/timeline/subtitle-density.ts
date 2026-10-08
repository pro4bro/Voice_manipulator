/** Keep short timestamped words selectable while suppressing labels that cannot fit. */
export const SUBTITLE_WORD_LABEL_MIN_WIDTH_PX = 22;
const OVERVIEW_LABEL_MIN_WIDTH_PX = 48;
const OVERVIEW_LABEL_MAX_WIDTH_PX = 96;
const OVERVIEW_LABEL_MAX_SLOTS = 48;
const OVERVIEW_MIN_WORDS_PER_PIXEL = 0.08;

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

export interface ReadableSubtitleSlot {
  /** First original word represented by this inert overview label. */
  sourceIndex: number;
  leftPixels: number;
  widthPixels: number;
  text: string;
}

/**
 * Build a bounded, readable text overview on fixed screen slots. The labels are
 * only a visual summary: source word rectangles and their time mapping are never
 * shifted or stretched, and pointer hit testing still resolves the full source.
 */
export function readableSubtitleSlots(
  words: readonly { text: string; start: number; end: number }[],
  windowStart: number,
  windowSpan: number,
  laneWidth: number,
): ReadableSubtitleSlot[] {
  if (!words.length || ![windowStart, windowSpan, laneWidth].every(Number.isFinite) || windowSpan <= 0 || laneWidth <= 0) return [];
  const windowEnd = windowStart + windowSpan;
  const firstVisible = Math.max(0, subtitleIndexAtTime(words, windowStart));
  const lastVisible = Math.min(words.length, subtitleIndexAtTime(words, windowEnd) + 1);
  const visibleCount = Math.max(0, lastVisible - firstVisible);
  if (!visibleCount) return [];

  // Dense views get fewer, wider labels. Zooming in reduces source words per
  // screen pixel, so more slots appear until native word boxes can show text.
  const density = visibleCount / laneWidth;
  // Below this density, the original timestamp boxes are the useful detail;
  // rendering summary labels there would compete with those native labels.
  if (density < OVERVIEW_MIN_WORDS_PER_PIXEL) return [];
  const slotWidth = Math.max(OVERVIEW_LABEL_MIN_WIDTH_PX,
    Math.min(OVERVIEW_LABEL_MAX_WIDTH_PX, Math.ceil(38 * Math.sqrt(density))));
  const slotCount = Math.min(OVERVIEW_LABEL_MAX_SLOTS, Math.floor(laneWidth / slotWidth));
  if (!slotCount) return [];
  const cellWidth = laneWidth / slotCount;
  const maxCharacters = Math.max(4, Math.floor((cellWidth - 8) / 4.8));
  const slots: ReadableSubtitleSlot[] = [];

  const firstCenterIndex = (seconds: number) => {
    let low = firstVisible;
    let high = lastVisible;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((words[middle].start + words[middle].end) / 2 < seconds) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  for (let slot = 0; slot < slotCount; slot += 1) {
    const start = windowStart + (slot / slotCount) * windowSpan;
    const end = windowStart + ((slot + 1) / slotCount) * windowSpan;
    const first = firstCenterIndex(start);
    const last = Math.max(first, firstCenterIndex(end));
    if (first >= last || first >= lastVisible) continue;
    // Labels only exist in dense overview mode. Stop collecting as soon as the
    // visible snippet can fill its slot so playback rerenders don't scan or
    // concatenate every transcript word in a long cell.
    let text = "";
    for (let index = first; index < last; index += 1) {
      const word = words[index].text.trim();
      if (!word) continue;
      const next = text ? `${text} ${word}` : word;
      if (next.length > maxCharacters) {
        const available = Math.max(1, maxCharacters - (text ? text.length + 1 : 0) - 1);
        text = `${text}${text ? " " : ""}${word.slice(0, available).trimEnd()}…`;
        break;
      }
      text = next;
    }
    if (!text) continue;
    slots.push({ sourceIndex: first, leftPixels: slot * cellWidth, widthPixels: cellWidth, text });
  }
  return slots;
}
