import type { TimelineEditRange } from "./types";

export interface TimelineEditState {
  removedRanges: TimelineEditRange[];
  workingRange: TimelineEditRange | null;
  cutPoints: number[];
}

export function excludedTimelineRanges(duration: number, removed: TimelineEditRange[], working: TimelineEditRange | null) {
  const ranges = [...removed];
  if (working?.start) ranges.push({ id: "outside-in", start: 0, end: working.start });
  if (working && working.end < duration) ranges.push({ id: "outside-out", start: working.end, end: duration });
  const result: TimelineEditRange[] = [];
  for (const raw of ranges.sort((a, b) => a.start - b.start)) {
    const range = { ...raw, start: Math.max(0, raw.start), end: Math.min(duration, raw.end) };
    if (range.end <= range.start) continue;
    const previous = result[result.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push(range);
  }
  return result;
}

export function nextPlayableTime(time: number, duration: number, excluded: TimelineEditRange[]) {
  let result = time;
  for (const range of excluded) if (result >= range.start && result < range.end) result = range.end;
  return Math.min(duration, result);
}

export function restoreTimelineSections(removed: TimelineEditRange[], sections: TimelineEditRange[]) {
  let result = removed;
  for (const restored of sections) result = result.flatMap((range) => {
    if (range.end <= restored.start || range.start >= restored.end) return [range];
    const retained: TimelineEditRange[] = [];
    if (range.start < restored.start) retained.push({ ...range, id: `${range.id}-before`, end: restored.start });
    if (range.end > restored.end) retained.push({ ...range, id: `${range.id}-after`, start: restored.end });
    return retained;
  });
  return result;
}

export function timelineSections(duration: number, points: number[]) {
  const edges = [0, ...points.filter((point) => point > 0 && point < duration), duration].sort((a, b) => a - b);
  return edges.slice(0, -1).map((start, index) => ({ id: `section-${start}-${edges[index + 1]}`, start, end: edges[index + 1] }));
}
