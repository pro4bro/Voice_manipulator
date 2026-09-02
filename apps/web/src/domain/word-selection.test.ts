import { describe, expect, it } from "vitest";

import { EMPTY_SELECTION, selectWord, sweepTo, type WordSelection } from "./word-selection";

function selection(indexes: number[], anchor: number | null): WordSelection {
  return { indexes, anchor };
}

describe("selectWord", () => {
  it("builds a list across Ctrl clicks, then Shift adds a run from the last one", () => {
    // The worked example: Ctrl 1, 5, 9 then Shift to 12 leaves 1, 5, 9, 10, 11, 12.
    let current = selectWord(EMPTY_SELECTION, 1, { ctrl: true });
    current = selectWord(current, 5, { ctrl: true });
    current = selectWord(current, 9, { ctrl: true });
    expect(current.indexes).toEqual([1, 5, 9]);

    current = selectWord(current, 12, { shift: true });
    expect(current.indexes).toEqual([1, 5, 9, 10, 11, 12]);
    expect(current.anchor).toBe(12);
  });

  it("Ctrl on a word already held removes it", () => {
    const current = selectWord(selection([1, 5, 9], 9), 5, { ctrl: true });
    expect(current.indexes).toEqual([1, 9]);
  });

  it("Alt subtracts a single word", () => {
    const current = selectWord(selection([1, 2, 3], 3), 2, { alt: true });
    expect(current.indexes).toEqual([1, 3]);
  });

  it("Alt with Shift subtracts the whole run", () => {
    const current = selectWord(selection([1, 2, 3, 4, 5], 2), 4, { alt: true, shift: true });
    expect(current.indexes).toEqual([1, 5]);
  });

  it("a plain click on a word outside the list starts over", () => {
    const current = selectWord(selection([1, 5, 9], 9), 20);
    expect(current.indexes).toEqual([20]);
    expect(current.anchor).toBe(20);
  });

  it("a plain click inside the list keeps it, so the group can be dragged", () => {
    const current = selectWord(selection([1, 5, 9], 1), 5);
    expect(current.indexes).toEqual([1, 5, 9]);
    expect(current.anchor).toBe(5);
  });

  it("Shift with nothing selected yet just takes the word", () => {
    const current = selectWord(EMPTY_SELECTION, 7, { shift: true });
    expect(current.indexes).toEqual([7]);
  });
});

describe("sweepTo", () => {
  it("an unmodified sweep replaces whatever was selected", () => {
    const current = sweepTo(selection([1, 5, 9], 9), 3, 6);
    expect(current.indexes).toEqual([3, 4, 5, 6]);
  });

  it("a Ctrl sweep adds its run to the existing list", () => {
    const current = sweepTo(selection([1, 5, 9], 9), 20, 22, { ctrl: true });
    expect(current.indexes).toEqual([1, 5, 9, 20, 21, 22]);
  });

  it("an Alt sweep removes its run", () => {
    const current = sweepTo(selection([1, 2, 3, 4, 5], 5), 2, 4, { alt: true });
    expect(current.indexes).toEqual([1, 5]);
  });

  it("reversing direction recomputes rather than accumulating", () => {
    const base = selection([], null);
    const forward = sweepTo(base, 5, 8);
    expect(forward.indexes).toEqual([5, 6, 7, 8]);
    const back = sweepTo(base, 5, 3);
    expect(back.indexes).toEqual([3, 4, 5]);
  });

  it("the anchor follows the word under the pointer, so Shift continues from there", () => {
    const swept = sweepTo(EMPTY_SELECTION, 3, 6);
    expect(swept.anchor).toBe(6);
    const extended = selectWord(swept, 9, { shift: true });
    expect(extended.indexes).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
});
