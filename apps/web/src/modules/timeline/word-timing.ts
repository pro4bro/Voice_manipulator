import type { StudioWord } from "../../domain/types";

export interface EnvelopePoint {
  min: number;
  max: number;
}

export interface WaveformWindow {
  start: number;
  end: number;
  points: EnvelopePoint[];
}

/** A word edge may be nudged this far to meet a visible acoustic edge. */
export const SNAP_WINDOW_SECONDS = 0.06;
/** Below this, two words would render as a single unreadable sliver. */
export const MINIMUM_WORD_SECONDS = 0.02;

/**
 * Times where the drawn waveform visibly starts or stops.
 *
 * Derived from the same envelope the Timeline paints, so an edge dropped here
 * lands exactly where the user sees the wave begin - which is the whole point of
 * checking against the picture rather than against a model.
 *
 * Measured on a real 236 s recording, energy transitions carry a real but modest
 * signal: word starts sit a median 45 ms from one, against 67 ms for random
 * instants. Good enough to help a hand land precisely, not good enough to move
 * anything on its own, so nothing here runs unless the user is dragging.
 */
export function acousticEdges(window: WaveformWindow | null, riseDb = 6): number[] {
  if (!window || window.points.length < 4) return [];
  const span = Math.max(1e-6, window.end - window.start);
  const perPoint = span / window.points.length;
  const level = window.points.map((point) => {
    const peak = Math.max(Math.abs(point.min), Math.abs(point.max));
    return 20 * Math.log10(peak + 1e-6);
  });
  // Compare across ~20 ms so a single noisy sample cannot invent an edge.
  const lookback = Math.max(1, Math.round(0.02 / perPoint));
  const edges: number[] = [];
  for (let index = lookback; index < level.length; index += 1) {
    const change = level[index] - level[index - lookback];
    if (Math.abs(change) < riseDb) continue;
    const time = window.start + index * perPoint;
    if (edges.length && time - edges[edges.length - 1] < 0.03) continue;
    edges.push(time);
  }
  return edges;
}

export function snapToEdge(time: number, edges: number[], window = SNAP_WINDOW_SECONDS): number {
  let best = time;
  let bestDistance = window;
  for (const edge of edges) {
    const distance = Math.abs(edge - time);
    if (distance < bestDistance) {
      best = edge;
      bestDistance = distance;
    }
  }
  return best;
}

export type WordDragMode = "move" | "trim-start" | "trim-end";

function retainedDuration(word: StudioWord) {
  // Preserve ten percent even when the source word is sub-millisecond.
  const span = Math.max(Number.EPSILON, word.end - word.start);
  return span * .1;
}

/** Assign IN/OUT atomically: an intermediate move must never trim a neighbour. */
export function assignWordInterval(words: StudioWord[], index: number, inPoint: number, outPoint: number, duration: number) {
  const word = words[index];
  if (!word || ![inPoint, outPoint, duration].every(Number.isFinite)) return { words, collisionIndexes: [] as number[] };
  const before = words[index - 1], after = words[index + 1];
  const low = before ? before.start + retainedDuration(before) : 0;
  const high = after ? after.end - retainedDuration(after) : duration;
  const minimum = Math.min(MINIMUM_WORD_SECONDS, Math.max(.000001, high - low));
  const requestedStart = Math.min(inPoint, outPoint), requestedEnd = Math.max(inPoint, outPoint);
  const collisionIndexes = [];
  if (before && requestedStart <= before.end) collisionIndexes.push(index - 1);
  if (after && requestedEnd >= after.start) collisionIndexes.push(index + 1);
  const start = Math.max(low, Math.min(high - minimum, requestedStart));
  const end = Math.min(high, Math.max(start + minimum, requestedEnd));
  const next = words.map((source, position) => {
    if (position === index) return markEdited({ ...source, start, end });
    if (position === index - 1 && source.end > start) return markEdited({ ...source, end: start });
    if (position === index + 1 && source.start < end) return markEdited({ ...source, start: end });
    return source;
  });
  return { words: next, collisionIndexes };
}

export function timingCollisionIndexes(before: StudioWord[], after: StudioWord[], selected: number[]) {
  const selectedSet = new Set(selected);
  return before.flatMap((word, index) => selectedSet.has(index) ? [] :
    (after[index]?.start !== word.start || after[index]?.end !== word.end ||
      (selectedSet.has(index - 1) && after[index - 1].end >= word.start) ||
      (selectedSet.has(index + 1) && after[index + 1].start <= word.end)) ? [index] : []);
}

/**
 * Apply a drag to the selected words, keeping the transcript in time order.
 *
 * Neighbours yield rather than block. The recogniser emits words back to back -
 * the gap between them is usually exactly zero - so a rule that merely forbade
 * overlap left every word wedged immovably between its neighbours and made the
 * whole edit useless. Instead the word being dragged takes the space it needs
 * and the neighbour it meets is trimmed, down to a floor that keeps that
 * neighbour visible and selectable. Order is never changed: that is what the
 * transcript means.
 *
 * Anything a person moves is marked as theirs - the recogniser's provenance
 * would be a lie once a hand has moved it - and `timingTrusted` becomes true,
 * because a human just looked at it.
 */
export function applyWordDrag(
  words: StudioWord[],
  indexes: number[],
  mode: WordDragMode,
  deltaSeconds: number,
  options: { duration: number; edges?: number[] },
): StudioWord[] {
  const ordered = [...new Set(indexes)]
    .filter((index) => index >= 0 && index < words.length)
    .sort((a, b) => a - b);
  if (!ordered.length || !Number.isFinite(deltaSeconds) || !deltaSeconds) return words;
  const selected = new Set(ordered);

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const before = words[first - 1];
  const after = words[last + 1];
  const edges = options.edges ?? [];

  // How far the selection may travel before a neighbour would be squeezed out.
  const roomBefore = before ? words[first].start - (before.start + retainedDuration(before)) : words[first].start;
  const roomAfter = after ? after.end - retainedDuration(after) - words[last].end : options.duration - words[last].end;

  if (mode === "move") {
    const snapped = snapToEdge(words[first].start + deltaSeconds, edges) - words[first].start;
    let shift = Math.abs(snapped - deltaSeconds) < SNAP_WINDOW_SECONDS ? snapped : deltaSeconds;
    let backwardRoom = roomBefore, forwardRoom = roomAfter;
    for (const index of ordered) {
      const previous = words[index - 1], following = words[index + 1];
      if (previous && !selected.has(index - 1)) backwardRoom = Math.min(backwardRoom, words[index].start - previous.start - retainedDuration(previous));
      if (following && !selected.has(index + 1)) forwardRoom = Math.min(forwardRoom, following.end - retainedDuration(following) - words[index].end);
    }
    shift = Math.max(-backwardRoom, Math.min(forwardRoom, shift));
    if (!shift) return words;
    return words.map((word, index) => {
      if (selected.has(index)) {
        return markEdited({ ...word, start: word.start + shift, end: word.end + shift });
      }
      const start = selected.has(index - 1) ? Math.max(word.start, words[index - 1].end + shift) : word.start;
      const end = selected.has(index + 1) ? Math.min(word.end, words[index + 1].start + shift) : word.end;
      if (start !== word.start || end !== word.end) return markEdited({ ...word, start, end });
      return word;
    });
  }

  if (mode === "trim-start") {
    const target = snapToEdge(words[first].start + deltaSeconds, edges);
    const lowest = before ? before.start + retainedDuration(before) : 0;
    const ownMinimum = Math.min(MINIMUM_WORD_SECONDS, words[first].end - words[first].start);
    const next = Math.min(words[first].end - ownMinimum, Math.max(lowest, target));
    if (next === words[first].start) return words;
    return words.map((word, index) => {
      if (index === first) return markEdited({ ...word, start: next });
      if (index === first - 1 && word.end > next) return markEdited({ ...word, end: next });
      return word;
    });
  }

  const target = snapToEdge(words[last].end + deltaSeconds, edges);
  const highest = after ? after.end - retainedDuration(after) : options.duration;
  const ownMinimum = Math.min(MINIMUM_WORD_SECONDS, words[last].end - words[last].start);
  const next = Math.max(words[last].start + ownMinimum, Math.min(highest, target));
  if (next === words[last].end) return words;
  return words.map((word, index) => {
    if (index === last) return markEdited({ ...word, end: next });
    if (index === last + 1 && word.start < next) return markEdited({ ...word, start: next });
    return word;
  });
}

function markEdited(word: StudioWord): StudioWord {
  return { ...word, timingSource: "manual", timingTrusted: true };
}
