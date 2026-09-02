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

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const before = words[first - 1];
  const after = words[last + 1];
  const edges = options.edges ?? [];

  // How far the selection may travel before a neighbour would be squeezed out.
  const roomBefore = before ? words[first].start - (before.start + MINIMUM_WORD_SECONDS) : words[first].start;
  const roomAfter = after ? after.end - MINIMUM_WORD_SECONDS - words[last].end : options.duration - words[last].end;

  if (mode === "move") {
    const snapped = snapToEdge(words[first].start + deltaSeconds, edges) - words[first].start;
    let shift = Math.abs(snapped - deltaSeconds) < SNAP_WINDOW_SECONDS ? snapped : deltaSeconds;
    shift = Math.max(-roomBefore, Math.min(roomAfter, shift));
    if (!shift) return words;
    const movedStart = round(words[first].start + shift);
    const movedEnd = round(words[last].end + shift);
    return words.map((word, index) => {
      if (ordered.includes(index)) {
        return markEdited({ ...word, start: round(word.start + shift), end: round(word.end + shift) });
      }
      if (index === first - 1 && word.end > movedStart) return { ...word, end: movedStart };
      if (index === last + 1 && word.start < movedEnd) return { ...word, start: movedEnd };
      return word;
    });
  }

  if (mode === "trim-start") {
    const target = snapToEdge(words[first].start + deltaSeconds, edges);
    const lowest = before ? before.start + MINIMUM_WORD_SECONDS : 0;
    const next = Math.min(words[first].end - MINIMUM_WORD_SECONDS, Math.max(lowest, target));
    if (next === words[first].start) return words;
    const rounded = round(next);
    return words.map((word, index) => {
      if (index === first) return markEdited({ ...word, start: rounded });
      if (index === first - 1 && word.end > rounded) return { ...word, end: rounded };
      return word;
    });
  }

  const target = snapToEdge(words[last].end + deltaSeconds, edges);
  const highest = after ? after.end - MINIMUM_WORD_SECONDS : options.duration;
  const next = Math.max(words[last].start + MINIMUM_WORD_SECONDS, Math.min(highest, target));
  if (next === words[last].end) return words;
  const rounded = round(next);
  return words.map((word, index) => {
    if (index === last) return markEdited({ ...word, end: rounded });
    if (index === last + 1 && word.start < rounded) return { ...word, start: rounded };
    return word;
  });
}

function markEdited(word: StudioWord): StudioWord {
  return { ...word, timingSource: "manual", timingTrusted: true };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
