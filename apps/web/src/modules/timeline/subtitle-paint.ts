import { readableColor } from "../../domain/accessible-color";
import type { ContrastPair, ContrastPalette } from "../../ui/color-theme";

/** Manual text uses one blue classification, recalculated against each opaque UI state. */
export function manualSubtitleColors(contrast: ContrastPalette): {
  plain: ContrastPair;
  selection: ContrastPair;
  active: ContrastPair;
  collision: ContrastPair;
} {
  const on = (background: string): ContrastPair => ({
    background,
    foreground: readableColor("#1a5fa7", background),
  });

  return {
    plain: on(contrast.word),
    selection: on(contrast.selection.background),
    active: on(contrast.active.background),
    collision: on(contrast.timingCollision.background),
  };
}
