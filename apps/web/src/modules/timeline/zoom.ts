export const MAX_TIMELINE_PIXELS_PER_SECOND = 1_000;
export const TIMELINE_ZOOM_STEPS = 1_000;

export function minimumTimelineSpan(duration: number, laneWidth: number): number {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0.01;
  const safeWidth = Math.max(0, Number.isFinite(laneWidth) ? laneWidth : 0);
  return Math.min(safeDuration, Math.max(0.01, safeWidth / MAX_TIMELINE_PIXELS_PER_SECOND));
}

export function timelineZoomResolution(span: number, laneWidth: number): string {
  const secondsPerTenPixels = Math.max(0, span) / Math.max(0.001, laneWidth) * 10;
  const decimals = secondsPerTenPixels >= 1 ? 1 : secondsPerTenPixels >= 0.01 ? 2 : 4;
  return `${secondsPerTenPixels.toFixed(decimals)}s / 10px`;
}

export function timelineZoomPosition(fullSpan: number, span: number, minSpan: number): number {
  if (fullSpan <= minSpan) return 0;
  const ratio = Math.log(fullSpan / Math.max(minSpan, Math.min(fullSpan, span))) /
    Math.log(fullSpan / minSpan);
  return Math.round(Math.max(0, Math.min(1, ratio)) * TIMELINE_ZOOM_STEPS);
}

export function timelineSpanAtZoomPosition(value: number, fullSpan: number, minSpan: number): number {
  if (fullSpan <= minSpan) return Number.isFinite(fullSpan) && fullSpan > 0 ? fullSpan : 0.01;
  const position = Math.max(0, Math.min(TIMELINE_ZOOM_STEPS, value)) / TIMELINE_ZOOM_STEPS;
  return fullSpan / (fullSpan / minSpan) ** position;
}
