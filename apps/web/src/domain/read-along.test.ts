import { describe, expect, it } from "vitest";

import {
  DEFAULT_READ_ALONG_OPTIONS,
  followScript,
  isCardFinished,
  splitScript,
  startReadAlong,
  stripDiacritics,
  wordScore,
} from "./read-along";

const CARD = "Bước hai, mở nắp phía sau, lấy khay ra và đặt lên một mặt phẳng khô.";
const SCRIPT = splitScript(CARD);

function follow(cursor: number, heard: string[], extra: Parameters<typeof followScript>[1] | null = null) {
  return followScript(
    { cursor, movedAt: 0 },
    { script: SCRIPT, heard, now: 100, ...(extra ?? {}) },
  );
}

describe("wordScore", () => {
  it("scores an exact word above a de-toned one, and both above a stranger", () => {
    expect(wordScore("nắp", "nắp")).toBe(1);
    expect(wordScore("nắp", "nap")).toBe(0.8);
    expect(wordScore("nắp", "xưởng")).toBe(0);
  });

  it("ignores punctuation and case the recognizer never emits consistently", () => {
    expect(wordScore("hai,", "Hai")).toBe(1);
  });

  it("refuses to guess on short words that differ", () => {
    // "ra" and "và" are one edit apart but both real words in this card;
    // treating them as the same would let the cursor jump two words.
    expect(wordScore("ra", "và")).toBe(0);
  });
});

describe("stripDiacritics", () => {
  it("removes tone marks and folds đ, which recognizers routinely drop", () => {
    expect(stripDiacritics("đặt")).toBe("dat");
    expect(stripDiacritics("phẳng")).toBe("phang");
  });
});

describe("followScript", () => {
  it("advances past the word it just heard", () => {
    expect(follow(0, ["Bước"]).cursor).toBe(1);
  });

  it("uses trailing context so a repeated common word cannot pull it away", () => {
    // "ra" is short and unremarkable on its own; "lấy khay" behind it is what
    // pins the cursor to the right occurrence.
    const state = follow(6, ["lấy", "khay", "ra"]);

    expect(SCRIPT[state.cursor]).toBe("và");
  });

  it("keeps following when the reader drops the tone marks", () => {
    expect(follow(2, ["mo", "nap"]).cursor).toBe(4);
  });

  it("steps over a word the reader skipped rather than waiting for it", () => {
    // Reader jumps from "mở" straight to "phía", never saying "nắp".
    const state = follow(3, ["phía"]);

    expect(SCRIPT[state.cursor - 1]).toBe("phía");
  });

  it("does not rewind when the reader repeats themselves", () => {
    const before = { cursor: 8, movedAt: 0 };
    const after = followScript(before, { script: SCRIPT, heard: ["Bước"], now: 100 });

    expect(after.cursor).toBe(8);
  });

  it("holds still when it hears nothing it recognises", () => {
    const before = { cursor: 4, movedAt: 0 };
    const after = followScript(before, { script: SCRIPT, heard: ["television"], now: 100 });

    expect(after).toBe(before);
  });

  it("nudges forward when speech continues but nothing matches", () => {
    const stalled = DEFAULT_READ_ALONG_OPTIONS.stallMs + 1;
    const after = followScript(
      { cursor: 4, movedAt: 0 },
      { script: SCRIPT, heard: ["television"], now: stalled, speaking: true },
    );

    expect(after.cursor).toBe(5);
  });

  it("does not nudge during silence, because silence is a pause, not a misread", () => {
    const stalled = DEFAULT_READ_ALONG_OPTIONS.stallMs + 1;
    const before = { cursor: 4, movedAt: 0 };
    const after = followScript(
      before,
      { script: SCRIPT, heard: ["television"], now: stalled, speaking: false },
    );

    expect(after).toBe(before);
  });

  it("finishes the card on the last word and never runs past it", () => {
    const last = SCRIPT.length - 1;
    const state = follow(last, [SCRIPT[last]]);

    expect(state.cursor).toBe(SCRIPT.length);
    expect(isCardFinished(state, SCRIPT)).toBe(true);
  });

  it("survives an empty script instead of throwing at the reader", () => {
    const before = startReadAlong();

    expect(followScript(before, { script: [], heard: ["gì"], now: 10 })).toBe(before);
  });
});
