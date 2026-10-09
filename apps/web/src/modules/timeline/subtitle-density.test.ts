import { describe, expect, it } from "vitest";
import { isCompactSubtitleWord, subtitleIndexAtTime, visibleSubtitleWordLayout } from "./subtitle-density";

describe("subtitle density", () => {
  it("hides labels only when their exact rendered interval is too narrow", () => {
    expect(isCompactSubtitleWord(21.99)).toBe(true);
    expect(isCompactSubtitleWord(22)).toBe(false);
    expect(isCompactSubtitleWord(96)).toBe(false);
    expect(isCompactSubtitleWord(Number.NaN)).toBe(true);
  });

  it("decimates one source word per four pixels and restores full words as zoom provides space", () => {
    const words = Array.from({ length: 6_000 }, (_, index) => {
      const start = index * 0.15;
      return { text: `word${index}`, start, end: start + 0.12 };
    });

    const overview = visibleSubtitleWordLayout(words, 0, 900, 1_000);
    const zoomed = visibleSubtitleWordLayout(words, 0, 5, 1_000);
    expect(overview.length).toBeGreaterThan(0);
    expect(overview.length).toBeLessThanOrEqual(250);
    expect(zoomed.length).toBeGreaterThan(0);
    expect(zoomed.every((item) => !item.isCompact && item.widthPixels >= 22)).toBe(true);
    expect(overview.every((item) => item.isCompact && item.widthPixels >= 4)).toBe(true);
    expect(overview.every((item) => item.sourceIndex >= 0 && item.sourceIndex < words.length)).toBe(true);
    expect(new Set(overview.map((item) => item.sourceIndex)).size).toBe(overview.length);
    expect(overview.every((item, index) => index === 0 || item.leftPixels >= overview[index - 1].leftPixels + overview[index - 1].widthPixels)).toBe(true);

    // Coarse labels are visual summaries only: full source timing and source
    // indices remain available to precise hit testing/editing at every zoom.
    for (const index of [0, 1, 537, 2_999, 5_999]) {
      const word = words[index];
      expect(subtitleIndexAtTime(words, (word.start + word.end) / 2)).toBe(index);
    }
    expect(zoomed.map((item) => item.sourceIndex)).toEqual(expect.arrayContaining([0, 1, 2, 3, 4]));
  });

  it("keeps forced active and selected words visible without overlap", () => {
    const words = Array.from({ length: 100 }, (_, index) => ({ text: `w${index}`, start: index * 0.01, end: index * 0.01 + 0.005 }));
    const items = visibleSubtitleWordLayout(words, 0, 1, 100, [20, 21, 50]);
    expect(items.map((item) => item.sourceIndex)).toContain(50);
    expect(items.map((item) => item.sourceIndex)).toContain(21);
    expect(items.map((item) => item.sourceIndex)).not.toContain(20);
    expect(items.every((item, index) => index === 0 || item.leftPixels >= items[index - 1].leftPixels + items[index - 1].widthPixels)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(25);
  });
});
