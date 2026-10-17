import { describe, expect, it } from "vitest";

import { compositeColor, contrastRatio, readableColor } from "./accessible-color";

describe("accessible color helpers", () => {
  it("keeps preferred colors that already meet WCAG AA", () => {
    expect(readableColor("#1c1f1b", "#faf7ef")).toBe("#1c1f1b");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 4);
  });

  it.each([
    ["#18d9ff", "#faf7ef"], ["#b9ff38", "#f3f0e7"], ["#ff4b52", "#ffffff"],
    ["rgb(24 217 255)", "#fffdf8"], ["#888", "#fff"],
  ])("resolves %s on %s to at least 4.5:1", (foreground, background) => {
    const resolved = readableColor(foreground, background);
    expect(contrastRatio(resolved, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("composites translucent backgrounds before evaluating foreground contrast", () => {
    const blended = compositeColor("#24384b", "#faf7ef", 0.34);
    expect(blended).toMatch(/^#[\da-f]{6}$/iu);
    expect(contrastRatio(readableColor("#18d9ff", blended), blended)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["#fff", "#000000", "#ffffff"], ["#ff000080", "#000000", "#800000"],
    ["rgba(255, 0, 0, 0.5)", "#000000", "#800000"], ["rgba(255 0 0 / 50%)", "#000000", "#800000"],
    ["rgb(255 0 0)", "#000000", "#ff0000"], ["color(srgb 1 0 0 / 50%)", "#000000", "#800000"],
  ])("composites %s against the actual %s backdrop", (foreground, background, expected) => {
    expect(compositeColor(foreground, background, 1)).toBe(expected);
  });

  it("falls back to a readable neutral for unparseable colors", () => {
    expect(contrastRatio(readableColor("var(--speaker-color)", "#ffffff"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(readableColor("var(--speaker-color)", "#808080"), "#808080")).toBeGreaterThanOrEqual(4.5);
  });
});


it("maintains the contrast invariant for a deterministic range of custom RGB colors", () => {
  let seed = 73421;
  const channel = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % 256; };
  const color = () => `rgb(${channel()} ${channel()} ${channel()})`;
  for (let index = 0; index < 1000; index += 1) {
    const preferred = color(), background = color();
    const resolved = readableColor(preferred, background);
    expect(contrastRatio(resolved, background)).toBeGreaterThanOrEqual(4.5);
    if (contrastRatio(preferred, background) >= 4.5) expect(resolved).toBe(preferred);
  }
});
