import type { WordSelection } from "./word-selection";

interface SourceRows { id: string; segments?: Array<{ rowId: string; start: number; end: number }>; words?: Array<{ segmentIndex?: number }> }

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
