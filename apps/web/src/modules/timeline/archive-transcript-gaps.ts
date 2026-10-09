import type { ObsLiveLinkTranscriptRow, StudioWord } from "../../domain/types";

/** Reveal known realtime text where the detailed artifact has no word coverage.
 * A gap is a review hint, never a new word or a verified speech interval. */
export function archiveTranscriptGaps(words: readonly StudioWord[], rows: readonly ObsLiveLinkTranscriptRow[]) {
  const intervals = [...words].filter((word) => word.timingTrusted !== false &&
    Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start)
    .sort((a, b) => a.start - b.start);
  return rows.filter((row) => row.status === "final" && row.text.trim()).flatMap((row) => {
    let cursor = row.startSeconds;
    const gaps: Array<{ start: number; end: number; row: ObsLiveLinkTranscriptRow }> = [];
    for (const word of intervals) {
      if (word.end <= cursor) continue;
      if (word.start >= row.endSeconds) break;
      if (word.start - cursor >= 2) gaps.push({ start: cursor, end: word.start, row });
      cursor = Math.max(cursor, word.end);
    }
    if (row.endSeconds - cursor >= 2) gaps.push({ start: cursor, end: row.endSeconds, row });
    return gaps;
  });
}
