import { expect, it } from "vitest";
import { hasMultipleSelectionRanges, productionRanges, rangeReadoutBounds, retimeProductionSelection, selectProductionTime, selectProductionWord, sweepProductionWords } from "./production-selection";
const empty = { indexes: [], anchor: null };
const words = [{ start: 1, end: 2 }, { start: 2.5, end: 3 }, { start: 7, end: 8 }];

it("retimes disjoint word ranges while preserving silence padding, source scope and pure-silence ranges", () => {
  const scope = { kind: "asset" as const, id: "source", revision: "r1" };
  const selection = { indexes: [0, 2], anchor: 2, scope, ranges: [
    { id: "pad", start: .8, end: 2.2 }, { id: "silence", start: 4, end: 5 }, { id: "last", start: 7, end: 8 }] };
  const after = [{ start: 1.5, end: 2.5 }, words[1], { start: 8, end: 9 }];
  const retimed = retimeProductionSelection(selection, words, after, 10);
  expect(retimed.ranges).toEqual([{ id: "pad", start: expect.closeTo(1.3, 9), end: expect.closeTo(2.7, 9) }, selection.ranges[1], { id: "last", start: 8, end: 9 }]);
  expect(retimed.indexes).toBe(selection.indexes); expect(retimed.scope).toBe(scope);
  expect(selection.ranges[0].start).toBe(.8);
});

it("scales partial-word selection through trims and clamps padding at source bounds", () => {
  const selection = { indexes: [0], anchor: 0, ranges: [{ id: "part", start: 1.25, end: 1.75 }] };
  expect(retimeProductionSelection(selection, words, [{ start: 2, end: 4 }]).ranges).toEqual([{ id: "part", start: 2.5, end: 3.5 }]);
  const padded = { ...selection, ranges: [{ id: "pad", start: 0, end: 3 }] };
  expect(retimeProductionSelection(padded, words, [{ start: 9, end: 10 }], 10).ranges).toEqual([{ id: "pad", start: 8, end: 10 }]);
});

it("keeps all three timing values in the viewport for narrow selections at either edge and after zooming", () => {
  for (const [start, end, left, width] of [[9.8, 10, 0, 1000], [1.001, 1.005, 100, 240], [0, .01, 0, 300]]) {
    const bounds = rangeReadoutBounds({ id: "range", start, end }, 10, 1000, left, width);
    const absolute = start / 10 * 1000 + bounds.left;
    expect(absolute).toBeGreaterThanOrEqual(left);
    expect(absolute + bounds.width).toBeLessThanOrEqual(left + width);
  }
});

it("keeps exact silence selections and separated ranges without filling the gap", () => {
  const first = selectProductionTime(empty, .2, .7, words);
  expect(first.indexes).toEqual([]);
  const second = selectProductionTime(first, 7.2, 7.6, words, { ctrl: true });
  expect(productionRanges(second, words).map(({ start, end }) => [start, end])).toEqual([[.2, .7], [7.2, 7.6]]);
  expect(second.indexes).toEqual([2]);
  expect(hasMultipleSelectionRanges(second)).toBe(true);
  expect(selectProductionWord(second, 0, words, { ctrl: true }).ranges).toHaveLength(3);
});

it("subtracts a selected middle region and recomputes a reverse sweep from its snapshot", () => {
  const base = selectProductionTime(empty, 0, 9, words);
  const split = selectProductionTime(base, 3, 6, words, { alt: true });
  expect(split.ranges?.map(({ start, end }) => [start, end])).toEqual([[0, 3], [6, 9]]);
  expect(sweepProductionWords(empty, 0, 2, words, {}).indexes).toEqual([0, 1, 2]);
  expect(sweepProductionWords(empty, 0, 1, words, {}).indexes).toEqual([0, 1]);
});

it("retains source revision and detects disjoint legacy word selection", () => {
  const scope = { kind: "voice-output" as const, id: "out", revision: "immutable-revision" };
  expect(selectProductionTime({ ...empty, scope }, 1, 2, words).scope).toEqual(scope);
  expect(hasMultipleSelectionRanges({ indexes: [0, 2], anchor: 2 })).toBe(true);
  expect(productionRanges({ indexes: [0, 2], anchor: 2 }, words)).toHaveLength(2);
});
