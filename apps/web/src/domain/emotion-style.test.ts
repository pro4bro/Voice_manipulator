import { describe, expect, it } from "vitest";
import type { EmotionLabel } from "./types";

import { DEFAULT_EMOTION_STYLE, emotionVisualStyle } from "./emotion-style";
import { compositeColor, contrastRatio } from "./accessible-color";

describe("emotionVisualStyle", () => {
  it("keeps a preferred emotion color when it passes on the active surface", () => {
    const result = emotionVisualStyle("angry", { ...DEFAULT_EMOTION_STYLE, colorMode: "per-emotion", emotionColors: { ...DEFAULT_EMOTION_STYLE.emotionColors, angry: "#333333" } }, "#ffffff");
    expect(result?.color).toBe("#333333");
  });

  it.each(["#faf7ef", "#222520"]) ("keeps emotion text readable on %s", (surface) => {
    const result = emotionVisualStyle("exciting", { ...DEFAULT_EMOTION_STYLE, backgroundEnabled: true }, surface);
    expect(typeof result?.color).toBe("string");
    const effectiveBackground = compositeColor(DEFAULT_EMOTION_STYLE.backgroundColor, surface, DEFAULT_EMOTION_STYLE.backgroundOpacity);
    expect(contrastRatio(String(result?.color), effectiveBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it("resolves custom colors on a plain surface without changing emotion background settings", () => {
    const preferences = { ...DEFAULT_EMOTION_STYLE, colorMode: "per-emotion" as const, emotionColors: { ...DEFAULT_EMOTION_STYLE.emotionColors, sad: "#18d9ff" } };
    const result = emotionVisualStyle("sad", preferences, "#fffdf8");
    expect(contrastRatio(String(result?.color), "#fffdf8")).toBeGreaterThanOrEqual(4.5);
    expect(result?.backgroundColor).toBeUndefined();
  });
});


it("keeps every default/custom emotion readable across themes and opacity endpoints", () => {
  for (const surface of ["#fffdf8", "#151714"]) for (const opacity of [0, .34, .5, 1]) {
    for (const backgroundColor of ["#ffffff", "#000000", "#24384b", "#ffd98a"]) {
      for (const [emotion, preferred] of Object.entries({ ...DEFAULT_EMOTION_STYLE.emotionColors, exciting: "#ffffff", sad: "#151714", angry: "#888888" })) {
        const preferences = { ...DEFAULT_EMOTION_STYLE, colorMode: "per-emotion" as const, backgroundEnabled: true,
          backgroundOpacity: opacity, backgroundColor, emotionColors: { ...DEFAULT_EMOTION_STYLE.emotionColors, [emotion]: preferred } };
        const result = emotionVisualStyle(emotion as EmotionLabel, preferences, surface)!;
        const background = compositeColor(backgroundColor, surface, opacity);
        expect(contrastRatio(String(result.color), background)).toBeGreaterThanOrEqual(4.5);
        if (contrastRatio(preferred, background) >= 4.5) expect(result.color).toBe(preferred);
        if (opacity) expect(result.backgroundColor).toBe(background);
      }
    }
  }
});
