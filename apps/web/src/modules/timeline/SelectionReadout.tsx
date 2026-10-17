import type { CSSProperties } from "react";
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

export function SelectionReadout({ range, duration, canvasWidth, viewportLeft, viewportWidth, displayStart = range.start, displayEnd = range.end }: SelectionReadoutProps) {
  const layout = selectionReadoutLayout({ ...range, duration, canvasWidth, viewportLeft, viewportWidth });
  if (!layout.visible) return null;
  const origin = range.start / Math.max(duration, 0.001) * canvasWidth;
  const values = [
    { key: "in", value: seconds(displayStart), label: `IN ${displayStart.toFixed(3)} seconds`, marker: layout.in },
    { key: "duration", value: seconds(displayEnd - displayStart), label: `Duration ${(displayEnd - displayStart).toFixed(3)} seconds`, marker: layout.duration },
    { key: "out", value: seconds(displayEnd), label: `OUT ${displayEnd.toFixed(3)} seconds`, marker: layout.out },
  ];
  return <div className="selection-readout" aria-hidden="false">
    {values.map(({ key, value, label, marker }) => <span key={key} aria-label={label} className={`selection-readout__value selection-readout__value--${key}`} style={{ "--readout-x": `${marker.x - origin}px`, "--readout-width": `${marker.width}px`, "--readout-row": marker.row } as CSSProperties}>
      <span className="selection-readout__screen-reader">{label}</span>{value}
    </span>)}
  </div>;
}
