import type { StudioWord } from "./types";

/** Repair only unsafe editable intervals. Estimates remain explicitly untrusted. */
export function editableWordTimings(source: StudioWord[], duration: number): StudioWord[] {
  if (!source.length) return source;
  const limit = Math.max(.000001 * source.length, Number.isFinite(duration) && duration > 0 ? duration :
    source.reduce((end, word) => Number.isFinite(word.end) ? Math.max(end, word.end) : end, source.length * .04));
  const minimum = Math.min(.001, limit / (source.length * 2));
  const result = [...source];
  const set = (index: number, start: number, end: number) => {
    const word = result[index];
    if (word.start === start && word.end === end) return;
    result[index] = { ...word, start, end, timingSource: "user-interpolated", timingTrusted: false,
      sourceTiming: word.sourceTiming ?? { start: word.start, end: word.end, source: word.timingSource } };
  };
  const valid = (word: StudioWord) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end > word.start && word.end <= limit;
  // Missing/zero runs receive positive provisional intervals between anchors.
  for (let index = 0; index < result.length;) {
    if (valid(result[index])) { index += 1; continue; }
    const first = index;
    while (index < result.length && !valid(result[index])) index += 1;
    const count = index - first;
    const before = result[first - 1], after = result[index];
    let low = before?.end ?? 0, high = after?.start ?? limit;
    if (high - low < minimum * count) {
      // Touching anchors offer no room. Borrow a small edge, marking that edge
      // estimated too; no fabricated interval is silently called measured.
      if (before) low = before.end - Math.min((before.end - before.start) * .1, .04 * count);
      if (after) high = after.start + Math.min((after.end - after.start) * .1, .04 * count);
      if (before && low < before.end) set(first - 1, before.start, low);
      if (after && high > after.start) set(index, high, after.end);
    }
    const span = Math.max(minimum * count, high - low);
    const gap = Math.min(.01, span / (count * 5));
    const step = span / count;
    for (let offset = 0; offset < count; offset += 1) set(first + offset, low + offset * step, low + (offset + 1) * step - gap);
  }
  // A reviewed Ghost Apply deliberately retains overlap. Keep its valid source
  // coordinates (including unchanged neighbors) for the red conflict overlay.
  if (result.some((word) => word.subtitleTimingConflict) && result.every(valid)) {
    return result.every((word, index) => word === source[index]) ? source : result;
  }
  // Clip genuine overlap at a distinct next onset; do not stretch valid gaps.
  for (let index = 0; index + 1 < result.length; index += 1) {
    const current = result[index], next = result[index + 1];
    if (current.end <= next.start) continue;
    if (next.start - current.start >= minimum) {
      set(index, current.start, next.start);
      continue;
    }
    // Equal/reversed onsets are an unsafe cluster, not separate zero-width words.
    let stop = index + 2, high = Math.max(current.end, next.end);
    while (stop < result.length && result[stop].start < high) { high = Math.max(high, result[stop].end); stop += 1; }
    const low = index ? Math.max(result[index - 1].end, Math.min(current.start, next.start)) : Math.max(0, Math.min(current.start, next.start));
    high = Math.min(limit, Math.max(low + minimum * (stop - index), high));
    const step = (high - low) / (stop - index);
    for (let offset = 0; offset < stop - index; offset += 1) set(index + offset, low + offset * step, low + (offset + 1) * step);
    index = stop - 2;
  }
  if (result.some((word, index) => !valid(word) || (index > 0 && word.start < result[index - 1].end))) {
    // Degenerate/reversed anchors may themselves leave no legal room. Project
    // only then onto the audio bounds, reserving positive space for the suffix.
    const floor = Math.min(.000001, limit / (result.length * 2));
    let cursor = 0;
    result.forEach((word, index) => {
      const ceiling = limit - (result.length - index - 1) * floor;
      const start = Math.max(cursor, Math.min(ceiling - floor, Number.isFinite(word.start) ? word.start : cursor));
      const end = Math.min(ceiling, Math.max(start + floor, Number.isFinite(word.end) ? word.end : start + floor));
      set(index, start, end); cursor = end;
    });
  }
  return result.every((word, index) => word === source[index]) ? source : result;
}
