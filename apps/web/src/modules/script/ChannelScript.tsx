import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectMediaAsset, SpeakerProfile } from "../../domain/types";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
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
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ index: number; text: string; left: number; top: number; above: boolean } | null>(null);
  function showTiming(button: HTMLButtonElement, index: number, text: string) {
    const rect = button.getBoundingClientRect();
    const above = rect.top >= 40;
    setTooltip({ index, text, left: Math.max(8, Math.min(rect.left, window.innerWidth - 180)),
      top: above ? rect.top - 4 : rect.bottom + 4, above });
  }
  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [tooltip]);
  return <span className="obs-script__content">{row.words.length ? row.words.map(({ word, index }) =>
    <span key={index}><button type="button" className={`channel-script-word ${active === index ? "is-active" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""}`}
      aria-label={`${word.text} · ${timecode(word.start, 3)}–${timecode(word.end, 3)}`} data-time={`${timecode(word.start, 3)}–${timecode(word.end, 3)}`}
      aria-describedby={tooltip?.index === index ? tooltipId : undefined}
      onMouseEnter={(event) => showTiming(event.currentTarget, index, `${timecode(word.start, 3)}–${timecode(word.end, 3)}${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`)}
      onFocus={(event) => showTiming(event.currentTarget, index, `${timecode(word.start, 3)}–${timecode(word.end, 3)}${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`)}
      onMouseLeave={() => setTooltip(null)} onBlur={() => setTooltip(null)}
      onKeyDown={(event) => { if (event.key === "Escape") setTooltip(null); }}
      onClick={() => requestPlaybackSeek(row.trackId, word.start)}>{word.text}</button>{" "}</span>) : row.text}
    {tooltip ? createPortal(<span id={tooltipId} role="tooltip" className="channel-script-time-popup"
      style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.above ? "translateY(-100%)" : undefined }}>{tooltip.text}</span>, document.body) : null}
  </span>;
}

export function ChannelScript({ tracks, onSelectTrack, recordingId = null, selectedOverlap = null, onSelectOverlap, speakers = [], onAssignWords }: {
  tracks: ProjectMediaAsset[];
  onSelectTrack: (id: string) => void;
  recordingId?: string | null;
  selectedOverlap?: ObsOverlapSelection | null;
  onSelectOverlap?: (trackId: string, selection: ObsOverlapSelection) => void;
  speakers?: SpeakerProfile[];
  onAssignWords?: (trackId: string, indexes: number[], profileId: string | null) => void;
}) {
  // Timings from separate footage do not share a clock. Detect interruptions
  // and overlaps only between channels of the same recording/archive.
  const groupByTrack = new Map(tracks.map((track) => [track.id, track.sourceArchiveAssetId ? `archive:${track.sourceArchiveAssetId}`
    : track.obsRecordingId ? `recording:${track.obsRecordingId}`
    : recordingId && track.name.startsWith("OBS LiveLink · ") ? `recording:${recordingId}`
    : track.name.startsWith("OBS LiveLink · ") ? "obs-unarchived" : `asset:${track.id}`]));
  const groups = new Map<string, ProjectMediaAsset[]>();
  tracks.forEach((track) => { const group = groupByTrack.get(track.id)!; groups.set(group, [...(groups.get(group) ?? []), track]); });
  const rows = [...groups.values()].flatMap(channelScriptRows);
  const rowIds = rows.map((row) => `${row.trackId}:${row.words[0]?.index ?? "untimed"}`);
  const [selection, setSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const selected = reconcileListSelection(selection, rowIds).ids;
  function assignSelected(profileId: string | null) {
    const byTrack = new Map<string, number[]>();
    rows.forEach((row, index) => {
      if (!selected.includes(rowIds[index])) return;
      byTrack.set(row.trackId, [...(byTrack.get(row.trackId) ?? []), ...row.words.map((item) => item.index)]);
    });
    byTrack.forEach((indexes, trackId) => onAssignWords?.(trackId, indexes, profileId));
  }
  return <section aria-label="Script theo channel" className="obs-script obs-script--embedded">
    {onAssignWords && selected.length ? <div className="script-row-bulk-actions" aria-label="Thao tác channel rows đã chọn">
      <b>{selected.length} row đã chọn</b>
      <label>Gán speaker<select aria-label="Gán speaker cho channel rows" value="__choose__" onChange={(event) => assignSelected(event.target.value === "__none__" ? null : event.target.value)}>
        <option value="__choose__">Chọn speaker…</option><option value="__none__">Bỏ gán</option>
        {speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}
      </select></label>
      <button type="button" onClick={() => setSelection({ ids: [], anchorId: null })}>Bỏ chọn</button>
    </div> : null}
    <ol aria-label="Lượt nói theo thời gian" className="obs-script__rows">
      {rows.map((row, index) => <li data-channel-id={row.trackId} key={`${row.trackId}-${row.start ?? "untimed"}-${index}`}>
        <div className="obs-script__row-button">
          <div className="obs-script__source">
            {onAssignWords ? <button type="button" aria-label={`Chọn row ${index + 1} của ${row.trackName}`} aria-pressed={selected.includes(rowIds[index])}
              onClick={(event) => setSelection((current) => selectListItem(current, rowIds, rowIds[index], { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }))}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelection((current) => selectAllListItems(current, rowIds)); }
              }}>Chọn row {index + 1}</button> : null}
            <button aria-label={`Mở ${row.trackName} tại ${timecode(row.start)}`} onClick={() => onSelectTrack(row.trackId)} type="button"><b>{row.trackName}</b><small>{timecode(row.start)}–{timecode(row.end)}</small></button>
          </div>
          <ChannelWords row={row} />
          {onAssignWords ? <select className="channel-script__profile" aria-label={`Speaker Profile của ${row.trackName} row ${index + 1}`}
            value={speakers.some((speaker) => speaker.id === row.speakerId) ? row.speakerId! : row.speakerId ? "" : tracks.find((track) => track.id === row.trackId)?.speakerProfileIds?.[0] ?? ""}
            onChange={(event) => onAssignWords(row.trackId, row.words.map((item) => item.index), event.target.value || null)}>
            <option value="">Chưa gán Profile</option>
            {speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}
          </select> : row.speakerId ? <span className="obs-script__state">{speakers.find((speaker) => speaker.id === row.speakerId)?.name ?? row.speakerId}</span> : null}
        </div>
        {row.overlaps.length ? <div aria-label={`Đoạn chồng tiếng ${row.trackName}`} className="obs-script__overlaps">
          {row.overlaps.map((overlap) => <button key={`${overlap.startSeconds}-${overlap.endSeconds}`}
            aria-pressed={recordingId ? obsOverlapSelectionMatches(selectedOverlap, recordingId, row.trackId, overlap) : undefined}
            aria-label={`Đến đoạn chồng tiếng ${row.trackName} từ ${timecode(overlap.startSeconds)} đến ${timecode(overlap.endSeconds)}`}
            onClick={() => {
              if (recordingId && onSelectOverlap) {
                const sourceIds = [...new Set(rows.filter((item) => groupByTrack.get(item.trackId) === groupByTrack.get(row.trackId) && item.overlaps.some((part) =>
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
