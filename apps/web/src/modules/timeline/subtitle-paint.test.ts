import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../domain/accessible-color";
import { contrastPalette } from "../../ui/color-theme";
import { manualSubtitleColors } from "./subtitle-paint";

describe("manual subtitle colors", () => {
  it.each(["light", "dark"] as const)("keeps blue text readable on every %s state surface", (theme) => {
    const palette = contrastPalette(theme);
    const colors = manualSubtitleColors(palette);
    const states = [
      [colors.plain, palette.word],
      [colors.selection, palette.selection.background],
      [colors.active, palette.active.background],
      [colors.collision, palette.timingCollision.background],
    ] as const;

    for (const [pair, background] of states) {
      expect(pair.background).toBe(background);
      expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(4.5);
      expect(pair.foreground.toLowerCase()).not.toBe("#ffffff");
    }
  });

  it("does not depend on speaker paint", () => {
    const palette = contrastPalette("dark");
    expect(manualSubtitleColors(palette)).toEqual(manualSubtitleColors(palette));
  });
});
