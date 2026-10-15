import { describe, expect, it } from "vitest";
import { mapStretchTime, stretchFromDrag } from "./voice-edits";

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
});
