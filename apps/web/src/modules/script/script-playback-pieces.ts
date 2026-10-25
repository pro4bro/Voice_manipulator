import type { ScriptHighlightToken } from "./script-highlight-diff";
import type { ScriptSourceWordRange } from "./script-text-reconciliation";

/** Split paint-only text at both edit and playback boundaries, retaining every character. */
export function scriptPlaybackPieces(text: string, ranges: ScriptSourceWordRange[], highlights: ScriptHighlightToken[]) {
  if (!text && highlights.some((token) => token.state === "pending")) return [{ text: "", wordIndex: undefined, state: "pending" as const }];
  let offset = 0;
  const marks = highlights.map((token) => {
    const start = offset; offset += token.text.length + token.whitespace.length;
    return { start, end: start + token.text.length, state: token.state };
  });
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap((range) => [range.start, range.end]),
    ...marks.flatMap((mark) => [mark.start, mark.end])])].sort((a, b) => a - b);
  let word = 0, mark = 0;
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    while (word < ranges.length && ranges[word].end <= start) word++;
    while (mark < marks.length && marks[mark].end <= start) mark++;
    return { text: text.slice(start, end), wordIndex: ranges[word]?.start <= start && ranges[word].end >= end ? ranges[word].index : undefined,
      state: marks[mark]?.start <= start && marks[mark].end >= end ? marks[mark].state : null };
  });
}
