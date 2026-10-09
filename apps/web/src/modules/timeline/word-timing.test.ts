import { describe, expect, it } from "vitest";

import type { StudioWord } from "../../domain/types";
import { MINIMUM_WORD_SECONDS, acousticEdges, applyWordDrag, assignWordInterval, snapToEdge } from "./word-timing";

function words(spec: Array<[string, number, number]>): StudioWord[] {
  return spec.map(([text, start, end]) => ({ text, start, end })) as StudioWord[];
}

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

  it("prefers a nearby acoustic edge over the exact pointer position", () => {
    // Room to spare, so the snap is what decides the landing spot.
    const roomy = words([["a", 1, 1.4], ["b", 1.5, 1.9], ["c", 5, 5.4]]);
    const snapped = applyWordDrag(roomy, [1], "move", 0.1, { duration: 10, edges: [1.62] });
    expect(snapped[1].start).toBeCloseTo(1.62, 3);
  });

  it("ignores an acoustic edge that is too far to be what was meant", () => {
    const roomy = words([["a", 1, 1.4], ["b", 1.5, 1.9], ["c", 5, 5.4]]);
    const snapped = applyWordDrag(roomy, [1], "move", 0.1, { duration: 10, edges: [1.95] });
    expect(snapped[1].start).toBeCloseTo(1.6, 3);
  });

  it("order outranks a snap target: a word never passes its neighbour", () => {
    // Yielding is not reordering. Whatever the snap asks for, "c" stays after
    // "b" and keeps a width - the transcript is what puts them in this order.
    const snapped = applyWordDrag(three, [1], "move", 1.0, { duration: 10, edges: [2.5] });
    expect(snapped[2].start).toBeGreaterThanOrEqual(snapped[1].end - 1e-9);
    expect(snapped[2].end - snapped[2].start).toBeGreaterThanOrEqual(MINIMUM_WORD_SECONDS - 1e-9);
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

describe("acousticEdges", () => {
  it("finds where the drawn waveform starts", () => {
    const quiet = { min: -0.001, max: 0.001 };
    const loud = { min: -0.5, max: 0.5 };
    const edges = acousticEdges({
      start: 0,
      end: 1,
      points: [...Array(50).fill(quiet), ...Array(50).fill(loud)],
    });
    expect(edges.some((edge) => Math.abs(edge - 0.5) < 0.05)).toBe(true);
  });

  it("returns nothing for a window with no envelope", () => {
    expect(acousticEdges(null)).toEqual([]);
    expect(acousticEdges({ start: 0, end: 1, points: [] })).toEqual([]);
  });
});

describe("snapToEdge", () => {
  it("leaves a time alone when no edge is close", () => {
    expect(snapToEdge(1.0, [5.0])).toBe(1.0);
  });
});
