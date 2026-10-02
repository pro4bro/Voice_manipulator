import type { ProjectMediaAsset } from "../../domain/types";
import { channelScriptRows, type ChannelScriptRow } from "./channel-script";
import { requestPlaybackSeek, usePlaybackWord } from "../../domain/playback-sync";
import { obsOverlapSelectionMatches, type ObsOverlapSelection } from "../obs-capture/obs-overlap";

function timecode(seconds: number | null, precision = 2) {
  if (seconds === null) return "--:--";
  const units = 10 ** precision;
  const rounded = Math.max(0, Math.round(seconds * units));
  const whole = Math.floor(rounded / units);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${String(rounded % units).padStart(precision, "0")}`;
}

function ChannelWords({ row }: { row: ChannelScriptRow }) {
  const active = usePlaybackWord(row.trackId);
  return <span className="obs-script__content">{row.words.length ? row.words.map(({ word, index }) =>
    <span key={index}><button type="button" className={`channel-script-word ${active === index ? "is-active" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""}`}
      aria-label={`${word.text} · ${timecode(word.start, 3)}–${timecode(word.end, 3)}`} data-time={`${timecode(word.start, 3)}–${timecode(word.end, 3)}`}
      title={`${timecode(word.start, 3)}–${timecode(word.end, 3)}${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`}
      onClick={() => requestPlaybackSeek(row.trackId, word.start)}>{word.text}</button>{" "}</span>) : row.text}</span>;
}

export function ChannelScript({ tracks, onSelectTrack, recordingId = null, selectedOverlap = null, onSelectOverlap }: {
  tracks: ProjectMediaAsset[];
  onSelectTrack: (id: string) => void;
  recordingId?: string | null;
  selectedOverlap?: ObsOverlapSelection | null;
  onSelectOverlap?: (trackId: string, selection: ObsOverlapSelection) => void;
}) {
  const rows = channelScriptRows(tracks);
  return <section aria-label="Script theo channel" className="obs-script obs-script--embedded">
    <ol aria-label="Lượt nói theo thời gian" className="obs-script__rows">
      {rows.map((row, index) => <li data-channel-id={row.trackId} key={`${row.trackId}-${row.start ?? "untimed"}-${index}`}>
        <div className="obs-script__row-button">
          <button aria-label={`Mở ${row.trackName} tại ${timecode(row.start)}`} className="obs-script__source" onClick={() => onSelectTrack(row.trackId)} type="button"><b>{row.trackName}</b><small>{timecode(row.start)}–{timecode(row.end)}</small></button>
          <ChannelWords row={row} />
          {row.speakerId ? <span className="obs-script__state">{row.speakerId}</span> : null}
        </div>
        {row.overlaps.length ? <div aria-label={`Đoạn chồng tiếng ${row.trackName}`} className="obs-script__overlaps">
          {row.overlaps.map((overlap) => <button key={`${overlap.startSeconds}-${overlap.endSeconds}`}
            aria-pressed={recordingId ? obsOverlapSelectionMatches(selectedOverlap, recordingId, row.trackId, overlap) : undefined}
            aria-label={`Đến đoạn chồng tiếng ${row.trackName} từ ${timecode(overlap.startSeconds)} đến ${timecode(overlap.endSeconds)}`}
            onClick={() => {
              if (recordingId && onSelectOverlap) {
                const sourceIds = [...new Set(rows.filter((item) => item.overlaps.some((part) =>
                  Math.min(part.endSeconds, overlap.endSeconds) > Math.max(part.startSeconds, overlap.startSeconds)))
                  .map((item) => item.trackId))];
                onSelectOverlap(row.trackId, { recordingId, startSeconds: overlap.startSeconds,
                  endSeconds: overlap.endSeconds, sourceIds });
              } else requestPlaybackSeek(row.trackId, overlap.startSeconds);
            }} type="button">
            <span aria-hidden="true">●</span> CHỒNG TIẾNG {timecode(overlap.startSeconds)}–{timecode(overlap.endSeconds)}
          </button>)}
        </div> : null}
      </li>)}
    </ol>
    {!rows.length ? <p className="obs-script__empty">Các track đã Import chưa có transcript.</p> : null}
  </section>;
}
