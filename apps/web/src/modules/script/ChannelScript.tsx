import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import { channelScriptRows, type ChannelScriptRow } from "./channel-script";
import { requestPlaybackSeek, usePlaybackWord } from "../../domain/playback-sync";
import { obsOverlapSelectionMatches, type ObsOverlapSelection } from "../obs-capture/obs-overlap";
import { promoteTimestampWord } from "../../domain/timestamp-promotion";
import { replaceScriptWord } from "./script-text-reconciliation";
import { useTranscriptWindow } from "./transcript-window";
import { ScriptScrollbar } from "./ScriptScrollbar";
import { useScriptShortcuts } from "./script-shortcuts";
import "./script-selection.css";

function timecode(seconds: number | null, precision = 2) {
  if (seconds === null) return "--:--";
  const units = 10 ** precision;
  const rounded = Math.max(0, Math.round(seconds * units));
  const whole = Math.floor(rounded / units);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${String(rounded % units).padStart(precision, "0")}`;
}

function ChannelWords({ track, row, onEditWord }: { track: ProjectMediaAsset; row: ChannelScriptRow; onEditWord?: (index: number, text: string) => void }) {
  const active = usePlaybackWord(row.trackId);
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ index: number; text: string; left: number; top: number; above: boolean } | null>(null);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [wordMenu, setWordMenu] = useState<{ index: number; left: number; top: number } | null>(null);
  const editCommittedRef = useRef(false);
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
    <span key={index}><button type="button" className={`channel-script-word ${active === index ? "is-active" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""} ${word.timingSource === "user-interpolated" ? "is-time-estimated" : ""}`}
      aria-label={`${word.text} · ${timecode(word.start, 3)}–${timecode(word.end, 3)}`} data-time={`${timecode(word.start, 3)}–${timecode(word.end, 3)}`}
      aria-describedby={tooltip?.index === index ? tooltipId : undefined}
      onMouseEnter={(event) => showTiming(event.currentTarget, index, `${timecode(word.start, 3)}–${timecode(word.end, 3)}${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`)}
      onFocus={(event) => showTiming(event.currentTarget, index, `${timecode(word.start, 3)}–${timecode(word.end, 3)}${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`)}
      onMouseLeave={() => setTooltip(null)} onBlur={() => setTooltip(null)}
      onDoubleClick={(event) => { if (!onEditWord) return; event.preventDefault(); event.stopPropagation(); editCommittedRef.current = false; setWordMenu(null); setEditing({ index, text: word.text }); }}
      onContextMenu={(event) => { if (!onEditWord) return; event.preventDefault(); event.stopPropagation(); setWordMenu({ index, left: event.clientX, top: event.clientY }); }}
      onPointerDown={(event) => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); promoteTimestampWord(track.id, index); } else if (event.button === 0 || event.button === 2) promoteTimestampWord(track.id, null); }}
      onKeyDown={(event) => { if (event.key === "Escape") setTooltip(null); }}
      onClick={() => requestPlaybackSeek(row.trackId, word.start)}>{word.text}</button>{editing?.index === index ? <form aria-label={`Sửa text ${word.text}`} className="channel-script-word-editor" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !editCommittedRef.current) { editCommittedRef.current = true; onEditWord?.(index, editing.text); setEditing(null); } }} onSubmit={(event) => { event.preventDefault(); if (editCommittedRef.current) return; editCommittedRef.current = true; onEditWord?.(index, editing.text); setEditing(null); }}><input aria-label={`Sửa text ${word.text}`} autoFocus onChange={(event) => setEditing({ index, text: event.currentTarget.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); editCommittedRef.current = true; setEditing(null); } }} value={editing.text} /></form> : null}{" "}</span>) : row.text}
    {tooltip ? createPortal(<span id={tooltipId} role="tooltip" className="channel-script-time-popup"
      style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.above ? "translateY(-100%)" : undefined }}>{tooltip.text}</span>, document.body) : null}
    {wordMenu ? createPortal(<div className="channel-script-word-menu" role="menu" style={{ left: wordMenu.left, top: wordMenu.top }}><button onClick={() => { editCommittedRef.current = false; setEditing({ index: wordMenu.index, text: track.words?.[wordMenu.index]?.text ?? "" }); setWordMenu(null); }} role="menuitem" type="button">Sửa text</button></div>, document.body) : null}
  </span>;
}

export function ChannelScript({ tracks, onSelectTrack, recordingId = null, selectedOverlap = null, onSelectOverlap, speakers = [], onAssignWords, onWordsChange }: {
  tracks: ProjectMediaAsset[];
  onSelectTrack: (id: string) => void;
  recordingId?: string | null;
  selectedOverlap?: ObsOverlapSelection | null;
  onSelectOverlap?: (trackId: string, selection: ObsOverlapSelection) => void;
  speakers?: SpeakerProfile[];
  onAssignWords?: (trackId: string, indexes: number[], profileId: string | null) => void;
  onWordsChange?: (assetId: string, words: StudioWord[], text?: string) => void;
}) {
  // Timings from separate footage do not share a clock. Detect interruptions
  // and overlaps only between channels of the same recording/archive.
  const groupByTrack = useMemo(() => new Map(tracks.map((track) => [track.id, track.sourceArchiveAssetId ? `archive:${track.sourceArchiveAssetId}`
    : track.obsRecordingId ? `recording:${track.obsRecordingId}`
    : recordingId && track.name.startsWith("OBS LiveLink · ") ? `recording:${recordingId}`
    : track.name.startsWith("OBS LiveLink · ") ? "obs-unarchived" : `asset:${track.id}`])), [tracks, recordingId]);
  const rows = useMemo(() => {
    const groups = new Map<string, ProjectMediaAsset[]>();
    tracks.forEach((track) => { const group = groupByTrack.get(track.id)!; const own = groups.get(group) ?? []; own.push(track); groups.set(group, own); });
    return [...groups.values()].flatMap(channelScriptRows);
  }, [tracks, groupByTrack]);
  const viewRef = useRef<HTMLOListElement>(null);
  const transcriptWindow = useTranscriptWindow(rows, viewRef, 500);
  const rowIds = rows.map((row) => `${row.trackId}:${row.words[0]?.index ?? "untimed"}`);
  const [selection, setSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const selected = reconcileListSelection(selection, rowIds).ids;
  useScriptShortcuts(viewRef, { selectAll: () => setSelection((current) => selectAllListItems(current, rowIds)) });
  function assignSelected(profileId: string | null) {
    const byTrack = new Map<string, number[]>();
    rows.forEach((row, index) => {
      if (!selected.includes(rowIds[index])) return;
      byTrack.set(row.trackId, [...(byTrack.get(row.trackId) ?? []), ...row.words.map((item) => item.index)]);
    });
    byTrack.forEach((indexes, trackId) => onAssignWords?.(trackId, indexes, profileId));
  }
  function updateTrackWord(trackId: string, index: number, text: string) {
    const track = tracks.find((item) => item.id === trackId);
    if (!track || !onWordsChange) return;
    const result = replaceScriptWord(track.text, index, text, track.words ?? []);
    onWordsChange(trackId, result.words, result.text);
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
    <div className="script-feed-scroll-region">
      <ol aria-label="Lượt nói theo thời gian" className="obs-script__rows" ref={viewRef}>
        {transcriptWindow.top ? <li aria-hidden="true" style={{ height: transcriptWindow.top }} /> : null}
        {transcriptWindow.visibleRows.map(({ row, rowIndex: index, fragments }) => <li data-channel-id={row.trackId} data-transcript-row={index} key={rowIds[index]}>
        <div className="obs-script__row-button">
          <div className="obs-script__source">
            {onAssignWords ? <div className="script-row-selection"><button className="script-table__row-select" type="button" aria-label={`Chọn row ${index + 1} của ${row.trackName}`} aria-pressed={selected.includes(rowIds[index])}
              onClick={(event) => setSelection((current) => selectListItem(current, rowIds, rowIds[index], { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }))}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelection((current) => selectAllListItems(current, rowIds)); }
              }}><span aria-hidden="true">{selected.includes(rowIds[index]) ? "✓" : ""}</span></button><small aria-label={`Row ${index + 1}`}>{index + 1}</small></div> : null}
            <button aria-label={`Mở ${row.trackName} tại ${timecode(row.start)}`} onClick={() => onSelectTrack(row.trackId)} type="button"><b>{row.trackName}</b><small>{timecode(row.start)}–{timecode(row.end)}</small></button>
          </div>
          <div>{fragments.map((fragment) => <div data-transcript-fragment={fragment.key} key={fragment.key}><ChannelWords onEditWord={onWordsChange ? (wordIndex, text) => updateTrackWord(row.trackId, wordIndex, text) : undefined} row={{ ...row, words: fragment.words }} track={tracks.find((track) => track.id === row.trackId)!} /></div>)}</div>
          {onAssignWords ? <select className="channel-script__profile" aria-label={`Speaker Profile của ${row.trackName} row ${index + 1}`}
            value={speakers.some((speaker) => speaker.id === row.speakerId) ? row.speakerId! : row.speakerId ? "" : tracks.find((track) => track.id === row.trackId)?.speakerProfileIds?.[0] ?? ""}
            disabled={!selected.includes(rowIds[index])} onChange={(event) => { if (selected.includes(rowIds[index])) assignSelected(event.target.value || null); }}>
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
        {transcriptWindow.bottom ? <li aria-hidden="true" style={{ height: transcriptWindow.bottom }} /> : null}
      </ol>
      <ScriptScrollbar label="Thanh cuộn Script theo channel" viewportRef={viewRef} />
    </div>
    {!rows.length ? <p className="obs-script__empty">Các track đã Import chưa có transcript.</p> : null}
  </section>;
}
