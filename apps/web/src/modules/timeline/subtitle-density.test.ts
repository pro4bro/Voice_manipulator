import { describe, expect, it } from "vitest";
import { isCompactSubtitleWord, subtitleWordWidthPixels } from "./subtitle-density";

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
});
