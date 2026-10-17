import type { CSSProperties } from "react";
import { compositeColor, contrastRatio, readableColor } from "../../domain/accessible-color";
import { useContrastPalette } from "../../ui/color-theme";
import { selectionReadoutLayout } from "./selection-readout";
import "./selection-readout.css";

export type SelectionReadoutProps = {
  range: { id: string; start: number; end: number };
  duration: number;
  canvasWidth: number;
  viewportLeft: number;
  viewportWidth: number;
  displayStart?: number;
  displayEnd?: number;
};

function seconds(value: number): string {
  return `${value.toFixed(3)}s`;
}

function accentForAudioReadout(accent: string, audio: string): string {
  const backgrounds = [audio, compositeColor(accent, audio, 0.3)];
  const candidates = backgrounds.map((background) => readableColor(accent, background, 4.5));
  const passing = candidates.find((candidate) => backgrounds.every((background) => contrastRatio(candidate, background) >= 4.5));
  if (passing) return passing;
  return [...candidates, "#000000", "#ffffff"].sort((a, b) =>
    Math.min(...backgrounds.map((background) => contrastRatio(a, background))) -
    Math.min(...backgrounds.map((background) => contrastRatio(b, background)))).at(-1)!;
}

export function SelectionReadout({ range, duration, canvasWidth, viewportLeft, viewportWidth, displayStart = range.start, displayEnd = range.end }: SelectionReadoutProps) {
  const palette = useContrastPalette();
  const tokenAccent = typeof window === "undefined" ? "" : window.getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const foreground = accentForAudioReadout(tokenAccent || "#ff6745", palette.audio);
  const layout = selectionReadoutLayout({ ...range, duration, canvasWidth, viewportLeft, viewportWidth, displayStart, displayEnd });
  if (!layout.visible) return null;
  const origin = range.start / Math.max(duration, 0.001) * canvasWidth;
  const values = [
    { key: "in", value: seconds(displayStart), label: `IN ${displayStart.toFixed(3)} seconds`, marker: layout.in },
    { key: "duration", value: seconds(displayEnd - displayStart), label: `Duration ${(displayEnd - displayStart).toFixed(3)} seconds`, marker: layout.duration },
    { key: "out", value: seconds(displayEnd), label: `OUT ${displayEnd.toFixed(3)} seconds`, marker: layout.out },
  ];
  return <div className="selection-readout" aria-hidden="false" style={{ "--readout-font-size": `${layout.fontSize}px`, "--readout-foreground": foreground } as CSSProperties}>
    {values.map(({ key, value, label, marker }) => <span key={key} aria-label={label} className={`selection-readout__value selection-readout__value--${key}`} style={{ "--readout-x": `${marker.x - origin}px`, "--readout-width": `${marker.width}px`, top: "4px", color: foreground } as CSSProperties}>
      <span className="selection-readout__screen-reader">{label}</span>{value}
    </span>)}
  </div>;
}
