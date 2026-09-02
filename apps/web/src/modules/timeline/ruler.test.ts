import { describe, expect, it } from "vitest";

import { rulerLabel, rulerMarks, rulerStep } from "./ruler";

describe("rulerStep", () => {
  it("walks down the units as the view is zoomed in", () => {
    // Same 1133 px of track, showing less and less time.
    expect(rulerStep(7200, 1133)).toBeGreaterThanOrEqual(600);
    expect(rulerStep(600, 1133)).toBe(60);
    expect(rulerStep(60, 1133)).toBe(5);
    expect(rulerStep(6, 1133)).toBe(0.5);
    expect(rulerStep(0.6, 1133)).toBe(0.05);
    expect(rulerStep(0.06, 1133)).toBe(0.005);
  });

  it("never puts marks closer together than they can be read", () => {
    for (const duration of [0.05, 1, 37, 236, 3600, 12000]) {
      const step = rulerStep(duration, 1133);
      expect((step / duration) * 1133).toBeGreaterThanOrEqual(88);
    }
  });
});

describe("rulerLabel", () => {
  it("writes a mark precisely enough to tell it from its neighbour", () => {
    expect(rulerLabel(12.25, 0.05)).toBe("12.25s");
    expect(rulerLabel(12.25, 0.005)).toBe("12.250s");
    expect(rulerLabel(12, 1)).toBe("12s");
  });

  it("brings in minutes and hours as the numbers get long", () => {
    expect(rulerLabel(90, 5)).toBe("1:30");
    expect(rulerLabel(3661, 60)).toBe("1:01:01");
  });
});

describe("rulerMarks", () => {
  it("covers the whole duration and starts at zero", () => {
    const marks = rulerMarks(236, 1133);
    expect(marks[0].time).toBe(0);
    expect(marks[marks.length - 1].time).toBeLessThanOrEqual(236);
    expect(marks[marks.length - 1].position).toBeLessThanOrEqual(1);
  });

  it("gives nothing rather than dividing by a width it has not measured yet", () => {
    expect(rulerMarks(236, 0)).toEqual([]);
  });

  it("builds only the marks in view, so a deep zoom stays cheap", () => {
    // Zoomed right in: a 236 s take stretched over 212,000 px.
    const all = rulerMarks(236, 212000);
    const windowed = rulerMarks(236, 212000, { left: 100000, width: 1100 });
    expect(windowed.length).toBeLessThan(20);
    expect(windowed.length).toBeLessThan(all.length);
    // And they are the marks around where the user is actually looking.
    const centre = (100000 / 212000) * 236;
    expect(windowed[0].time).toBeLessThanOrEqual(centre);
    expect(windowed[windowed.length - 1].time).toBeGreaterThanOrEqual(centre);
  });

  it("marks the far end of a long take, not just the beginning", () => {
    const nearEnd = rulerMarks(236, 212000, { left: 211000, width: 1100 });
    expect(nearEnd.length).toBeGreaterThan(0);
    expect(nearEnd[nearEnd.length - 1].time).toBeGreaterThan(234);
  });
});
