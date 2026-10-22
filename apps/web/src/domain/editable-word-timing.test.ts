import { describe, expect, it } from "vitest";
import { editableWordTimings } from "./editable-word-timing";

describe("editable word timing", () => {
  it("keeps explicitly previewed overlap coordinates and the unchanged neighbor for visible conflict review", () => {
    const words = [{ text: "moved", start: .55, end: .75, subtitleTimingConflict: true },
      { text: "manual", start: .6, end: .8, timingSource: "manual" }];
    expect(editableWordTimings(words, 2)).toBe(words);
  });
  it("preserves safe source words and real silence exactly", () => {
    const words = [{ text: "a", start: 0, end: .01 }, { text: "b", start: 1, end: 2 }];
    expect(editableWordTimings(words, 3)).toBe(words);
  });
  it("gives zero words positive anchored estimates without claiming alignment", () => {
    const words = [{ text: "a", start: 1, end: 2 }, { text: "new", start: 0, end: 0 }, { text: "b", start: 3, end: 4 }];
    const next = editableWordTimings(words, 5);
    expect(next[0]).toBe(words[0]); expect(next[2]).toBe(words[2]);
    expect(next[1].start).toBe(2); expect(next[1].end).toBeGreaterThan(2);
    expect(next[1].timingTrusted).toBe(false);
    expect(next[1].sourceTiming).toMatchObject({ start: 0, end: 0 });
    expect(editableWordTimings(next, 5)).toBe(next);
  });
  it("repairs overlaps, duplicate onsets and missing endpoint words into positive ordered intervals", () => {
    const next = editableWordTimings([{ text: "a", start: 0, end: 0 }, { text: "b", start: 1, end: 2 }, { text: "c", start: 1, end: 1.4 }, { text: "d", start: 0, end: 0 }], 3);
    next.forEach((word, index) => {
      expect(word.end).toBeGreaterThan(word.start); expect(word.end).toBeLessThanOrEqual(3);
      if (index) expect(word.start).toBeGreaterThanOrEqual(next[index - 1].end);
    });
  });
  it("keeps malformed/reversed tiny anchors within the audio and is idempotent", () => {
    for (const words of [
      [{ text: "a", start: .9999999, end: 1 }, { text: "b", start: 0, end: 0 }],
      [{ text: "a", start: .9, end: 1 }, { text: "b", start: 0, end: 0 }, { text: "c", start: .1, end: .2 }],
      [{ text: "a", start: NaN, end: Infinity }, { text: "b", start: 2, end: 3 }],
    ]) {
      const next = editableWordTimings(words, 1);
      next.forEach((word, index) => {
        expect(word.start).toBeGreaterThanOrEqual(0); expect(word.end).toBeLessThanOrEqual(1);
        expect(word.end).toBeGreaterThan(word.start);
        if (index) expect(word.start).toBeGreaterThanOrEqual(next[index - 1].end);
      });
      expect(editableWordTimings(next, 1)).toBe(next);
    }
  });
});
