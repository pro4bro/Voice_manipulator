import { describe, expect, it } from "vitest";

import {
  EMOTION_TARGET_SECONDS,
  NEUTRAL_TARGET_SECONDS,
  buildReadingPlan,
  coverageFor,
  formatDuration,
  needsBreak,
  nextCardIndex,
  planTotalSeconds,
  targetSecondsFor,
} from "./reading-plan";
import type { EmotionLabel, ReadingPack, ReadingPassage } from "./types";

function passage(id: string, emotion: EmotionLabel, cards: number, seconds = 8): ReadingPassage {
  return {
    id,
    kind: "emotion",
    emotion,
    title: `Passage ${id}`,
    direction: `Deliver it ${emotion}.`,
    wordCount: cards * 20,
    estimatedSeconds: cards * seconds,
    cards: Array.from({ length: cards }, (_, index) => ({
      id: `${id}-c${index + 1}`,
      text: `Card ${index + 1} of ${id}.`,
      tags: [],
      wordCount: 20,
      estimatedSeconds: seconds,
    })),
  };
}

const PACK: ReadingPack = {
  packId: "test-v1",
  language: "vi",
  languageName: "Tiếng Việt",
  title: "Test",
  version: 1,
  license: "pro4bro-original",
  passageCount: 3,
  cardCount: 7,
  wordCount: 140,
  estimatedSeconds: 56,
  emotions: ["normal", "angry"],
  passages: [passage("neutral-a", "normal", 2), passage("angry-a", "angry", 3), passage("neutral-b", "normal", 2)],
};

describe("buildReadingPlan", () => {
  it("follows the order the user selected emotions in, not pack order", () => {
    const plan = buildReadingPlan(PACK, ["angry", "normal"], "flow");

    expect(plan.cards.map((card) => card.emotion).slice(0, 3)).toEqual(["angry", "angry", "angry"]);
    expect(plan.cards).toHaveLength(7);
  });

  it("keeps cards in pack order inside one emotion, so a passage reads as written", () => {
    const plan = buildReadingPlan(PACK, ["normal"], "take");

    expect(plan.cards.map((card) => card.cardId)).toEqual([
      "neutral-a-c1",
      "neutral-a-c2",
      "neutral-b-c1",
      "neutral-b-c2",
    ]);
  });

  it("drops `mix`, which is a rollup rather than something a person can perform", () => {
    const plan = buildReadingPlan(PACK, ["normal", "mix"], "flow");

    expect(plan.emotions).toEqual(["normal"]);
  });

  it("carries the passage direction onto every card so the teleprompter can show it", () => {
    const plan = buildReadingPlan(PACK, ["angry"], "flow");

    expect(plan.cards[0].direction).toBe("Deliver it angry.");
  });
});

describe("coverageFor", () => {
  it("asks for far more neutral than any single emotion", () => {
    expect(targetSecondsFor("normal")).toBe(NEUTRAL_TARGET_SECONDS);
    expect(targetSecondsFor("angry")).toBe(EMOTION_TARGET_SECONDS);
    expect(NEUTRAL_TARGET_SECONDS).toBeGreaterThan(EMOTION_TARGET_SECONDS);
  });

  it("counts recorded seconds and what is still owed", () => {
    const plan = buildReadingPlan(PACK, ["angry"], "flow");
    const [angry] = coverageFor(plan, { "angry-a-c1": 9, "angry-a-c2": 7 });

    expect(angry.cardsRecorded).toBe(2);
    expect(angry.cardsTotal).toBe(3);
    expect(angry.recordedSeconds).toBe(16);
    expect(angry.remainingSeconds).toBe(EMOTION_TARGET_SECONDS - 16);
  });

  it("caps progress so over-recording cannot overflow a bar", () => {
    const plan = buildReadingPlan(PACK, ["angry"], "flow");
    const [angry] = coverageFor(plan, { "angry-a-c1": 9999 });

    expect(angry.progress).toBe(1);
    expect(angry.remainingSeconds).toBe(0);
  });
});

describe("nextCardIndex", () => {
  it("returns the first card with nothing against it", () => {
    const plan = buildReadingPlan(PACK, ["normal"], "take");

    expect(nextCardIndex(plan, { "neutral-a-c1": 8 })).toBe(1);
  });

  it("skips over a gap rather than stopping at it", () => {
    const plan = buildReadingPlan(PACK, ["normal"], "take");

    expect(nextCardIndex(plan, { "neutral-a-c1": 8, "neutral-a-c2": 8, "neutral-b-c1": 8 })).toBe(3);
  });

  it("reports -1 when the plan is finished", () => {
    const plan = buildReadingPlan(PACK, ["angry"], "take");
    const done = Object.fromEntries(plan.cards.map((card) => [card.cardId, 8]));

    expect(nextCardIndex(plan, done)).toBe(-1);
  });
});

describe("presentation helpers", () => {
  it("totals the plan from its cards", () => {
    expect(planTotalSeconds(buildReadingPlan(PACK, ["normal", "angry"], "flow"))).toBe(56);
  });

  it("formats durations the way a session panel reads them", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(605)).toBe("10m 05s");
  });

  it("calls for a break before fatigue starts changing the voice", () => {
    expect(needsBreak(599)).toBe(false);
    expect(needsBreak(600)).toBe(true);
  });
});
