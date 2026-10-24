import type { VoiceScriptRow } from "../../domain/types";

export interface ScriptHighlightToken {
  text: string;
  whitespace: string;
  state: "pending" | "fixed" | null;
}

function rowText(rows: VoiceScriptRow[] | null | undefined, rowId: string): string | null {
  return rows?.find((row) => row.id === rowId)?.text ?? null;
}

/**
 * Marks current words absent from the latest successful snapshot as pending,
 * and words absent from the Full baseline as completed fixes. Pending edits win.
 * Whitespace is kept verbatim so the editable overlay follows the textarea.
 */
export function scriptHighlightTokens(
  current: string,
  generated: VoiceScriptRow[] | null | undefined,
  full: VoiceScriptRow[] | null | undefined,
  rowId: string,
): ScriptHighlightToken[] {
  if (generated == null) return [];
  const generatedText = rowText(generated, rowId);
  if (generatedText === null) {
    return (current.match(/\s+|\S+/gu) ?? []).reduce<ScriptHighlightToken[]>((tokens, piece) => {
      if (/^\s+$/u.test(piece) && tokens.length) tokens[tokens.length - 1].whitespace += piece;
      else tokens.push({ text: /^\s+$/u.test(piece) ? "" : piece, whitespace: /^\s+$/u.test(piece) ? piece : "", state: /^\s+$/u.test(piece) ? null : "pending" });
      return tokens;
    }, []);
  }
  if (!current.trim() && generatedText.trim()) return [{ text: "", whitespace: "", state: "pending" }];
  const fullText = rowText(full, rowId);
  const pieces = current.match(/\s+|\S+/gu) ?? [];
  const currentWords = pieces.filter((piece) => !/^\s+$/u.test(piece));
  const generatedWords = generatedText.match(/\S+/gu) ?? [];
  const fullWords = fullText?.match(/\S+/gu) ?? [];
  const generatedMatches = unmatchedCurrentWords(currentWords, generatedWords);
  const fullMatches = fullText === null ? new Set<number>() : unmatchedCurrentWords(currentWords, fullWords);
  let wordIndex = 0;
  const tokens: ScriptHighlightToken[] = [];
  for (const piece of pieces) {
    if (/^\s+$/u.test(piece)) {
      if (tokens.length) tokens[tokens.length - 1].whitespace += piece;
      else tokens.push({ text: "", whitespace: piece, state: null });
      continue;
    }
    const pending = generatedMatches.has(wordIndex);
    const fixed = !pending && fullText !== null && fullMatches.has(wordIndex);
    tokens.push({ text: piece, whitespace: "", state: pending ? "pending" : fixed ? "fixed" : null });
    wordIndex += 1;
  }
  return tokens;
}

/** LCS diff returns current-token indices that were not present in the baseline. */
function unmatchedCurrentWords(current: string[], baseline: string[]): Set<number> {
  if (current.length === baseline.length && current.every((word, index) => word === baseline[index])) return new Set();
  // Avoid a quadratic allocation for a pasted paragraph accidentally placed
  // in one row. A conservative whole-row mark is safer than freezing the UI.
  if (current.length * baseline.length > 1_000_000) return new Set(current.map((_, index) => index));
  const rows = current.length + 1;
  const cols = baseline.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint32Array(cols));
  for (let i = current.length - 1; i >= 0; i -= 1) {
    for (let j = baseline.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = current[i] === baseline[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const matched = new Set<number>();
  const matchedBaseline = new Set<number>();
  const baselineToCurrent = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < current.length && j < baseline.length) {
    if (current[i] === baseline[j]) { matched.add(i); matchedBaseline.add(j); baselineToCurrent.set(j, i); i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i += 1;
    else j += 1;
  }
  const changed = new Set(current.map((_, index) => index).filter((index) => !matched.has(index)));
  if (changed.size || matchedBaseline.size === baseline.length || !current.length) return changed;

  // Each pure-deletion run marks its nearest surviving word as an anchor.
  // A completely empty current row gets a separate visible cell marker above.
  for (let start = 0; start < baseline.length;) {
    if (matchedBaseline.has(start)) { start += 1; continue; }
    let end = start;
    while (end + 1 < baseline.length && !matchedBaseline.has(end + 1)) end += 1;
    let next: number | undefined;
    for (let index = end + 1; index < baseline.length; index += 1) {
      if (matchedBaseline.has(index)) { next = baselineToCurrent.get(index); break; }
    }
    let previous: number | undefined;
    for (let index = start - 1; index >= 0; index -= 1) {
      if (matchedBaseline.has(index)) { previous = baselineToCurrent.get(index); break; }
    }
    const anchor = next ?? previous;
    if (anchor !== undefined) changed.add(anchor);
    start = end + 1;
  }
  return changed;
}
