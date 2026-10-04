import { describe, expect, it } from "vitest";

import { waveformEnvelopePath, waveformY } from "./waveform-path";

describe("waveformEnvelopePath", () => {
  it("shares the Timeline canvas centerline and peak scale", () => {
    expect([waveformY(0, 100), waveformY(1, 100), waveformY(-1, 100)])
      .toEqual([50, 4, 96]);
  });

  it("draws the same closed peak silhouette around the center line", () => {
    expect(waveformEnvelopePath([
      { x: 0, min: -0.5, max: 0.5 },
      { x: 1000, min: -1, max: 1 },
    ])).toBe("M0.00 16.20L1000.00 2.40L1000.00 57.60L0.00 43.80Z");
  });

  it("keeps missing live PCM as a break between visible waveform sections", () => {
    expect(waveformEnvelopePath([
      { x: 0, min: -0.5, max: 0.5 },
      { x: 100, min: -0.25, max: 0.25 },
      { x: 200, min: Number.NaN, max: Number.NaN },
      { x: 300, min: -0.25, max: 0.25 },
      { x: 400, min: -0.5, max: 0.5 },
    ])).toBe("M0.00 16.20L100.00 23.10L100.00 36.90L0.00 43.80ZM300.00 23.10L400.00 16.20L400.00 43.80L300.00 36.90Z");
  });

  it("keeps a one-bin envelope visible as a narrow filled peak", () => {
    expect(waveformEnvelopePath([{ x: 500, min: -0.5, max: 0.5 }]))
      .toBe("M499.40 16.20L500.60 16.20L500.60 43.80L499.40 43.80Z");
  });
});
