import type { StudioWord } from "../../domain/types";
import { editableWordTimings } from "../../domain/editable-word-timing";

export interface ScriptTextRange {
  start: number;
  end: number;
}

export interface ScriptSourceWordRange extends ScriptTextRange { index: number; }

export interface ReconciledScriptEdit {
  text: string;
  words: StudioWord[];
  /** Indexes in the returned `words` array that were created or changed. */
  changedWordIndexes: number[];
}

interface Token {
  text: string;
  normalized: string;
  start: number;
  end: number;
}

const TIMING_EDIT_GAP_SECONDS = 0.01;
const MAX_LCS_CELLS = 1_000_000;

function normalizeToken(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/giu, "d").toLocaleLowerCase("vi");
}

function tokenize(value: string, exactOnly = false): Token[] {
  return Array.from(value.matchAll(/[\p{L}\p{N}]+/gu), (match) => {
    const start = match.index ?? 0;
    if (exactOnly) return { text: match[0], normalized: "", start, end: start + match[0].length };
    let normalized: string | undefined;
    return { text: match[0], get normalized() { return normalized ??= normalizeToken(match[0]); }, start, end: start + match[0].length };
  });
}

function sourceWordTokens(text: string, words: readonly { text: string }[], exactOnly = false) {
  const sourceTokens = tokenize(text, exactOnly);
  const tokensByWord = new Map<number, Token[]>();
  let cursor = 0;
  for (let index = 0; index < words.length; index += 1) {
    const wordTokens = tokenize(words[index].text, exactOnly);
    if (!wordTokens.length) continue;
    let matchAt = -1;
    for (let tokenIndex = cursor; tokenIndex <= Math.min(sourceTokens.length - wordTokens.length, cursor + 420); tokenIndex += 1) {
      if (wordTokens.every((token, offset) => {
        const source = sourceTokens[tokenIndex + offset];
        return source && (source.text === token.text || (exactOnly
          ? normalizeToken(source.text) === normalizeToken(token.text)
          : source.normalized === token.normalized));
      })) {
        matchAt = tokenIndex;
        break;
      }
    }
    if (matchAt < 0) continue;
    tokensByWord.set(index, sourceTokens.slice(matchAt, matchAt + wordTokens.length));
    cursor = matchAt + wordTokens.length;
  }
  return { sourceTokens, tokensByWord };
}

/** Map timed word identities onto the exact current Script text offsets. */
export function mapScriptWordsToText(text: string, words: StudioWord[]): ScriptSourceWordRange[] {
  // Offset mapping needs exact tokens only. Avoid allocating normalized getters
  // for every word; normalize only a genuinely different spelling on lookup.
  const { tokensByWord } = sourceWordTokens(text, words, true);
  return [...tokensByWord.entries()].flatMap(([index, tokens]) => tokens.length ? [{ index, start: tokens[0].start, end: tokens[tokens.length - 1].end }] : []);
}

function tokenLcsMatches(previous: Token[], next: Token[]): Map<number, number> {
  const matches = new Map<number, number>();
  if (previous.length * next.length > MAX_LCS_CELLS) {
    // For a wholesale replacement in a very long transcript, prefer the closest
    // monotonic exact token matches with bounded look-ahead over allocating a
    // quadratic matrix. This is edit-time work, never playback/render work.
    let cursor = 0;
    previous.forEach((token, previousIndex) => {
      for (let index = cursor; index < Math.min(next.length, cursor + 96); index += 1) {
        if (token.normalized === next[index].normalized) {
          matches.set(index, previousIndex);
          cursor = index + 1;
          break;
        }
      }
    });
    return matches;
  }
  const columns = next.length + 1;
  const table = new Uint32Array((previous.length + 1) * columns);
  for (let oldIndex = previous.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let nextIndex = next.length - 1; nextIndex >= 0; nextIndex -= 1) {
      const cell = oldIndex * columns + nextIndex;
      table[cell] = previous[oldIndex].normalized === next[nextIndex].normalized
        ? 1 + table[(oldIndex + 1) * columns + nextIndex + 1]
        : Math.max(table[(oldIndex + 1) * columns + nextIndex], table[oldIndex * columns + nextIndex + 1]);
    }
  }
  let oldIndex = 0;
  let nextIndex = 0;
  while (oldIndex < previous.length && nextIndex < next.length) {
    if (previous[oldIndex].normalized === next[nextIndex].normalized) {
      matches.set(nextIndex, oldIndex);
      oldIndex += 1;
      nextIndex += 1;
    } else if (table[(oldIndex + 1) * columns + nextIndex] >= table[oldIndex * columns + nextIndex + 1]) oldIndex += 1;
    else nextIndex += 1;
  }
  return matches;
}

function estimatedWords(words: StudioWord[], insertedIndexes: number[], left: StudioWord | undefined, right: StudioWord | undefined) {
  if (!left || !right || !Number.isFinite(left.end) || !Number.isFinite(right.start) || right.start < left.end) {
    insertedIndexes.forEach((index) => { words[index] = { ...words[index], start: 0, end: 0, timingSource: "user-interpolated", timingTrusted: false, reviewState: "manual", selectedVariant: "manual" }; });
    return;
  }
  const count = insertedIndexes.length;
  const available = Math.max(0, right.start - left.end);
  const gap = Math.min(TIMING_EDIT_GAP_SECONDS, available / (count + 1));
  const duration = Math.max(0, (available - gap * (count + 1)) / count);
  insertedIndexes.forEach((index, offset) => {
    const start = left.end + gap + offset * (duration + gap);
    words[index] = { ...words[index], start, end: start + duration, timingSource: "user-interpolated", timingTrusted: false, reviewState: "manual", selectedVariant: "manual" };
  });
}

/**
 * Keep the timing and annotations of words that still occur in the edited
 * transcript. Deleted words disappear; inserted words are evenly estimated
 * only between two surviving anchors and remain explicitly untrusted.
 */
function reconcileScriptTextEditWithAnchors(previousText: string, nextText: string, previousWords: StudioWord[], forcedMatches = new Map<number, number>()): ReconciledScriptEdit {
  const old = sourceWordTokens(previousText, previousWords);
  const nextTokens = tokenize(nextText);
  const oldWordByToken = new Map<number, number>();
  const oldTokenIndexByStart = new Map(old.sourceTokens.map((token, index) => [token.start, index]));
  for (const [wordIndex, tokens] of old.tokensByWord) for (const token of tokens) {
    const tokenIndex = oldTokenIndexByStart.get(token.start);
    if (tokenIndex !== undefined) oldWordByToken.set(tokenIndex, wordIndex);
  }
  const tokenMatches = tokenLcsMatches(old.sourceTokens, nextTokens);
  // Exact range edits know the identity of untouched words. Override ambiguous
  // LCS choices for duplicate words with their source offsets after the edit.
  for (const [nextIndex, oldIndex] of forcedMatches) {
    for (const [matchedNextIndex, matchedOldIndex] of tokenMatches) {
      if (matchedOldIndex === oldIndex || matchedNextIndex === nextIndex) tokenMatches.delete(matchedNextIndex);
    }
    tokenMatches.set(nextIndex, oldIndex);
  }
  const newWordByToken = new Map<number, { word: StudioWord; changed: boolean }>();
  const preservedOldWordIndexes = new Set<number>();
  for (const [nextIndex, oldIndex] of tokenMatches) {
    const oldWordIndex = oldWordByToken.get(oldIndex);
    if (oldWordIndex === undefined || preservedOldWordIndexes.has(oldWordIndex)) continue;
    const sourceWord = previousWords[oldWordIndex];
    const token = nextTokens[nextIndex];
    const sourceToken = old.sourceTokens[oldIndex];
    // Compare lexical text with the original transcript token. `StudioWord.text`
    // may include its trailing punctuation (for example "mới."); replacing an
    // unrelated word must not strip that punctuation or mark this word edited.
    const changed = token.text !== sourceToken.text;
    const localToken = tokenize(sourceWord.text).find((part) => part.normalized === sourceToken.normalized);
    const updatedText = changed && localToken
      ? sourceWord.text.slice(0, localToken.start) + token.text + sourceWord.text.slice(localToken.end)
      : changed ? token.text : sourceWord.text;
    const updated = changed ? { ...sourceWord, text: updatedText, reviewState: "manual" as const, selectedVariant: "manual" as const } : sourceWord;
    newWordByToken.set(nextIndex, { word: updated, changed });
    preservedOldWordIndexes.add(oldWordIndex);
  }

  const resultWords: StudioWord[] = [];
  const resultTokenIndexes: number[] = [];
  const changedWordIndexes: number[] = [];
  nextTokens.forEach((token, tokenIndex) => {
    const preserved = newWordByToken.get(tokenIndex);
    const word = preserved?.word ?? { text: token.text, start: 0, end: 0, timingSource: "user-interpolated", timingTrusted: false, reviewState: "manual" as const, selectedVariant: "manual" as const };
    if (!preserved || preserved.changed) changedWordIndexes.push(resultWords.length);
    resultWords.push(word);
    resultTokenIndexes.push(tokenIndex);
  });

  // Find each run of inserted tokens and use the nearest preserved words as
  // interpolation anchors. Anchors are still exact recognizer/user intervals;
  // every new interval carries user-interpolated + timingTrusted:false.
  let index = 0;
  while (index < resultWords.length) {
    if (newWordByToken.has(resultTokenIndexes[index])) { index += 1; continue; }
    const start = index;
    while (index < resultWords.length && !newWordByToken.has(resultTokenIndexes[index])) index += 1;
    const inserted = Array.from({ length: index - start }, (_, offset) => start + offset);
    const left = start > 0 && newWordByToken.has(resultTokenIndexes[start - 1]) ? resultWords[start - 1] : undefined;
    const right = index < resultWords.length && newWordByToken.has(resultTokenIndexes[index]) ? resultWords[index] : undefined;
    const firstNewToken = resultTokenIndexes[start];
    const lastNewToken = resultTokenIndexes[index - 1];
    const previousAnchor = [...tokenMatches].filter(([newIndex]) => newIndex < firstNewToken).sort(([leftIndex], [rightIndex]) => rightIndex - leftIndex)[0]?.[1] ?? -1;
    const nextAnchor = [...tokenMatches].filter(([newIndex]) => newIndex > lastNewToken).sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)[0]?.[1] ?? old.sourceTokens.length;
    const replacedWordIndexes = new Set<number>();
    for (let oldIndex = previousAnchor + 1; oldIndex < nextAnchor; oldIndex += 1) {
      const replaced = oldWordByToken.get(oldIndex);
      if (replaced !== undefined && !preservedOldWordIndexes.has(replaced)) replacedWordIndexes.add(replaced);
    }
    if (replacedWordIndexes.size === 1) {
      const [replacedIndex] = replacedWordIndexes;
      const replaced = previousWords[replacedIndex];
      for (const resultIndex of inserted) {
        resultWords[resultIndex] = {
          ...resultWords[resultIndex],
          ...(replaced.speakerId !== undefined ? { speakerId: replaced.speakerId } : {}),
          ...(replaced.diarizationSpeakerId !== undefined ? { diarizationSpeakerId: replaced.diarizationSpeakerId } : {}),
          ...(replaced.manualDiarizationSpeakerId !== undefined ? { manualDiarizationSpeakerId: replaced.manualDiarizationSpeakerId } : {}),
          ...(replaced.environmentProfileIds ? { environmentProfileIds: [...replaced.environmentProfileIds] } : {}),
          ...(replaced.emotion !== undefined ? { emotion: replaced.emotion } : {}),
        };
      }
    }
    // At an endpoint, the removed word's span remains a useful provisional
    // boundary. Do not spread a one-word replacement across the whole file.
    const removed = [...replacedWordIndexes].map((wordIndex) => previousWords[wordIndex]);
    const fallbackLeft = removed.length ? { ...removed[0], end: removed.reduce((start, word) => Math.min(start, word.start), Infinity) } : undefined;
    const fallbackRight = removed.length ? { ...removed[removed.length - 1], start: removed.reduce((end, word) => Math.max(end, word.end), 0) } : undefined;
    estimatedWords(resultWords, inserted, left ?? fallbackLeft, right ?? fallbackRight);
  }

  const duration = previousWords.reduce((end, word) => Math.max(end, Number.isFinite(word.end) ? word.end : 0), 0);
  return { text: nextText, words: editableWordTimings(resultWords, duration), changedWordIndexes, };
}

export function reconcileScriptTextEdit(previousText: string, nextText: string, previousWords: StudioWord[]): ReconciledScriptEdit {
  return reconcileScriptTextEditWithAnchors(previousText, nextText, previousWords);
}

/** Replace a known selection in Script while using its exact word indexes. */
export function replaceScriptTextRange(previousText: string, range: ScriptTextRange, replacement: string, words: StudioWord[]) {
  const start = Math.max(0, Math.min(previousText.length, range.start));
  const end = Math.max(start, Math.min(previousText.length, range.end));
  const nextText = previousText.slice(0, start) + replacement + previousText.slice(end);
  const old = sourceWordTokens(previousText, words);
  const nextTokenByStart = new Map(tokenize(nextText).map((token, index) => [token.start, index]));
  const oldTokenIndexByStart = new Map(old.sourceTokens.map((token, index) => [token.start, index]));
  const delta = replacement.length - (end - start);
  const forcedMatches = new Map<number, number>();
  for (const tokens of old.tokensByWord.values()) {
    if (!tokens.length) continue;
    const before = tokens[tokens.length - 1].end <= start;
    const after = tokens[0].start >= end;
    if (!before && !after) continue;
    for (const token of tokens) {
      const oldIndex = oldTokenIndexByStart.get(token.start);
      const nextIndex = nextTokenByStart.get(token.start + (after ? delta : 0));
      if (oldIndex !== undefined && nextIndex !== undefined) forcedMatches.set(nextIndex, oldIndex);
    }
  }
  return reconcileScriptTextEditWithAnchors(previousText, nextText, words, forcedMatches);
}

/** Replace one known timed word. The explicit index keeps repeated words unambiguous. */
export function replaceScriptWord(previousText: string, wordIndex: number, replacement: string, words: StudioWord[]) {
  const { tokensByWord } = sourceWordTokens(previousText, words);
  const rangeTokens = tokensByWord.get(wordIndex);
  if (!rangeTokens?.length) return { text: previousText, words, changedWordIndexes: [] } satisfies ReconciledScriptEdit;
  return replaceScriptTextRange(previousText, { start: rangeTokens[0].start, end: rangeTokens[rangeTokens.length - 1].end }, replacement, words);
}

/** Insert subtitle text before a known word boundary; a clicked timeline time is provisional, not source alignment. */
function pinInsertedWords(result: ReconciledScriptEdit, sourceTime: number, originalWords: StudioWord[], sourceEnd?: number) {
  const indexes = result.changedWordIndexes;
  if (!indexes.length) return;
  const first = indexes[0], last = indexes[indexes.length - 1];
  const low = result.words[first - 1]?.end ?? 0;
  const nextStart = result.words[last + 1]?.start;
  const end = Math.min(nextStart ?? Math.max(low, sourceTime) + .09 * indexes.length, sourceEnd ?? Infinity);
  if (end <= low) return false;
  const start = Math.max(low, Math.min(sourceTime, end - Math.min(.02 * indexes.length, (end - low) / 2)));
  const step = (end - start) / indexes.length;
  const gap = Math.min(.01, step / 5);
  indexes.forEach((index, offset) => { result.words[index] = { ...result.words[index], start: start + offset * step, end: start + (offset + 1) * step - gap, timingSource: "user-interpolated", timingTrusted: false }; });
  if (sourceEnd === undefined) result.words = editableWordTimings(result.words, originalWords.reduce((limit, word) => Math.max(limit, word.end), end));
  return true;
}

/** Delete known word identities in one document pass, without realigning survivors. */
export function deleteScriptWordText(text: string, indexes: readonly number[], words: readonly { text: string }[]): string | null {
  const removed = new Set(indexes);
  if (!removed.size) return text;
  // The mapper reads lexical identity only; no timing is manufactured or sent
  // to the background worker.
  const { tokensByWord } = sourceWordTokens(text, words, true);
  const spans: ScriptTextRange[] = [];
  for (const index of removed) {
    const tokens = tokensByWord.get(index);
    if (!tokens?.length) return null;
    let start = tokens[0].start, end = tokens[tokens.length - 1].end;
    while (start > 0 && /[“"'‘([{]/u.test(text[start - 1])) start -= 1;
    while (end < text.length && /[.,!?;:…"'”’)}\]]/u.test(text[end])) end += 1;
    if (end < text.length && /\s/u.test(text[end])) end += 1;
    else while (start > 0 && /\s/u.test(text[start - 1])) start -= 1;
    spans.push({ start, end });
  }
  spans.sort((a, b) => a.start - b.start);
  const pieces: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) pieces.push(text.slice(cursor, span.start));
    cursor = Math.max(cursor, span.end);
  }
  pieces.push(text.slice(cursor));
  return pieces.join("").trim();
}

export function deleteScriptWords(text: string, indexes: readonly number[], words: StudioWord[]): ReconciledScriptEdit | null {
  const nextText = deleteScriptWordText(text, indexes, words);
  if (nextText === null) return null;
  const removed = new Set(indexes);
  return { text: nextText, words: removed.size ? words.filter((_, index) => !removed.has(index)) : words, changedWordIndexes: [] };
}

function inheritInsertionSpeaker(result: ReconciledScriptEdit, words: StudioWord[], boundary: number, time?: number) {
  const before = words[boundary - 1], after = words[boundary];
  const context = !before ? after : !after || time === undefined || !Number.isFinite(time) ||
    Math.max(0, time - before.end) <= Math.max(0, after.start - time) ? before : after;
  if (!context) return;
  const row: Partial<StudioWord> = {};
  for (const key of ["speakerId", "diarizationSpeakerId", "manualDiarizationSpeakerId", "segmentIndex"] as const) {
    if (context[key] !== undefined) Object.assign(row, { [key]: context[key] });
  }
  for (const index of result.changedWordIndexes) result.words[index] = { ...row, ...result.words[index] };
}

export function insertScriptTextAtWordBoundary(previousText: string, wordBoundaryIndex: number, insertedText: string, words: StudioWord[], sourceTime?: number, sourceEnd?: number) {
  const ranges = mapScriptWordsToText(previousText, words);
  const boundary = Math.max(0, Math.min(words.length, Math.trunc(wordBoundaryIndex)));
  const nextWordRange = ranges.find((range) => range.index === boundary);
  const previousWordRange = [...ranges].reverse().find((range) => range.index === boundary - 1);
  const position = nextWordRange?.start ?? previousWordRange?.end ?? previousText.length;
  const trimmed = insertedText.trim();
  const prefix = position > 0 && !/\s/u.test(previousText[position - 1]) ? " " : "";
  const suffix = position < previousText.length && !/\s/u.test(previousText[position]) ? " " : "";
  if (sourceTime !== undefined && Number.isFinite(sourceTime) && sourceEnd !== undefined) {
    // A Timeline insertion has an exact word boundary and audio bounds. Splice
    // directly so provisional timing cannot repair or borrow from old anchors.
    const added: StudioWord[] = tokenize(trimmed).map((token) => ({ text: token.text, start: 0, end: 0,
      timingSource: "user-interpolated", timingTrusted: false, reviewState: "manual", selectedVariant: "manual" }));
    if (!added.length) return { text: previousText, words, changedWordIndexes: [] } satisfies ReconciledScriptEdit;
    const result: ReconciledScriptEdit = {
      text: previousText.slice(0, position) + prefix + trimmed + suffix + previousText.slice(position),
      words: [...words.slice(0, boundary), ...added, ...words.slice(boundary)],
      changedWordIndexes: added.map((_, offset) => boundary + offset),
    };
    if (pinInsertedWords(result, Math.max(0, sourceTime), words, sourceEnd) === false) {
      return { text: previousText, words, changedWordIndexes: [] } satisfies ReconciledScriptEdit;
    }
    inheritInsertionSpeaker(result, words, boundary, sourceTime);
    return result;
  }
  // Preserve exact surrounding word identities, including repeated phrases.
  const result = replaceScriptTextRange(previousText, { start: position, end: position }, prefix + trimmed + suffix, words);
  if (sourceTime !== undefined && Number.isFinite(sourceTime)) {
    if (pinInsertedWords(result, Math.max(0, sourceTime), words, sourceEnd) === false) {
      return { text: previousText, words, changedWordIndexes: [] } satisfies ReconciledScriptEdit;
    }
  }
  inheritInsertionSpeaker(result, words, boundary, sourceTime);
  return result;
}

/** Replace one exact timed word and pin new text to an untrusted chosen time. */
export function replaceScriptWordAtTime(previousText: string, wordIndex: number, replacement: string, words: StudioWord[], sourceTime: number) {
  const result = replaceScriptWord(previousText, wordIndex, replacement, words);
  if (!Number.isFinite(sourceTime)) return result;
  pinInsertedWords(result, Math.max(0, sourceTime), words);
  return result;
}
