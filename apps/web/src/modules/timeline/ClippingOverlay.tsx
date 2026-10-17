import { useEffect, useMemo, useState } from "react";
import type { WaveformPoint } from "../../domain/types";
import { clippingRanges } from "./clipping-overflow";
import "./ClippingOverlay.css";

export interface ClippingOverlayProps {
  points: WaveformPoint[];
  gain: number;
  windowStart: number;
  windowDuration: number;
  duration: number;
  autoCalibrate: boolean;
  autoHide: boolean;
  sourceKey: string;
  visibleWindow?: boolean;
}

export function ClippingOverlay({
  points,
  gain,
  windowStart,
  windowDuration,
  duration,
  autoCalibrate,
  autoHide,
  sourceKey,
  visibleWindow = true,
}: ClippingOverlayProps) {
  const ranges = useMemo(() => clippingRanges(points, gain), [points, gain]);
  const hasClipping = ranges.length > 0;
  const [visible, setVisible] = useState(hasClipping);

  useEffect(() => {
    setVisible(hasClipping);
    if (!hasClipping || !autoHide) return;
    const timeout = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [sourceKey, gain, hasClipping, autoHide]);

  const safeDuration = Math.max(duration, 0.001);
  const safeWindowDuration = Math.max(windowDuration, 0);
  const path = ranges.map(({ start, end }) => {
    const rangeStart = windowStart + (start / Math.max(points.length, 1)) * safeWindowDuration;
    const rangeEnd = windowStart + (end / Math.max(points.length, 1)) * safeWindowDuration;
    const left = (rangeStart / safeDuration) * 1000;
    const right = (rangeEnd / safeDuration) * 1000;
    return `M ${left} 0 H ${right} V 100 H ${left} Z`;
  }).join(" ");

  if (!visible || !hasClipping || !visibleWindow) return null;
  return (
    <svg
      aria-label={autoCalibrate ? "Vùng đã auto calibrate" : "Vùng gain bị clipping"}
      className={`clipping-overlay${autoCalibrate ? " is-calibrated" : ""}`}
      fillRule="nonzero"
      preserveAspectRatio="none"
      viewBox="0 0 1000 100"
    >
      <path d={path} />
    </svg>
  );
}
