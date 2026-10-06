import { describe, expect, it } from "vitest";
import { excludedTimelineRanges, nextPlayableTime, restoreTimelineSections, timelineSections } from "./timeline-editing";
describe("source-time working regions", () => {
  it("uses marks and deletions for playback without modifying source time", () => {
    const excluded = excludedTimelineRanges(10, [{ id: "cut", start: 4, end: 6 }], { id: "work", start: 2, end: 8 });
    expect(nextPlayableTime(0, 10, excluded)).toBe(2);
    expect(nextPlayableTime(5, 10, excluded)).toBe(6);
    expect(nextPlayableTime(8, 10, excluded)).toBe(10);
  });
  it("cuts at points independently of marks", () => {
    expect(timelineSections(10, [3, 7]).map(({ start, end }) => [start, end])).toEqual([[0, 3], [3, 7], [7, 10]]);
  });
  it("uncuts one section without restoring unrelated merged deleted sections", () => {
    expect(restoreTimelineSections([{ id: "merged", start: 0, end: 9 }], [{ id: "selected", start: 3, end: 6 }]).map(({ start, end }) => [start, end])).toEqual([[0, 3], [6, 9]]);
  });
});
