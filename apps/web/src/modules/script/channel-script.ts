import type { ProjectMediaAsset, StudioWord } from "../../domain/types";

export interface ChannelScriptRow {
  trackId: string;
  trackName: string;
  start: number | null;
  end: number | null;
  speakerId: string | null;
  text: string;
  words: { word: StudioWord; index: number }[];
}

function wordSpeaker(word: StudioWord): string | null {
  return word.speakerId?.trim() || word.manualDiarizationSpeakerId?.trim() ||
    word.diarizationSpeakerId?.trim() || null;
}

export function channelScriptRows(tracks: ProjectMediaAsset[]): ChannelScriptRow[] {
  const rows: ChannelScriptRow[] = [];
  const imported = tracks.filter((item) => item.importSelected !== false);
  const timedWords = imported.flatMap((track, trackOrder) => (track.words ?? [])
    .map((word, wordOrder) => ({ track, trackOrder, word, wordOrder }))
    .filter(({ word }) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.text.trim()));
  timedWords.sort((a, b) => a.word.start - b.word.start || a.trackOrder - b.trackOrder || a.wordOrder - b.wordOrder);
  for (const { track, word, wordOrder } of timedWords) {
    const speakerId = wordSpeaker(word);
    const previous = rows.at(-1);
    if (previous && previous.trackId === track.id && previous.speakerId === speakerId) {
      previous.end = Math.max(previous.end ?? word.end, word.end);
      previous.text = `${previous.text} ${word.text.trim()}`;
      previous.words.push({ word, index: wordOrder });
    } else {
      rows.push({ trackId: track.id, trackName: track.name, start: word.start, end: word.end,
        speakerId, text: word.text.trim(), words: [{ word, index: wordOrder }] });
    }
  }
  for (const track of imported) {
    if (!(track.words ?? []).length && track.text.trim()) {
      rows.push({ trackId: track.id, trackName: track.name, start: null, end: null,
        speakerId: null, text: track.text.trim(), words: [] });
    }
  }
  return rows;
}
