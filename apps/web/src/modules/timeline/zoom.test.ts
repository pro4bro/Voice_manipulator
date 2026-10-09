import { expect, it } from "vitest";

import { minimumTimelineSpan, timelineSpanAtZoomPosition, timelineZoomPosition, timelineZoomResolution } from "./zoom";

it("uses one 1,000-pixel-per-second density rule for every timeline zoom control", () => {
  expect(minimumTimelineSpan(900, 1_000)).toBe(1);
  expect(minimumTimelineSpan(900, 500)).toBe(0.5);
  expect(timelineZoomResolution(1, 1_000)).toBe("0.01s / 10px");
  expect(timelineZoomResolution(0.5, 500)).toBe("0.01s / 10px");
  expect(timelineSpanAtZoomPosition(0, 900, 1)).toBe(900);
  expect(timelineSpanAtZoomPosition(1_000, 900, 1)).toBe(1);
  expect(timelineZoomPosition(900, 900, 1)).toBe(0);
  expect(timelineZoomPosition(900, 1, 1)).toBe(1_000);
});

it("fits footage shorter than the normal minimum span", () => {
  expect(minimumTimelineSpan(0.5, 1_000)).toBe(0.5);
  expect(timelineSpanAtZoomPosition(0, 0.5, 0.5)).toBe(0.5);
  expect(timelineSpanAtZoomPosition(1_000, 0.5, 0.5)).toBe(0.5);
});

it("fits footage shorter than ten milliseconds without imposing a minimum window", () => {
  expect(minimumTimelineSpan(0.005, 1_000)).toBe(0.005);
  expect(timelineSpanAtZoomPosition(0, 0.005, 0.005)).toBe(0.005);
  expect(timelineSpanAtZoomPosition(1_000, 0.005, 0.005)).toBe(0.005);
  expect(timelineZoomResolution(0.005, 1_000)).toBe("0.0001s / 10px");
});
