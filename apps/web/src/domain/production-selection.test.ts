import { expect, it } from "vitest";
import { hasMultipleSelectionRanges, productionRanges, selectProductionTime, selectProductionWord, sweepProductionWords } from "./production-selection";
const empty = { indexes: [], anchor: null };
const words = [{ start: 1, end: 2 }, { start: 2.5, end: 3 }, { start: 7, end: 8 }];

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
