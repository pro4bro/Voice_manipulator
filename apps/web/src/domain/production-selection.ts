import type { StudioWord } from "./types";
import type { SelectionModifiers, WordSelection } from "./word-selection";

export type SelectionRange = NonNullable<WordSelection["ranges"]>[number];
type Timed = Pick<StudioWord, "start" | "end">;

export function rangeReadoutBounds(range: SelectionRange, duration: number, canvasWidth: number, viewportLeft: number, viewportWidth: number) {
  const scale = canvasWidth / Math.max(duration, .001);
  const start = range.start * scale, end = range.end * scale;
  const width = Math.min(Math.max(0, viewportWidth - 8), Math.max(230, end - start));
  const left = Math.max(viewportLeft + 4, Math.min(start, viewportLeft + viewportWidth - width - 4));
  return { left: left - start, width, visible: end >= viewportLeft && start <= viewportLeft + viewportWidth };
}

function normalize(ranges: SelectionRange[]): SelectionRange[] {
  const ordered = ranges.filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start)
    .map((range) => ({ ...range })).sort((a, b) => a.start - b.start || a.end - b.end);
  const result: SelectionRange[] = [];
  for (const range of ordered) {
    const last = result.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else result.push(range);
  }
  return result;
}

export function productionRanges(selection: WordSelection, words: Timed[]): SelectionRange[] {
  if (selection.ranges) return normalize(selection.ranges);
  const result: SelectionRange[] = [];
  let previous = -2;
  for (const index of [...new Set(selection.indexes)].sort((a, b) => a - b)) {
    const word = words[index];
    if (!word) continue;
    if (index === previous + 1 && result.length) result[result.length - 1].end = word.end;
    else result.push({ id: `words-${index}`, start: word.start, end: word.end });
    previous = index;
  }
  return normalize(result);
}

export function hasMultipleSelectionRanges(selection: WordSelection): boolean {
  if (selection.ranges) return selection.ranges.length > 1 || (!selection.ranges.length && (selection.rowIds?.length ?? 0) > 1);
  if ((selection.rowIds?.length ?? 0) > 1) return true;
  return selection.indexes.some((index, position) => position > 0 && index !== selection.indexes[position - 1] + 1);
}

export function selectProductionTime(base: WordSelection, start: number, end: number, words: Timed[], modifiers: SelectionModifiers = {}): WordSelection {
  const low = Math.max(0, Math.min(start, end));
  const high = Math.max(start, end);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) return base;
  const existing = productionRanges(base, words);
  let ranges: SelectionRange[];
  if (modifiers.alt) {
    ranges = existing.flatMap((range) => range.end <= low || range.start >= high ? [range] : [
      ...(range.start < low ? [{ ...range, end: low }] : []),
      ...(range.end > high ? [{ ...range, id: `${range.id}-after-${high}`, start: high }] : []),
    ]);
  } else ranges = [...(modifiers.ctrl || modifiers.shift ? existing : []), { id: `time-${low}-${high}`, start: low, end: high }];
  ranges = normalize(ranges);
  const indexes = words.flatMap((word, index) => ranges.some((range) => word.end > range.start && word.start < range.end) ? [index] : []);
  return { indexes, anchor: indexes.at(-1) ?? null, ranges, ...(base.scope ? { scope: base.scope } : {}) };
}

export function selectProductionWord(base: WordSelection, index: number, words: Timed[], modifiers: SelectionModifiers = {}): WordSelection {
  const word = words[index];
  if (!word) return base;
  if (!modifiers.ctrl && !modifiers.shift && !modifiers.alt && base.indexes.includes(index)) return { ...base, anchor: index };
  const anchor = modifiers.shift && base.anchor !== null ? words[base.anchor] : word;
  const result = selectProductionTime(base, Math.min(anchor?.start ?? word.start, word.start), Math.max(anchor?.end ?? word.end, word.end), words,
    { ...modifiers, alt: modifiers.alt || Boolean(modifiers.ctrl && !modifiers.shift && base.indexes.includes(index)) });
  return { ...result, anchor: index };
}

export function sweepProductionWords(base: WordSelection, origin: number, index: number, words: Timed[], modifiers: SelectionModifiers): WordSelection {
  const first = words[Math.min(origin, index)], last = words[Math.max(origin, index)];
  return first && last ? { ...selectProductionTime(base, first.start, last.end, words, modifiers), anchor: index } : base;
}
