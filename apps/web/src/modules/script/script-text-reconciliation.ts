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
  const current = playbackTokens(text);
  const source = words.flatMap((word, index) => playbackTokens(word.text).map((token) => ({ ...token, index })));
  const matches = new Map<number, number>();
  let prefix = 0;
  while (prefix < source.length && prefix < current.length && source[prefix].normalized === current[prefix].normalized) {
    matches.set(prefix, prefix); prefix++;
  }
  let oldEnd = source.length, newEnd = current.length;
  while (oldEnd > prefix && newEnd > prefix && source[oldEnd - 1].normalized === current[newEnd - 1].normalized) {
    matches.set(--oldEnd, --newEnd);
  }
  // Exact monotonic alignment prevents a changed repeated word from stealing a
  // later occurrence and shifting every following highlight. Long wholesale
  // replacements keep only proven prefix/suffix anchors, never guessed clocks.
  const oldMiddle = source.slice(prefix, oldEnd), newMiddle = current.slice(prefix, newEnd);
  if (oldMiddle.length * newMiddle.length <= 16_000_000) {
    for (const [previous, next] of exactPlaybackMatches(oldMiddle, newMiddle)) matches.set(previous + prefix, next + prefix);
  }
  const byWord = new Map<number, number[]>();
  source.forEach((token, index) => { const indexes = byWord.get(token.index) ?? []; indexes.push(index); byWord.set(token.index, indexes); });
  return [...byWord].flatMap(([index, tokens]) => {
    const positions = tokens.map((token) => matches.get(token));
    const start = positions[0];
    if (start === undefined || positions.some((position, offset) => position !== start + offset)) return [];
    return [{ index, start: current[start].start, end: current[start + positions.length - 1].end }];
  });
}

function playbackTokens(text: string): Token[] {
  return [...text.matchAll(/\S+/gu)].flatMap((piece) => {
    const tokens = tokenize(piece[0]);
    if (!tokens.length) return [{ text: piece[0], normalized: piece[0], start: piece.index!, end: piece.index! + piece[0].length }];
    return tokens.map((token) => ({ ...token, start: token.start + piece.index!, end: token.end + piece.index! }));
  });
}

/** Rolling scores and direction bits keep long merged turns exact without a quadratic score table. */
function exactPlaybackMatches(source: Token[], current: Token[]) {
  const columns = current.length;
  const directions = new Uint8Array(Math.ceil(source.length * columns / 8));
  let next = new Uint32Array(columns + 1), scores = new Uint32Array(columns + 1);
  for (let i = source.length - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      if (source[i].normalized === current[j].normalized) scores[j] = next[j + 1] + 1;
      else if (next[j] >= scores[j + 1]) {
        scores[j] = next[j];
        const bit = i * columns + j; directions[Math.floor(bit / 8)] |= 1 << (bit % 8);
      } else scores[j] = scores[j + 1];
    }
    [next, scores] = [scores, next];
  }
  const matches = new Map<number, number>();
  let i = 0, j = 0;
  while (i < source.length && j < current.length) {
    if (source[i].normalized === current[j].normalized) { matches.set(i++, j++); }
    else if (directions[Math.floor((i * columns + j) / 8)] & (1 << ((i * columns + j) % 8))) i++;
    else j++;
  }
  return matches;
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

function preserveReplacementTiming(source: StudioWord, text: string, start = source.start, end = source.end): StudioWord {
  return {
    ...source,
    text,
    start,
    end,
    timingSource: "user-text-preserved",
    timingTrusted: false,
    sourceTiming: source.sourceTiming ?? {
      start: source.start,
      end: source.end,
      ...(source.timingSource !== undefined ? { source: source.timingSource } : {}),
    },
    reviewState: "manual",
    selectedVariant: "manual",
  };
}

function partitionReplacement(source: StudioWord, tokens: Token[]): StudioWord[] {
  if (!tokens.length) return [];
  const span = source.end - source.start;
  return tokens.map((token, index) => preserveReplacementTiming(source, token.text,
    source.start + span * index / tokens.length,
    index === tokens.length - 1 ? source.end : source.start + span * (index + 1) / tokens.length));
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
    const updated = changed ? preserveReplacementTiming(sourceWord, updatedText) : sourceWord;
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
    let replacementSource: StudioWord | undefined;
    if (replacedWordIndexes.size === 1) {
      const [replacedIndex] = replacedWordIndexes;
      const replaced = previousWords[replacedIndex];
      replacementSource = replaced;
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
    if (replacementSource) {
      const replacementTokens = inserted.map((resultIndex) => nextTokens[resultTokenIndexes[resultIndex]]);
      const replacements = partitionReplacement(replacementSource, replacementTokens);
      inserted.forEach((resultIndex, offset) => {
        resultWords[resultIndex] = replacements[offset];
      });
      continue;
    }
    // At an endpoint, removed words may provide a provisional boundary for a
    // genuine addition. Do not treat an ambiguous insertion as a replacement.
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
  const range = { start: rangeTokens[0].start, end: rangeTokens[rangeTokens.length - 1].end };
  if (replacement === previousText.slice(range.start, range.end)) return { text: previousText, words, changedWordIndexes: [] } satisfies ReconciledScriptEdit;
  if (!replacement.trim()) return deleteScriptWords(previousText, [wordIndex], words) ??
    { text: previousText, words, changedWordIndexes: [] } satisfies ReconciledScriptEdit;

  const result = replaceScriptTextRange(previousText, range, replacement, words);
  const replacementTokens = tokenize(replacement);
  if (!replacementTokens.length) return result;
  const replacementStart = range.start;
  const replacementEnd = replacementStart + replacement.length;
  const replacedIndexes = mapScriptWordsToText(result.text, result.words)
    .filter(({ start, end }) => start >= replacementStart && end <= replacementEnd)
    .map(({ index }) => index);
  const source = words[wordIndex];
  if (!source || replacedIndexes.length !== replacementTokens.length) return result;
  const replacements = partitionReplacement(source, replacementTokens);
  replacedIndexes.forEach((index, offset) => { result.words[index] = replacements[offset]; });
  return { ...result, changedWordIndexes: [...new Set([...result.changedWordIndexes, ...replacedIndexes])].sort((a, b) => a - b) };
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
