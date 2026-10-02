import type { ProjectMediaAsset } from "../../domain/types";
import { channelScriptRows, type ChannelScriptRow } from "./channel-script";
import { requestPlaybackSeek, usePlaybackWord } from "../../domain/playback-sync";

function timecode(seconds: number | null) {
  if (seconds === null) return "--:--";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function ChannelWords({ row }: { row: ChannelScriptRow }) {
  const active = usePlaybackWord(row.trackId);
  return <span className="obs-script__content">{row.words.length ? row.words.map(({ word, index }) =>
    <span key={index}><button type="button" className={`channel-script-word ${active === index ? "is-active" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""}`}
      aria-label={`${word.text} · ${timecode(word.start)}–${timecode(word.end)}`} title={`${word.start.toFixed(3)}–${word.end.toFixed(3)}s${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`}
      onClick={() => requestPlaybackSeek(row.trackId, word.start)}>{word.text}</button>{" "}</span>) : row.text}</span>;
}

export function ChannelScript({ tracks, onSelectTrack }: { tracks: ProjectMediaAsset[]; onSelectTrack: (id: string) => void }) {
  const rows = channelScriptRows(tracks);
  return <section aria-label="Script theo channel" className="obs-script obs-script--embedded">
    <ol aria-label="Lượt nói theo thời gian" className="obs-script__rows">
      {rows.map((row, index) => <li data-channel-id={row.trackId} key={`${row.trackId}-${row.start ?? "untimed"}-${index}`}>
        <div className="obs-script__row-button">
          <button aria-label={`Mở ${row.trackName} tại ${timecode(row.start)}`} className="obs-script__source" onClick={() => onSelectTrack(row.trackId)} type="button"><b>{row.trackName}</b><small>{timecode(row.start)}–{timecode(row.end)}</small></button>
          <ChannelWords row={row} />
          {row.speakerId ? <span className="obs-script__state">{row.speakerId}</span> : null}
        </div>
      </li>)}
    </ol>
    {!rows.length ? <p className="obs-script__empty">Các track đã Import chưa có transcript.</p> : null}
  </section>;
}
