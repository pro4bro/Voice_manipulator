import type { StudioWord } from "../../domain/types";

/**
 * Subtitle words for what live speech recognition heard while recording.
 *
 * The browser's speech API reports text and nothing else - no timings at all. So
 * the clock supplies them: each time a phrase is finalised we know roughly when
 * it ended, which brackets that phrase between the previous one and now. Inside a
 * phrase the words are spread by how long they are, which is a guess, and is
 * marked as one.
 *
 * These exist so a recording has something on the Timeline before anyone runs
 * STT over it. They are explicitly untrusted: `timingTrusted` is false and the
 * source says where they came from, so nothing downstream mistakes them for
 * measured timings and the Timeline draws them with its warning styling.
 */

export interface LiveSegment {
  text: string;
  /** Seconds from the start of the recording, when this phrase was finalised. */
  endedAt: number;
}

/** Recognition finalises a phrase after the speaker stops, not as they finish it. */
const RECOGNITION_LAG_SECONDS = 0.35;

export function liveTranscriptWords(segments: LiveSegment[], duration: number): StudioWord[] {
  const words: StudioWord[] = [];
  let previousEnd = 0;
  for (const segment of segments) {
    const pieces = segment.text.trim().split(/\s+/u).filter(Boolean);
    if (!pieces.length) continue;
    const finishedAt = Math.max(previousEnd, Math.min(duration, segment.endedAt - RECOGNITION_LAG_SECONDS));
    const span = finishedAt - previousEnd;
    if (span <= 0) continue;
    const weight = pieces.reduce((total, piece) => total + piece.length, 0) || pieces.length;
    let cursor = previousEnd;
    for (const piece of pieces) {
      const share = (piece.length / weight) * span;
      const start = cursor;
      const end = Math.min(finishedAt, start + share);
      words.push({
        text: piece,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        timingSource: "live-speech",
        timingTrusted: false,
      } as StudioWord);
      cursor = end;
    }
    previousEnd = finishedAt;
  }
  return words;
}
