import { describe, expect, it } from "vitest";
import { clampPlacement, clipLength, sourceTime, timelineLength } from "./alignment";

describe("LipSync alignment", () => {
  it("maps independent clip starts and in-points to the shared clock", () => {
    expect(sourceTime(1.99, 8, { start: 2, inPoint: 1 })).toBeNull();
    expect(sourceTime(2, 8, { start: 2, inPoint: 1 })).toBe(1);
    expect(sourceTime(4.5, 8, { start: 2, inPoint: 1 })).toBe(3.5);
    expect(sourceTime(9, 8, { start: 2, inPoint: 1 })).toBeNull();
    expect(timelineLength(8, 5, { start: 2, inPoint: 1 }, { start: 0, inPoint: 2 })).toBe(9);
  });

  it("keeps drag and numeric edits finite and inside bounds", () => {
    expect(clampPlacement(-2, 10)).toBe(0);
    expect(clampPlacement(11, 10)).toBe(10);
    expect(clampPlacement(Number.NaN, 10)).toBe(0);
    expect(clampPlacement(1.236, 10)).toBe(1.24);
  });

  it("uses non-destructive OUT trims for video and generated voice", () => {
    expect(clipLength(8, { start: 2, inPoint: 1, outPoint: 4 })).toBe(3);
    expect(sourceTime(4.99, 8, { start: 2, inPoint: 1, outPoint: 4 })).toBe(3.99);
    expect(sourceTime(5, 8, { start: 2, inPoint: 1, outPoint: 4 })).toBeNull();
    expect(timelineLength(8, 5, { start: 2, inPoint: 1, outPoint: 4 }, { start: 0, inPoint: 0, outPoint: 2 })).toBe(5);
  });
});
