import type { EmotionLabel, ReadingPack, ReadingPassage } from "./types";

/**
 * Turns a Reading Pack into an ordered list of cards to record, and reports how
 * much of each emotion is still owed.
 *
 * Targets come from the owner's brief: roughly 12.5 minutes of neutral material
 * to carry the voice's identity, and 4.5 minutes of each other emotion. They are
 * minutes of speech, not minutes of session — retakes and pauses sit on top.
 */

/**
 * Careful reading runs around 140 words per minute.
 *
 * The server owns this same number in `file_reading_packs.py` and its durations
 * are the ones stored. This copy exists only to preview text that has not been
 * submitted yet; if one changes, change both or a card will look one length
 * while being authored and another once saved.
 */
export const WORDS_PER_SECOND = 140 / 60;

export const NEUTRAL_TARGET_SECONDS = 750;
export const EMOTION_TARGET_SECONDS = 270;

/** Long enough that fatigue starts changing the voice being captured. */
export const BREAK_INTERVAL_SECONDS = 600;

export type ReadingMode = "flow" | "take";

export interface ReadingPlanCard {
  cardId: string;
  passageId: string;
  passageTitle: string;
  direction: string;
  emotion: EmotionLabel;
  text: string;
  estimatedSeconds: number;
}

export interface ReadingPlan {
  packId: string;
  language: string;
  mode: ReadingMode;
  emotions: EmotionLabel[];
  cards: ReadingPlanCard[];
}

export interface EmotionCoverage {
  emotion: EmotionLabel;
  targetSeconds: number;
  recordedSeconds: number;
  remainingSeconds: number;
  cardsRecorded: number;
  cardsTotal: number;
  /** 0 to 1, capped, so a bar cannot overflow when someone over-records. */
  progress: number;
}

export function targetSecondsFor(emotion: EmotionLabel): number {
  return emotion === "normal" ? NEUTRAL_TARGET_SECONDS : EMOTION_TARGET_SECONDS;
}

function passageCards(passage: ReadingPassage): ReadingPlanCard[] {
  return passage.cards.map((card) => ({
    cardId: card.id,
    passageId: passage.id,
    passageTitle: passage.title,
    direction: passage.direction,
    emotion: passage.emotion,
    text: card.text,
    estimatedSeconds: card.estimatedSeconds,
  }));
}

/**
 * Cards stay in pack order within each emotion, and emotions follow the order
 * the user selected them. Reading a passage out of order breaks the through-line
 * the passage was written with, so the plan never shuffles.
 */
export function buildReadingPlan(
  pack: ReadingPack,
  emotions: EmotionLabel[],
  mode: ReadingMode,
): ReadingPlan {
  const wanted = emotions.filter((emotion) => emotion !== "mix");
  const cards = wanted.flatMap((emotion) =>
    pack.passages.filter((passage) => passage.emotion === emotion).flatMap(passageCards),
  );
  return { packId: pack.packId, language: pack.language, mode, emotions: wanted, cards };
}

export function coverageFor(
  plan: ReadingPlan,
  recordedSecondsByCard: Record<string, number>,
): EmotionCoverage[] {
  return plan.emotions.map((emotion) => {
    const cards = plan.cards.filter((card) => card.emotion === emotion);
    const recorded = cards.filter((card) => (recordedSecondsByCard[card.cardId] ?? 0) > 0);
    const recordedSeconds = recorded.reduce(
      (total, card) => total + (recordedSecondsByCard[card.cardId] ?? 0),
      0,
    );
    const targetSeconds = targetSecondsFor(emotion);
    return {
      emotion,
      targetSeconds,
      recordedSeconds: Math.round(recordedSeconds),
      remainingSeconds: Math.max(0, Math.round(targetSeconds - recordedSeconds)),
      cardsRecorded: recorded.length,
      cardsTotal: cards.length,
      progress: targetSeconds ? Math.min(1, recordedSeconds / targetSeconds) : 0,
    };
  });
}

/** The first card with nothing recorded against it, or -1 when the plan is done. */
export function nextCardIndex(
  plan: ReadingPlan,
  recordedSecondsByCard: Record<string, number>,
  from = 0,
): number {
  for (let index = Math.max(0, from); index < plan.cards.length; index += 1) {
    if (!(recordedSecondsByCard[plan.cards[index].cardId] ?? 0)) return index;
  }
  return -1;
}

export function planTotalSeconds(plan: ReadingPlan): number {
  return Math.round(plan.cards.reduce((total, card) => total + card.estimatedSeconds, 0));
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return minutes ? `${minutes}m ${String(safe % 60).padStart(2, "0")}s` : `${safe}s`;
}

/**
 * True once enough has been recorded since the last break that the voice itself
 * starts drifting. A tired voice at minute 50 is not the voice at minute 5, and
 * that drift lands in the training data where no similarity check can see it.
 */
export function needsBreak(secondsSinceBreak: number): boolean {
  return secondsSinceBreak >= BREAK_INTERVAL_SECONDS;
}
