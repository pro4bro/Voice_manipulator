import type { ObsLiveLinkTranscriptRow } from "../../domain/types";

export interface ObsOverlapInterval {
  startSeconds: number;
  endSeconds: number;
  otherChannelIds: string[];
}

function hasSegmentBounds(row: ObsLiveLinkTranscriptRow): boolean {
  return row.timingTrust === "segment" && row.sampleRate > 0 &&
    row.lastSampleIndexExclusive > row.firstSampleIndex &&
    Number.isFinite(row.startSeconds) && Number.isFinite(row.endSeconds) &&
    row.startSeconds >= 0 && row.endSeconds > row.startSeconds;
}

/** Cross-source intersections on the recording's OBS monotonic time axis. */
export function obsOverlapByUtterance(rows: ObsLiveLinkTranscriptRow[]): Map<string, ObsOverlapInterval[]> {
  const valid = rows.filter(hasSegmentBounds).sort((a, b) =>
    a.recordingId.localeCompare(b.recordingId) || a.startSeconds - b.startSeconds ||
    a.firstEventRevision - b.firstEventRevision);
  const intersections = new Map<string, ObsOverlapInterval[]>();
  const add = (row: ObsLiveLinkTranscriptRow, other: ObsLiveLinkTranscriptRow,
               startSeconds: number, endSeconds: number) => {
    const own = intersections.get(row.utteranceId) ?? [];
    own.push({ startSeconds, endSeconds, otherChannelIds: [other.channelId] });
    intersections.set(row.utteranceId, own);
  };
  let active: ObsLiveLinkTranscriptRow[] = [];
  for (const current of valid) {
    active = active.filter((earlier) => earlier.recordingId === current.recordingId &&
      earlier.endSeconds > current.startSeconds);
    for (const earlier of active) {
      if (earlier.channelId === current.channelId) continue;
      const end = Math.min(earlier.endSeconds, current.endSeconds);
      if (end <= current.startSeconds) continue; // A shared boundary is not concurrent speech.
      add(earlier, current, current.startSeconds, end);
      add(current, earlier, current.startSeconds, end);
    }
    active.push(current);
  }
  for (const [utteranceId, intervals] of intersections) {
    intervals.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);
    const merged: ObsOverlapInterval[] = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval.startSeconds <= last.endSeconds) {
        last.endSeconds = Math.max(last.endSeconds, interval.endSeconds);
        last.otherChannelIds = [...new Set([...last.otherChannelIds, ...interval.otherChannelIds])];
      } else {
        merged.push({ ...interval });
      }
    }
    intersections.set(utteranceId, merged);
  }
  return intersections;
}

export function obsOverlapAt(intervals: ObsOverlapInterval[], seconds: number): boolean {
  return intervals.some(({ startSeconds, endSeconds }) => startSeconds <= seconds && seconds < endSeconds);
}

export function obsOverlapTime(seconds: number): string {
  const centiseconds = Math.round(seconds * 100);
  const whole = Math.floor(centiseconds / 100);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}
