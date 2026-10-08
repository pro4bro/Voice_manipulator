import { describe, expect, it } from "vitest";
import { isCompactSubtitleWord, readableSubtitleSlots, subtitleIndexAtTime, subtitleWordWidthPixels, visibleSubtitleIndexes } from "./subtitle-density";

describe("subtitle density", () => {
  it("measures the visible timestamp width without moving either edge", () => {
    expect(subtitleWordWidthPixels(10, 11, 0, 20, 400)).toBe(20);
    expect(subtitleWordWidthPixels(10, 12, 10, 20, 400)).toBe(40);
    expect(subtitleWordWidthPixels(9, 11, 10, 20, 400)).toBe(20);
    expect(subtitleWordWidthPixels(1, 2, 10, 20, 400)).toBe(0);
  });

  it("hides labels only when their exact rendered interval is too narrow", () => {
    expect(isCompactSubtitleWord(21.99)).toBe(true);
    expect(isCompactSubtitleWord(22)).toBe(false);
    expect(isCompactSubtitleWord(96)).toBe(false);
    expect(isCompactSubtitleWord(Number.NaN)).toBe(true);
  });

  it("shows non-overlapping readable overview labels and reveals more detail as the view zooms in", () => {
    const words = Array.from({ length: 6_000 }, (_, index) => {
      const start = index * 0.15;
      return { text: `word${index}`, start, end: start + 0.12 };
    });

    const overview = readableSubtitleSlots(words, 0, 900, 1_000);
    const zoomed = readableSubtitleSlots(words, 0, 50, 1_000);
    expect(overview.length).toBeGreaterThan(0);
    expect(overview.length).toBeLessThanOrEqual(48);
    expect(zoomed.length).toBeGreaterThan(overview.length);
    expect(overview.every((slot) => slot.text.length > 1)).toBe(true);
    expect(overview.every((slot) => slot.sourceIndex >= 0 && slot.sourceIndex < words.length)).toBe(true);
    expect(overview.every((slot, index) => index === 0 || slot.leftPixels >= overview[index - 1].leftPixels + overview[index - 1].widthPixels)).toBe(true);

    // Coarse labels are visual summaries only: full source timing and source
    // indices remain available to precise hit testing/editing at every zoom.
    for (const index of [0, 1, 537, 2_999, 5_999]) {
      const word = words[index];
      expect(subtitleIndexAtTime(words, (word.start + word.end) / 2)).toBe(index);
    }
    expect(visibleSubtitleIndexes(words, 0, 5, 0)).toEqual(expect.arrayContaining([0, 1, 2, 3, 4]));
  });
});
