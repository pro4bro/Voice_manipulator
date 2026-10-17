import { expect, it } from "vitest";
import { selectionReadoutLayout } from "./selection-readout";

it("keeps a wide selection's IN, duration, and OUT markers aligned to the interval", () => {
  const layout = selectionReadoutLayout({ start: 300, end: 700, duration: 1000, canvasWidth: 1000, viewportLeft: 0, viewportWidth: 1000 });
  expect(layout.in.x).toBe(300);
  expect(layout.out.x).toBe(700);
  expect(layout.duration.x).toBe(500);
  expect(layout.duration.row).toBe(0);
  expect(layout.in.x + layout.in.width / 2).toBeLessThan(layout.duration.x - layout.duration.width / 2);
  expect(layout.duration.x + layout.duration.width / 2).toBeLessThan(layout.out.x - layout.out.width / 2);
});

it("moves duration to one compact second row when a narrow interval cannot fit all three values", () => {
  const layout = selectionReadoutLayout({ start: 400, end: 420, duration: 1000, canvasWidth: 1000, viewportLeft: 0, viewportWidth: 1000 });
  expect(layout.duration.x).toBe(410);
  expect(layout.duration.row).toBe(1);
  expect(layout.in.x + layout.in.width / 2).toBeLessThanOrEqual(layout.out.x - layout.out.width / 2);
  expect(Math.max(layout.in.row, layout.out.row, layout.duration.row)).toBe(1);
});

it.each([
  { start: 10, end: 80, viewportLeft: 0, viewportWidth: 500 },
  { start: 420, end: 460, viewportLeft: 400, viewportWidth: 200 },
  { start: 900, end: 980, viewportLeft: 800, viewportWidth: 200 },
  { start: 10, end: 30, viewportLeft: 400, viewportWidth: 100 },
])("clamps all readout numbers inside visible bounds for $start..$end", ({ start, end, viewportLeft, viewportWidth }) => {
  const layout = selectionReadoutLayout({ start, end, duration: 1000, canvasWidth: 1000, viewportLeft, viewportWidth });
  for (const marker of [layout.in, layout.duration, layout.out]) {
    expect(marker.x - marker.width / 2).toBeGreaterThanOrEqual(viewportLeft);
    expect(marker.x + marker.width / 2).toBeLessThanOrEqual(viewportLeft + viewportWidth);
  }
});

it("marks fully offscreen ranges as hidden while retaining viewport-safe edge positions", () => {
  const layout = selectionReadoutLayout({ start: 10, end: 30, duration: 1000, canvasWidth: 1000, viewportLeft: 400, viewportWidth: 100 });
  expect(layout.visible).toBe(false);
  expect(layout.in.x).toBeGreaterThanOrEqual(400);
  expect(layout.out.x).toBeLessThanOrEqual(500);
});

it.each([{ start: 0, end: 1 }, { start: 999, end: 1000 }])("keeps edge-clamped narrow readouts from covering one another ($start)", ({ start, end }) => {
  const layout = selectionReadoutLayout({ start, end, duration: 1000, canvasWidth: 1000, viewportLeft: 0, viewportWidth: 1000 });
  const markers = [layout.in, layout.out, layout.duration];
  for (let i = 0; i < markers.length; i += 1) for (let j = i + 1; j < markers.length; j += 1) {
    const a = markers[i], b = markers[j];
    expect(a.row !== b.row || Math.abs(a.x - b.x) >= (a.width + b.width) / 2).toBe(true);
  }
});
