import { describe, expect, it } from "vitest";
import { clippingRanges } from "./clipping-overflow";

describe("clippingRanges", () => {
  it("keeps isolated over-threshold buckets narrow and does not bridge gaps", () => {
    const ranges = clippingRanges([
      { min: -0.2, max: 0.2 },
      { min: -1.1, max: 0.1 },
      { min: -0.1, max: 0.3 },
      { min: -0.1, max: 1.2 },
      { min: -0.2, max: 0.2 },
    ], 1);

    expect(ranges).toEqual([{ start: 1, end: 2 }, { start: 3, end: 4 }]);
  });

  it("merges only adjacent over-threshold buckets", () => {
    expect(clippingRanges([
      { min: 1.1, max: 0.2 },
      { min: -0.2, max: 1.4 },
      { min: 0, max: 0.2 },
      { min: -1.3, max: 0 },
    ], 1)).toEqual([{ start: 0, end: 2 }, { start: 3, end: 4 }]);
  });
});
