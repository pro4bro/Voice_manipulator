import type { WordSelection } from "./word-selection";

interface SourceRows { id: string; segments?: Array<{ rowId: string; start: number; end: number }>; words?: Array<{ segmentIndex?: number }> }

/** One reviewed media span; never combine separate selections into a larger patch. */
export function mediaPatchSpan(source: { id: string; updatedAt: string; words: Array<{ start: number; end: number }> }, selection: WordSelection): [number, number] | null {
  if (selection.scope?.kind !== "asset" || selection.scope.id !== source.id || selection.scope.revision !== source.updatedAt) return null;
  if ((selection.ranges?.length ?? 0) > 1) return null;
  let indexes = [...new Set(selection.indexes)].sort((a, b) => a - b);
  if (!indexes.length && selection.ranges?.length === 1) {
    const range = selection.ranges[0];
    if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start) return null;
    indexes = source.words.flatMap((word, index) => word.start < range.end && word.end > range.start ? [index] : []);
  }
  if (!indexes.length || indexes.some((index, i) => !Number.isInteger(index) || index < 0 || index >= source.words.length || i > 0 && index !== indexes[i - 1] + 1)) return null;
  if (indexes.some((index) => { const word = source.words[index]; return !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start; })) return null;
  return [indexes[0], indexes[indexes.length - 1]];
}

/** The caller labels this as a whole-sentence transfer, including partial selections. */
export function patchRowForSelection(output: SourceRows, selection: WordSelection, projectId: string): string | null {
  const scope = selection.scope;
  if (scope && !(scope.kind === "voice-output" && scope.id === output.id) && !(scope.kind === "script" && scope.id === projectId)) return null;
  const ids = new Set([...(selection.rowIds ?? []), ...(selection.textRanges ?? []).map((range) => range.rowId)]);
  const segments = output.segments ?? [];
  if (!ids.size && scope?.kind !== "script") {
    for (const index of selection.indexes) {
      const segmentIndex = output.words?.[index]?.segmentIndex;
      if (segmentIndex === undefined || !segments[segmentIndex]) return null;
      ids.add(segments[segmentIndex].rowId);
    }
    for (const range of selection.ranges ?? []) {
      const matches = segments.filter((segment) => segment.start < range.end && segment.end > range.start);
      if (!matches.length) return null;
      matches.forEach((segment) => ids.add(segment.rowId));
    }
  }
  const id = ids.size === 1 ? [...ids][0] : null;
  return id && segments.some((segment) => segment.rowId === id) ? id : null;
}
