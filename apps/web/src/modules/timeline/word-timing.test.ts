import { describe, expect, it } from "vitest";

import type { StudioWord } from "../../domain/types";
import { MINIMUM_WORD_SECONDS, applyWordDrag, assignWordInterval, canDuplicateWordsAtTime, duplicateWordsAtTime } from "./word-timing";

function words(spec: Array<[string, number, number]>): StudioWord[] {
  return spec.map(([text, start, end]) => ({ text, start, end })) as StudioWord[];
}

describe("duplicateWordsAtTime", () => {
  const source = words([["xin", 1, 1.4], ["chào", 1.5, 1.9], ["anh", 2, 2.4]]);
  it("places a selected group at the exact drop time and preserves the original words", () => {
    const result = duplicateWordsAtTime(source, [0, 1], 3, 8)!;
    expect(result.insertedIndexes).toEqual([3, 4]);
    expect(result.words.slice(0, 3)).toEqual(source);
    expect(result.words.slice(3).map((word) => word.text)).toEqual(["xin", "chào"]);
    expect(result.words[3].start).toBeCloseTo(3);
    expect(result.words[3].end).toBeCloseTo(3.4);
    expect(result.words[4].start).toBeCloseTo(3.5);
    expect(result.words[4].end).toBeCloseTo(3.9);
    expect(result.words[3]).toMatchObject({ timingTrusted: false, timingSource: "user-interpolated" });
  });
  it("ripples occupied subtitles without retaining false source timing trust", () => {
    const result = duplicateWordsAtTime(source, [0], 1.6, 8)!;
    expect(result.insertedIndexes).toEqual([1]);
    expect(result.words.map((word) => word.text)).toEqual(["xin", "xin", "chào", "anh"]);
    expect(result.words[1]).toMatchObject({ start: 1.6, end: 2, timingTrusted: false });
    expect(result.words[2]).toMatchObject({ start: 2, end: 2.4, timingTrusted: false,
      sourceTiming: { start: 1.5, end: 1.9 } });
    expect(result.words[3].start).toBeCloseTo(2.5);
  });
  it("rejects a drop that would send subtitles past the footage end", () => {
    expect(canDuplicateWordsAtTime(source, [0, 1], 2, 2.5)).toBe(false);
    expect(duplicateWordsAtTime(source, [0, 1], 2, 2.5)).toBeNull();
    expect(duplicateWordsAtTime(source, [0], 1.9, 2.5)).toBeNull();
    expect(canDuplicateWordsAtTime(source, [0], 3, 8)).toBe(true);
  });
});

describe("applyWordDrag", () => {
  const three = words([["a", 1, 1.4], ["b", 1.5, 1.9], ["c", 2, 2.4]]);

  it("moves the selection, and the neighbour it meets gives way", () => {
    // The recogniser packs words end to end, so a rule that merely forbade
    // overlap would leave every word wedged in place and the edit useless.
    // "b" travels until "c" is down to the floor that keeps it selectable.
    const moved = applyWordDrag(three, [1], "move", 1.0, { duration: 10 });
    expect(moved[1].start).toBeCloseTo(1.96, 3);
    expect(moved[1].end).toBeCloseTo(2.36, 3);
    expect(moved[2].start).toBeCloseTo(2.36, 3);
    expect(moved[2].end - moved[2].start).toBeGreaterThanOrEqual(MINIMUM_WORD_SECONDS - 1e-9);
    expect(moved[0]).toEqual(three[0]);
  });

  it("carries several selected words together", () => {
    const moved = applyWordDrag(three, [0, 1], "move", 0.05, { duration: 10 });
    expect(moved[0].start).toBeCloseTo(1.05, 3);
    expect(moved[1].start).toBeCloseTo(1.55, 3);
    expect(moved[2]).toEqual(three[2]);
  });

  it("trims the in point, taking the space from the word before it", () => {
    const trimmed = applyWordDrag(three, [1], "trim-start", -0.2, { duration: 10 });
    expect(trimmed[1].start).toBeCloseTo(1.3, 3);
    expect(trimmed[1].end).toBeCloseTo(1.9, 3);
    expect(trimmed[0].end).toBeCloseTo(1.3, 3);
    expect(trimmed[0].start).toBeCloseTo(1, 3);
  });

  it("never lets an edge pass through its own word", () => {
    const trimmed = applyWordDrag(three, [1], "trim-start", 5, { duration: 10 });
    expect(trimmed[1].start).toBeLessThan(trimmed[1].end);
  });

  it("marks what a person moved as theirs, and trusted", () => {
    // The recogniser's provenance would be a lie once a human has moved it.
    const moved = applyWordDrag(three, [1], "move", 0.05, { duration: 10 });
    expect(moved[1].timingSource).toBe("manual");
    expect(moved[1].timingTrusted).toBe(true);
    expect(moved[0].timingSource).toBeUndefined();
  });

  it.each(["move", "trim-start", "trim-end"] as const)("applies fractional %s deltas without snapping or rounding", (mode) => {
    const roomy = words([["a", 1, 1.4], ["b", 1.5, 1.9], ["c", 5, 5.4]]);
    for (const delta of [-.00001, .00001, .025, .1]) {
      const edited = applyWordDrag(roomy, [1], mode, delta, { duration: 10 });
      expect(edited[1].start).toBeCloseTo(1.5 + (mode === "trim-end" ? 0 : delta), 9);
      expect(edited[1].end).toBeCloseTo(1.9 + (mode === "trim-start" ? 0 : delta), 9);
      expect(edited[0]).toBe(roomy[0]); expect(edited[2]).toBe(roomy[2]);
    }
  });

  it("keeps word order and a visible neighbour when movement meets its limit", () => {
    const edited = applyWordDrag(three, [1], "move", 1.0, { duration: 10 });
    expect(edited[2].start).toBeGreaterThanOrEqual(edited[1].end - 1e-9);
    expect(edited[2].end - edited[2].start).toBeGreaterThanOrEqual(MINIMUM_WORD_SECONDS - 1e-9);
  });
});

describe("atomic promoted timing", () => {
  const source = words([["a", 1, 3], ["b", 3.1, 4.1], ["c", 5, 6]]);
  it("does not trim an untouched neighbour while temporarily moving a long word", () => {
    const edit = assignWordInterval(source, 0, 2, 2.5, 10);
    expect(edit.words[0]).toMatchObject({ start: 2, end: 2.5, timingSource: "manual" });
    expect(edit.words[1]).toBe(source[1]);
    expect(edit.collisionIndexes).toEqual([]);
  });
  it("keeps an unselected word between noncontiguous selections ordered and ten-percent wide", () => {
    const three = words([["a", 1, 1.4], ["b", 1.5, 1.9], ["c", 2, 2.4]]);
    const moved = applyWordDrag(three, [0, 2], "move", 1, { duration: 10 });
    expect(moved[0].end).toBeLessThanOrEqual(moved[1].start);
    expect(moved[1].end).toBeLessThanOrEqual(moved[2].start);
    expect(moved[1].end - moved[1].start).toBeGreaterThanOrEqual(.04 - 1e-9);
  });
  it("warns on touching and preserves ten percent when overrunning a neighbour", () => {
    expect(assignWordInterval(source, 0, 1, 3.1, 10).collisionIndexes).toEqual([1]);
    const edit = assignWordInterval(source, 0, 1, 9, 10);
    expect(edit.words[0].end).toBeCloseTo(4, 6);
    expect(edit.words[1].start).toBeCloseTo(4, 6);
    expect(edit.words[1].end - edit.words[1].start).toBeCloseTo(.1, 6);
    expect(edit.words[2]).toBe(source[2]);
  });
  it("preserves ten percent of the preceding word on a reverse drag", () => {
    const edit = assignWordInterval(source, 1, 0, 4.1, 10);
    expect(edit.words[0].end - edit.words[0].start).toBeCloseTo(.2, 6);
    expect(edit.words[1].start).toBeCloseTo(1.2, 6);
    expect(edit.words[2]).toBe(source[2]);
  });
  it("does not erase sub-millisecond words with rounding or a fixed minimum trim width", () => {
    const tiny = words([["a", .5, .5000001], ["b", .5000002, .5000003], ["c", .5000004, .5000005]]);
    for (const mode of ["trim-start", "trim-end", "move"] as const) {
      const next = applyWordDrag(tiny, [1], mode, 1, { duration: 1 });
      expect(next[0].end).toBeGreaterThan(next[0].start);
      expect(next[1].end).toBeGreaterThan(next[1].start);
      expect(next[2].end).toBeGreaterThan(next[2].start);
      expect(next[0].end).toBeLessThanOrEqual(next[1].start);
      expect(next[1].end).toBeLessThanOrEqual(next[2].start);
    }
  });
});
