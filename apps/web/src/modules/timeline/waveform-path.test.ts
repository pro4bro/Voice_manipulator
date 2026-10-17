import { describe, expect, it } from "vitest";

import { waveformBucketX, waveformEnvelopePath, waveformY } from "./waveform-path";

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

  it("scales half and double gain quantitatively", () => {
    const point = [{ x: 500, min: -0.5, max: 0.5 }];
    expect(waveformEnvelopePath(point, 60, 0.5))
      .toBe("M499.40 23.10L500.60 23.10L500.60 36.90L499.40 36.90Z");
    expect(waveformEnvelopePath(point, 60, 2))
      .toBe("M499.40 2.40L500.60 2.40L500.60 57.60L499.40 57.60Z");
  });

  it("renders muted envelopes on the centerline", () => {
    expect(waveformEnvelopePath([
      { x: 0, min: -0.8, max: 0.4 },
      { x: 1000, min: -0.2, max: 0.9 },
    ], 60, 0)).toBe("M0.00 30.00L1000.00 30.00L1000.00 30.00L0.00 30.00Z");
  });

  it("clips amplified peaks at full scale while preserving NaN gaps", () => {
    expect(waveformEnvelopePath([
      { x: 0, min: -0.75, max: 0.75 },
      { x: 100, min: -0.25, max: 0.25 },
      { x: 200, min: Number.NaN, max: Number.NaN },
      { x: 300, min: -0.75, max: 0.75 },
      { x: 400, min: -0.25, max: 0.25 },
    ], 60, 2)).toBe("M0.00 2.40L100.00 16.20L100.00 43.80L0.00 57.60ZM300.00 2.40L400.00 16.20L400.00 43.80L300.00 57.60Z");
  });
});


it("places PCM bins on their start clock, including a long recording midpoint", () => {
  expect(waveformBucketX(512, 1024, 600)).toBe(300);
  expect(waveformBucketX(1023, 1024, 600)).toBe(599.4140625);
  expect(waveformBucketX(0, 1, 600)).toBe(0);
});
