/**
 * Follows a speaker through a script they are reading aloud.
 *
 * This is not recognition. The words are already known; the only question is
 * where in them the speaker currently is. That makes the problem far easier
 * than open transcription, and it is why guided capture can run on a local
 * recognizer that would be too slow and too rough for free dictation.
 *
 * Two rules come from how people actually read. They repeat themselves, so the
 * cursor may never travel backwards more than a hair. And they misread words
 * and carry on, so the cursor must never wait for a word that is not coming.
 */

export interface ReadAlongState {
  /** Index of the word the reader is expected to say next. */
  cursor: number;
  /** When the cursor last moved, in `performance.now()` milliseconds. */
  movedAt: number;
}

export interface ReadAlongOptions {
  /** How far back a match may be found, to tolerate a late recognizer. */
  lookBehind: number;
  /** How far ahead a match may be found, to tolerate skipped words. */
  lookAhead: number;
  /** How far the cursor may retreat. Repeating a word must not rewind the page. */
  maxRewind: number;
  /** Silence-free time after which the cursor advances on its own. */
  stallMs: number;
  /** Lowest score that counts as having heard the word. */
  minScore: number;
}

export const DEFAULT_READ_ALONG_OPTIONS: ReadAlongOptions = {
  lookBehind: 2,
  lookAhead: 8,
  maxRewind: 2,
  stallMs: 2500,
  minScore: 0.8,
};

/** How many trailing heard words are matched against the script at once. */
const MATCH_DEPTH = 3;

export function startReadAlong(movedAt = 0): ReadAlongState {
  return { cursor: 0, movedAt };
}

export function splitScript(text: string): string[] {
  return text.split(/\s+/u).filter(Boolean);
}

export function normalizeWord(value: string): string {
  return value
    .toLocaleLowerCase("vi-VN")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Vietnamese tone marks are the first thing a streaming recognizer drops, and
 * a highlight that stalls on every missing dấu is worse than useless. Matching
 * the stripped form as a weaker signal keeps the cursor moving without letting
 * a genuinely different word score as a hit.
 */
export function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\u0111/gu, "d");
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length || !right.length) return Math.max(left.length, right.length);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    previous = current;
  }
  return previous[right.length];
}

/** 1 for the same word, 0.8 once tone marks are gone, 0.5 for a near miss. */
export function wordScore(expected: string, heard: string): number {
  const left = normalizeWord(expected);
  const right = normalizeWord(heard);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const bare = stripDiacritics(left);
  const heardBare = stripDiacritics(right);
  if (bare === heardBare) return 0.8;
  const longest = Math.max(bare.length, heardBare.length);
  if (longest >= 4 && editDistance(bare, heardBare) / longest <= 0.25) return 0.5;
  return 0;
}

/**
 * Scores the window position where the last heard word would sit, using a few
 * trailing words so a single common word cannot drag the cursor somewhere far
 * away. Earlier words count for less: they are context, not evidence.
 */
function positionScore(script: string[], heard: string[], position: number): number {
  let score = 0;
  let weight = 1;
  let total = 0;
  for (let depth = 0; depth < MATCH_DEPTH; depth += 1) {
    const scriptIndex = position - depth;
    const heardIndex = heard.length - 1 - depth;
    if (scriptIndex < 0 || heardIndex < 0) break;
    score += wordScore(script[scriptIndex], heard[heardIndex]) * weight;
    total += weight;
    weight /= 2;
  }
  return total ? score / total : 0;
}

export interface ReadAlongInput {
  /** Every word of the card, in order. */
  script: string[];
  /** The most recent words the recognizer produced, oldest first. */
  heard: string[];
  now: number;
  /** Whether the microphone is currently carrying speech. */
  speaking?: boolean;
  options?: Partial<ReadAlongOptions>;
}

/**
 * Advances the cursor for one recognizer update.
 *
 * Returns the same state object when nothing moved, so a caller can skip a
 * re-render on the many updates that change nothing.
 */
export function followScript(state: ReadAlongState, input: ReadAlongInput): ReadAlongState {
  const options = { ...DEFAULT_READ_ALONG_OPTIONS, ...input.options };
  const { script, heard, now } = input;
  if (!script.length) return state;

  const first = Math.max(0, state.cursor - options.lookBehind);
  const last = Math.min(script.length - 1, state.cursor + options.lookAhead);

  let bestPosition = -1;
  let bestScore = 0;
  for (let position = first; position <= last; position += 1) {
    const score = positionScore(script, heard, position);
    // Ties go to the position nearest the cursor: a common word repeated later
    // in the card is not evidence that the reader jumped to it.
    if (score > bestScore) {
      bestScore = score;
      bestPosition = position;
    }
  }

  if (bestPosition >= 0 && bestScore >= options.minScore) {
    const next = Math.min(script.length, bestPosition + 1);
    if (next >= state.cursor - options.maxRewind && next !== state.cursor) {
      return { cursor: next, movedAt: now };
    }
    return state;
  }

  // Nothing matched. If the speaker is audibly still going, they have read past
  // a word we failed to hear; step over it rather than stranding the highlight.
  if (input.speaking && now - state.movedAt >= options.stallMs && state.cursor < script.length) {
    return { cursor: state.cursor + 1, movedAt: now };
  }
  return state;
}

export function isCardFinished(state: ReadAlongState, script: string[]): boolean {
  return state.cursor >= script.length;
}
