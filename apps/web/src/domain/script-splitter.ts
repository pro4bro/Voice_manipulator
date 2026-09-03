/**
 * Turning pasted prose into recordable cards.
 *
 * A card is one take, and both engines want takes between 2 and 15 seconds, so
 * the split is not cosmetic — it decides the shape of every training sample the
 * passage produces. Two rules follow from that:
 *
 * A card never straddles a sentence end. The boundary becomes a sample boundary,
 * and half a sentence teaches the model a prosody contour that stops mid-thought.
 *
 * Too-short is fixed by merging, too-long by splitting at clause punctuation.
 * Both keep whole clauses intact; neither ever cuts mid-clause to hit a number.
 */

import { WORDS_PER_SECOND } from "./reading-plan";

export const CARD_MIN_SECONDS = 2;
export const CARD_MAX_SECONDS = 15;

const MIN_WORDS = Math.ceil(CARD_MIN_SECONDS * WORDS_PER_SECOND);
const MAX_WORDS = Math.floor(CARD_MAX_SECONDS * WORDS_PER_SECOND);

export interface SplitCard {
  text: string;
  wordCount: number;
  estimatedSeconds: number;
  /** Set when the card still falls outside the window after splitting and merging. */
  warning: "short" | "long" | null;
}

function wordsIn(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

function describe(text: string): SplitCard {
  const wordCount = wordsIn(text);
  const estimatedSeconds = Number((wordCount / WORDS_PER_SECOND).toFixed(2));
  return {
    text,
    wordCount,
    estimatedSeconds,
    warning:
      estimatedSeconds < CARD_MIN_SECONDS ? "short" : estimatedSeconds > CARD_MAX_SECONDS ? "long" : null,
  };
}

/** Sentences, with their terminator kept, plus every hard line break honoured. */
function sentences(text: string): string[] {
  return text
    .split(/\r?\n+/u)
    .flatMap((line) => line.match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/gu) ?? [])
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Break one over-long sentence at its clause punctuation, never mid-clause. */
function splitLongSentence(sentence: string): string[] {
  const clauses = sentence.match(/[^,;:]+[,;:]?/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
  if (clauses.length < 2) return [sentence];

  const out: string[] = [];
  let current = "";
  for (const clause of clauses) {
    const candidate = current ? `${current} ${clause}` : clause;
    if (current && wordsIn(candidate) > MAX_WORDS) {
      out.push(current);
      current = clause;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out;
}

export function splitIntoCards(text: string): SplitCard[] {
  const parts = sentences(text).flatMap((sentence) =>
    wordsIn(sentence) > MAX_WORDS ? splitLongSentence(sentence) : [sentence],
  );

  // Merge forward while a card is too short to be worth recording on its own.
  const merged: string[] = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (previous && wordsIn(previous) < MIN_WORDS && wordsIn(`${previous} ${part}`) <= MAX_WORDS) {
      merged[merged.length - 1] = `${previous} ${part}`;
    } else {
      merged.push(part);
    }
  }

  // A trailing fragment has nothing after it to merge with, so it goes backwards.
  const last = merged[merged.length - 1];
  if (merged.length > 1 && last && wordsIn(last) < MIN_WORDS) {
    const previous = merged[merged.length - 2];
    if (wordsIn(`${previous} ${last}`) <= MAX_WORDS) {
      merged.splice(merged.length - 2, 2, `${previous} ${last}`);
    }
  }

  return merged.map(describe);
}

export function splitSummary(cards: SplitCard[]) {
  return {
    cards: cards.length,
    words: cards.reduce((total, card) => total + card.wordCount, 0),
    seconds: Number(cards.reduce((total, card) => total + card.estimatedSeconds, 0).toFixed(1)),
    warnings: cards.filter((card) => card.warning).length,
  };
}
