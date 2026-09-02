import { describe, expect, it } from "vitest";

import type { StudioWord } from "../../domain/types";
import { MINIMUM_WORD_SECONDS, acousticEdges, applyWordDrag, snapToEdge } from "./word-timing";

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
    expect(moved[1].start).toBeCloseTo(1.98, 3);
    expect(moved[1].end).toBeCloseTo(2.38, 3);
    expect(moved[2].start).toBeCloseTo(2.38, 3);
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
