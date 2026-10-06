import type { ProjectMediaAsset, StudioWord } from "../../domain/types";
import { obsTrackLabel } from "../../domain/obs-track-label";

export interface ChannelScriptOverlap { startSeconds: number; endSeconds: number; }

export interface ChannelScriptRow {
  trackId: string;
  trackName: string;
  start: number | null;
  end: number | null;
  speakerId: string | null;
  text: string;
  words: { word: StudioWord; index: number }[];
  overlaps: ChannelScriptOverlap[];
}

interface TimedWord { track: ProjectMediaAsset; word: StudioWord; index: number; }

const MIN_OVERLAP_SECONDS = 0.4;
const MIN_INTERRUPTION_SECONDS = 0.3;
const TURN_EDGE_SECONDS = 0.25;

function wordSpeaker(word: StudioWord): string | null {
  return word.speakerId?.trim() || word.manualDiarizationSpeakerId?.trim() ||
    word.diarizationSpeakerId?.trim() || null;
}

function trackLabel(track: ProjectMediaAsset): string {
  if (!track.name.startsWith("OBS LiveLink · ")) return track.name;
  const alias = obsTrackLabel(track.name.slice("OBS LiveLink · ".length).trim());
  const namedSlot = /^Track ([1-9]\d*)$/.exec(alias);
  const slot = namedSlot?.[1] ?? (track.sourceArchiveStreamIndex != null ? String(track.sourceArchiveStreamIndex + 1) : null);
  if (!slot) return alias;
  return alias === `Track ${slot}` ? alias : `Track ${slot} · ${alias}`;
}

function mergeIntervals(intervals: ChannelScriptOverlap[], tolerance = 0): ChannelScriptOverlap[] {
  const merged: ChannelScriptOverlap[] = [];
  for (const interval of [...intervals].sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds)) {
    const previous = merged.at(-1);
    if (previous && interval.startSeconds <= previous.endSeconds + tolerance) {
      previous.endSeconds = Math.max(previous.endSeconds, interval.endSeconds);
    } else merged.push({ ...interval });
  }
  return merged;
}

function isTimed(word: StudioWord): boolean {
  return Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start && Boolean(word.text.trim());
}

/** Keep a track's continuing speech open through another track's interjection. */
export function channelScriptRows(tracks: ProjectMediaAsset[]): ChannelScriptRow[] {
  const rows: ChannelScriptRow[] = [];
  const imported = tracks.filter((item) => item.importSelected !== false);
  const timedWords: TimedWord[] = imported.flatMap((track) => (track.words ?? [])
    .map((word, index) => ({ track, word, index })).filter(({ word }) => isTimed(word)));
  const rowWords: Array<{ row: ChannelScriptRow; trackId: string; word: StudioWord }> = [];

  for (const track of imported) {
    const own = timedWords.filter((item) => item.track.id === track.id)
      .sort((a, b) => a.word.start - b.word.start || a.index - b.index);
    const otherSpeech = mergeIntervals(timedWords.filter((item) => item.track.id !== track.id && item.word.timingTrusted !== false)
      .map(({ word }) => ({ startSeconds: word.start, endSeconds: word.end })), TURN_EDGE_SECONDS);
    let otherCursor = 0;
    let previous: TimedWord | null = null;
    let current: ChannelScriptRow | null = null;
    for (const item of own) {
      const speakerId = wordSpeaker(item.word);
      let interrupted = false;
      if (previous && item.word.start - previous.word.end > TURN_EDGE_SECONDS * 2) {
        const gapStart = previous.word.end + TURN_EDGE_SECONDS;
        const gapEnd = item.word.start - TURN_EDGE_SECONDS;
        while (otherSpeech[otherCursor]?.endSeconds <= gapStart) otherCursor += 1;
        for (let index = otherCursor; otherSpeech[index]?.startSeconds < gapEnd; index += 1) {
          const interval = otherSpeech[index];
          if (Math.min(interval.endSeconds, gapEnd) - Math.max(interval.startSeconds, gapStart) >= MIN_INTERRUPTION_SECONDS) {
            interrupted = true;
            break;
          }
        }
      }
      if (!current || current.speakerId !== speakerId || interrupted) {
        current = { trackId: track.id, trackName: trackLabel(track), start: item.word.start, end: item.word.end,
          speakerId, text: "", words: [], overlaps: [] };
        rows.push(current);
      }
      current.end = Math.max(current.end ?? item.word.end, item.word.end);
      current.text = current.text ? `${current.text} ${item.word.text.trim()}` : item.word.text.trim();
      current.words.push({ word: item.word, index: item.index });
      rowWords.push({ row: current, trackId: track.id, word: item.word });
      previous = item;
    }
    if (!own.length && track.text.trim()) {
      rows.push({ trackId: track.id, trackName: trackLabel(track), start: null, end: null,
        speakerId: null, text: track.text.trim(), words: [], overlaps: [] });
    }
  }

  const trusted = rowWords.filter(({ word }) => word.timingTrusted === true)
    .sort((a, b) => a.word.start - b.word.start || a.word.end - b.word.end);
  let active: typeof trusted = [];
  for (const current of trusted) {
    active = active.filter((earlier) => earlier.word.end > current.word.start);
    for (const earlier of active) {
      if (earlier.trackId === current.trackId) continue;
      const startSeconds = Math.max(earlier.word.start, current.word.start);
      const endSeconds = Math.min(earlier.word.end, current.word.end);
      if (endSeconds - startSeconds < MIN_OVERLAP_SECONDS) continue;
      earlier.row.overlaps.push({ startSeconds, endSeconds });
      current.row.overlaps.push({ startSeconds, endSeconds });
    }
    active.push(current);
  }
  for (const row of rows) row.overlaps = mergeIntervals(row.overlaps);
  return rows.sort((a, b) => (a.start ?? Number.POSITIVE_INFINITY) - (b.start ?? Number.POSITIVE_INFINITY)
    || imported.findIndex((track) => track.id === a.trackId) - imported.findIndex((track) => track.id === b.trackId));
}
