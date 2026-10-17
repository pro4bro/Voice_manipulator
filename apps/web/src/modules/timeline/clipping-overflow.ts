import type { WaveformPoint } from "../../domain/types";

export interface ClippingRange {
  start: number;
  end: number;
}

/** Return exact contiguous envelope buckets whose gained peak exceeds full scale. */
export function clippingRanges(points: WaveformPoint[], gain: number): ClippingRange[] {
  if (!points.length || !Number.isFinite(gain) || gain <= 0) return [];
  const threshold = 1 / gain;
  const ranges: ClippingRange[] = [];
  let start = -1;

  for (let index = 0; index <= points.length; index += 1) {
    const point = points[index];
    const over = point !== undefined && Math.max(Math.abs(point.min), Math.abs(point.max)) > threshold;
    if (over && start < 0) start = index;
    if (!over && start >= 0) {
      ranges.push({ start, end: index });
      start = -1;
    }
  }

  return ranges;
}
