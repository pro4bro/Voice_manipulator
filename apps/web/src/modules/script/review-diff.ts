/**
 * Comparing two transcripts of the same audio.
 *
 * Used twice: live speech against a careful STT pass, and STT against an AI
 * rewrite. Both times the question is the same - what actually changed - and the
 * answer has to be small enough to accept or reject one piece at a time.
 *
 * Tokens are words with their trailing space, so a change lands on word
 * boundaries. But punctuation rides along on the word, and the two passes
 * disagree about punctuation constantly: live speech recognition emits almost
 * none, and STT adds it back. Treating "chào" and "chào," as different words
 * asked the user to re-accept a word that never changed, and applying it
 * rewrote the whole word to add a comma. So a pair that differs only in its
 * punctuation is reported as a change to the punctuation alone.
 */

export type ReviewPiece =
  | { id: string; kind: "same"; text: string }
  | { id: string; kind: "change"; stt: string; ai: string };

/** Letters, the combining marks Vietnamese needs, and digits. */
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}]/u;

export interface WordParts {
  /** Punctuation before the word, such as an opening bracket or quote. */
  lead: string;
  /** The word itself, hyphens and apostrophes inside it included. */
  core: string;
  /** Punctuation after the word - the comma this whole thing is about. */
  trail: string;
  /** The whitespace that followed the token, kept so text rebuilds exactly. */
  space: string;
}

export function splitWord(token: string): WordParts {
  const body = token.replace(/\s+$/u, "");
  const space = token.slice(body.length);
  let start = 0;
  while (start < body.length && !WORD_CHARACTER.test(body[start])) start += 1;
  let end = body.length;
  while (end > start && !WORD_CHARACTER.test(body[end - 1])) end -= 1;
  return { lead: body.slice(0, start), core: body.slice(start, end), trail: body.slice(end), space };
}

const fold = (value: string) => value.trim().toLocaleLowerCase("vi");

export function reviewTokens(text: string): string[] {
  return text.match(/\S+\s*|\s+/gu) ?? [];
}

export function sameReviewToken(left: string, right: string): boolean {
  return fold(left) === fold(right);
}

/** True when two tokens are the same word wearing different punctuation. */
export function differsOnlyByPunctuation(left: string, right: string): boolean {
  const a = splitWord(left);
  const b = splitWord(right);
  if (!a.core || !b.core) return false;
  if (fold(a.core) !== fold(b.core)) return false;
  return a.lead !== b.lead || a.trail !== b.trail;
}

export function nextSharedToken(left: string[], right: string[], fromLeft: number, fromRight: number) {
  for (let distance = 1; distance <= 20; distance += 1) {
    for (let leftOffset = 0; leftOffset <= distance; leftOffset += 1) {
      const rightOffset = distance - leftOffset;
      if (
        fromLeft + leftOffset < left.length &&
        fromRight + rightOffset < right.length &&
        sameReviewToken(left[fromLeft + leftOffset], right[fromRight + rightOffset])
      ) {
        return { leftOffset, rightOffset };
      }
    }
  }
  return null;
}

export function buildReviewPieces(sttText: string, aiText: string): ReviewPiece[] {
  const stt = reviewTokens(sttText);
  const ai = reviewTokens(aiText);
  const pieces: ReviewPiece[] = [];
  let sttIndex = 0;
  let aiIndex = 0;
  let changeIndex = 0;

  while (sttIndex < stt.length || aiIndex < ai.length) {
    const left = stt[sttIndex];
    const right = ai[aiIndex];
    if (sttIndex < stt.length && aiIndex < ai.length && sameReviewToken(left, right)) {
      pieces.push({ id: `same-${sttIndex}-${aiIndex}`, kind: "same", text: left });
      sttIndex += 1;
      aiIndex += 1;
      continue;
    }
    // The same word with different punctuation: keep the word, change the marks.
    if (sttIndex < stt.length && aiIndex < ai.length && differsOnlyByPunctuation(left, right)) {
      const a = splitWord(left);
      const b = splitWord(right);
      if (a.lead !== b.lead) {
        pieces.push({ id: `change-${changeIndex++}`, kind: "change", stt: a.lead, ai: b.lead });
      } else if (a.lead) {
        pieces.push({ id: `same-lead-${sttIndex}-${aiIndex}`, kind: "same", text: a.lead });
      }
      pieces.push({ id: `same-${sttIndex}-${aiIndex}`, kind: "same", text: a.core });
      if (a.trail !== b.trail) {
        pieces.push({ id: `change-${changeIndex++}`, kind: "change", stt: a.trail, ai: b.trail });
      } else if (a.trail) {
        pieces.push({ id: `same-trail-${sttIndex}-${aiIndex}`, kind: "same", text: a.trail });
      }
      if (a.space) pieces.push({ id: `same-space-${sttIndex}-${aiIndex}`, kind: "same", text: a.space });
      sttIndex += 1;
      aiIndex += 1;
      continue;
    }
    const shared = nextSharedToken(stt, ai, sttIndex, aiIndex);
    const sttEnd = shared ? sttIndex + shared.leftOffset : stt.length;
    const aiEnd = shared ? aiIndex + shared.rightOffset : ai.length;
    const sttChange = stt.slice(sttIndex, sttEnd).join("");
    const aiChange = ai.slice(aiIndex, aiEnd).join("");
    if (sttChange || aiChange) {
      pieces.push({ id: `change-${changeIndex++}`, kind: "change", stt: sttChange, ai: aiChange });
    }
    sttIndex = sttEnd;
    aiIndex = aiEnd;
    if (!shared) break;
  }
  return pieces;
}
