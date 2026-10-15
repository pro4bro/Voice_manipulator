import { describe, expect, it } from "vitest";
import { inverseStretch, mapStretchSelection, mapStretchTime, stretchFromDrag } from "./voice-edits";

describe("whole-block ripple duration controls", () => {
  it("uses inverse left gesture and preserves positive bounds", () => {
    const right = stretchFromDrag(2, 4, 1, "right", 24000);
    const left = stretchFromDrag(2, 4, -1, "left", 24000);
    expect(right.targetFrames).toBe(left.targetFrames);
    expect(mapStretchTime(2, right, 24000)).toBe(2);
    expect(mapStretchTime(3, right, 24000)).toBe(3.5);
    expect(mapStretchTime(5, right, 24000)).toBe(6);
    expect(stretchFromDrag(2, 4, -100, "right", 24000).targetFrames).toBe(24000);
  });
  it("keeps silence-only and disjoint selections through Undo/Redo mapping", () => {
    const operation = stretchFromDrag(2, 4, 1, "right", 24000);
    const selection = { indexes: [], anchor: null, ranges: [{ id: "silence", start: 5, end: 6 }, { id: "inside", start: 2, end: 3 }] };
    const changed = mapStretchSelection(selection, operation, 24000);
    expect(mapStretchSelection(changed, inverseStretch(operation), 24000)).toEqual(selection);
    expect(changed.ranges?.[0]).toEqual({ id: "silence", start: 6, end: 7 });
  });
});
