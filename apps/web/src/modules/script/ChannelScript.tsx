import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { selectProductionWord, sweepProductionWords } from "../../domain/production-selection";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import { channelScriptRows, type ChannelScriptRow } from "./channel-script";
import { requestPlaybackSeek, usePlaybackWord, usePlaybackWords } from "../../domain/playback-sync";
import { obsOverlapSelectionMatches, type ObsOverlapSelection } from "../obs-capture/obs-overlap";
import { promoteTimestampWord } from "../../domain/timestamp-promotion";
import { replaceScriptWord } from "./script-text-reconciliation";
import { useTranscriptWindow } from "./transcript-window";
import { ScriptScrollbar } from "./ScriptScrollbar";
import { useScriptShortcuts } from "./script-shortcuts";
import "./script-selection.css";
import { ScriptRowSelection, ScriptRowSpeaker, ScriptTranscriptHeader, ScriptTranscriptRow, useScriptTableLayout } from "./script-transcript-layout";
import { ScriptSourceText } from "./ScriptSourceText";
import { useScriptPlaybackVisibility } from "./script-playback-follow";

function timecode(seconds: number | null, precision = 2) {
  if (seconds === null) return "--:--";
  const units = 10 ** precision;
  const rounded = Math.max(0, Math.round(seconds * units));
  const whole = Math.floor(rounded / units);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${String(rounded % units).padStart(precision, "0")}`;
}

function ChannelWords({ track, row, onEditWord, wordSelection = EMPTY_SELECTION, onWordSelectionChange }: {
  track: ProjectMediaAsset;
  row: ChannelScriptRow;
  onEditWord?: (index: number, text: string) => void;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
}) {
  const active = usePlaybackWord(row.trackId);
  const sweep = useRef<{ base: WordSelection; origin: number } | null>(null);
  const sourceWords = track.words ?? [];
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
  useEffect(() => {
    const endSweep = () => { sweep.current = null; };
    window.addEventListener("pointerup", endSweep);
    window.addEventListener("pointercancel", endSweep);
    return () => {
      window.removeEventListener("pointerup", endSweep);
      window.removeEventListener("pointercancel", endSweep);
    };
  }, []);
  function select(index: number, modifiers: { ctrl: boolean; shift: boolean; alt: boolean }) {
    if (!onWordSelectionChange) return;
    const base = wordSelection.scope?.kind === "asset" && wordSelection.scope.id === track.id && wordSelection.scope.revision === track.updatedAt
      ? wordSelection : EMPTY_SELECTION;
    const next = selectProductionWord(base, index, sourceWords, modifiers);
    onWordSelectionChange({ ...next, scope: { kind: "asset", id: track.id, revision: track.updatedAt } });
  }
  function extend(index: number, modifiers: { ctrl: boolean; shift: boolean; alt: boolean }) {
    const current = sweep.current;
    if (!current || !onWordSelectionChange) return;
    const next = sweepProductionWords(current.base, current.origin, index, sourceWords, modifiers);
    onWordSelectionChange({ ...next, scope: { kind: "asset", id: track.id, revision: track.updatedAt } });
  }
  const selected = wordSelection.scope?.kind === "asset" && wordSelection.scope.id === track.id && wordSelection.scope.revision === track.updatedAt
    ? wordSelection : EMPTY_SELECTION;
  return <span className="script-transcript-words">{row.words.length ? row.words.map(({ word, index }) =>
    <span className="script-table__word-wrap" key={index}><button type="button" className={`script-table__word ${active === index ? "is-active" : ""} ${selected.indexes.includes(index) ? "is-selected" : ""} ${word.timingTrusted === false ? "is-untrusted" : ""} ${word.timingSource === "user-interpolated" ? "is-time-estimated" : ""}`}
      aria-label={`${word.text} · ${timecode(word.start, 3)}–${timecode(word.end, 3)}`} data-time={`${timecode(word.start, 3)}–${timecode(word.end, 3)}`}
      aria-pressed={onWordSelectionChange ? selected.indexes.includes(index) : undefined}
      data-script-word-index={index} data-script-source-id={row.trackId} data-script-revision={track.updatedAt}
      aria-describedby={tooltip?.index === index ? tooltipId : undefined}
      onMouseEnter={(event) => showTiming(event.currentTarget, index, `${timecode(word.start, 3)}–${timecode(word.end, 3)}${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`)}
      onFocus={(event) => showTiming(event.currentTarget, index, `${timecode(word.start, 3)}–${timecode(word.end, 3)}${word.timingTrusted === false ? " · cần căn chỉnh" : ""}`)}
      onMouseLeave={() => setTooltip(null)} onBlur={() => setTooltip(null)}
      onDoubleClick={(event) => { if (!onEditWord) return; event.preventDefault(); event.stopPropagation(); editCommittedRef.current = false; setWordMenu(null); setEditing({ index, text: word.text }); }}
      onContextMenu={(event) => { if (!onEditWord) return; event.preventDefault(); event.stopPropagation(); setWordMenu({ index, left: event.clientX, top: event.clientY }); }}
      onPointerDown={(event) => {
        if (event.button === 1) { event.preventDefault(); event.stopPropagation(); promoteTimestampWord(track.id, index); }
        else if (event.button === 0 || event.button === 2) promoteTimestampWord(track.id, null);
        if (event.button === 0 && onWordSelectionChange) {
          const base = selected;
          sweep.current = { base, origin: index };
          select(index, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey });
        }
      }}
      onPointerEnter={(event) => { const current = sweep.current; if (current && event.buttons === 1) extend(index, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey }); }}
      onPointerUp={() => { sweep.current = null; }}
      onKeyDown={(event) => { if (event.key === "Escape") setTooltip(null); }}
      onClick={(event) => { requestPlaybackSeek(row.trackId, word.start); if (event.detail === 0) select(index, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey }); }}>{word.text}</button>{editing?.index === index ? <form aria-label={`Sửa text ${word.text}`} className="channel-script-word-editor" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !editCommittedRef.current) { editCommittedRef.current = true; onEditWord?.(index, editing.text); setEditing(null); } }} onSubmit={(event) => { event.preventDefault(); if (editCommittedRef.current) return; editCommittedRef.current = true; onEditWord?.(index, editing.text); setEditing(null); }}><input aria-label={`Sửa text ${word.text}`} autoFocus onChange={(event) => setEditing({ index, text: event.currentTarget.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); editCommittedRef.current = true; setEditing(null); } }} value={editing.text} /></form> : null}{" "}</span>) : row.text}
    {tooltip ? createPortal(<span id={tooltipId} role="tooltip" className="channel-script-time-popup"
      style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.above ? "translateY(-100%)" : undefined }}>{tooltip.text}</span>, document.body) : null}
    {wordMenu ? createPortal(<div className="channel-script-word-menu" role="menu" style={{ left: wordMenu.left, top: wordMenu.top }}><button onClick={() => { editCommittedRef.current = false; setEditing({ index: wordMenu.index, text: track.words?.[wordMenu.index]?.text ?? "" }); setWordMenu(null); }} role="menuitem" type="button">Sửa text</button></div>, document.body) : null}
  </span>;
}

export function ChannelScript({ tracks, onSelectTrack, recordingId = null, selectedOverlap = null, onSelectOverlap, speakers = [], onAssignWords, onWordsChange, viewMode = "table", wordSelection = EMPTY_SELECTION, onWordSelectionChange }: {
  viewMode?: "table" | "edit";
  tracks: ProjectMediaAsset[];
  onSelectTrack: (id: string) => void;
  recordingId?: string | null;
  selectedOverlap?: ObsOverlapSelection | null;
  onSelectOverlap?: (trackId: string, selection: ObsOverlapSelection) => void;
  speakers?: SpeakerProfile[];
  onAssignWords?: (trackId: string, indexes: number[], profileId: string | null) => void;
  onWordsChange?: (assetId: string, words: StudioWord[], text?: string) => void;
  wordSelection?: WordSelection;
  onWordSelectionChange?: (selection: WordSelection) => void;
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
  const viewRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const layout = useScriptTableLayout();
  const [headerHeight, setHeaderHeight] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const height = headerRef.current?.getBoundingClientRect().height ?? 0;
      setHeaderHeight((current) => Math.abs(current - height) > 0.5 ? height : current);
    };
    measure();
    if (!headerRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, [layout.columns]);
  const transcriptWindow = useTranscriptWindow(rows, viewRef, layout.columns.find((column) => column.builtin === "content")?.width ?? 620, headerHeight);
  const activeWords = usePlaybackWords();
  useScriptPlaybackVisibility(rootRef, viewRef, tracks.map((track) => track.id), activeWords,
    viewMode === "table" ? (assetId, index) => transcriptWindow.reveal(index, (row) => row.trackId === assetId) : undefined);
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
  return <section aria-label="Script theo channel" className="script-transcript-feed" ref={rootRef}>
    {onAssignWords && selected.length ? <div className="script-row-bulk-actions" aria-label="Thao tác channel rows đã chọn"><b>{selected.length} row đã chọn</b><label>Gán speaker<select aria-label="Gán speaker cho channel rows" value="__choose__" onChange={(event) => assignSelected(event.target.value === "__none__" ? null : event.target.value)}><option value="__choose__">Chọn speaker…</option><option value="__none__">Bỏ gán</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select></label><button type="button" onClick={() => setSelection({ ids: [], anchorId: null })}>Bỏ chọn</button></div> : null}
    <div className="script-table-scroll-region">
      <div aria-label="Lượt nói theo thời gian" role="grid" className="script-table-scroll" ref={viewRef}>
        {viewMode === "edit" ? tracks.map((track) => <ScriptSourceText key={track.id} source={track} onChange={onWordsChange} wordSelection={wordSelection} onWordSelectionChange={onWordSelectionChange} />) : <div className="script-table" style={{ minWidth: layout.columns.reduce((sum, column) => sum + column.width, 60) }}>
        <ScriptTranscriptHeader layout={layout} headerRef={headerRef} />
        {transcriptWindow.top ? <div aria-hidden="true" style={{ height: transcriptWindow.top }} /> : null}
        {transcriptWindow.visibleRows.map(({ row, rowIndex: index, fragments }) => {
          const checked = selected.includes(rowIds[index]);
          const control = <ScriptRowSelection number={index + 1} label={`Chọn row ${index + 1} của ${row.trackName}`} selected={checked}
            onSelect={(event) => setSelection((current) => selectListItem(current, rowIds, rowIds[index], { shift: event.shiftKey, toggle: !event.shiftKey || event.ctrlKey || event.metaKey }))} />;
          const profileId = row.explicitlyUnassigned ? null : speakers.some((speaker) => speaker.id === row.speakerId) ? row.speakerId! : row.speakerId ? null : tracks.find((track) => track.id === row.trackId)?.speakerProfileIds?.[0] ?? null;
          const diarizationId = row.words[0]?.word.manualDiarizationSpeakerId ?? row.words[0]?.word.diarizationSpeakerId;
          const speakerNumber = /(?:speaker|spk)[-_ ]?(\d+)$/iu.exec(diarizationId ?? "")?.[1];
          const speakerLabel = diarizationId ? (speakerNumber ? `Speaker ${speakerNumber}` : diarizationId) : undefined;
          return <ScriptTranscriptRow data-channel-id={row.trackId} data-transcript-row={index} key={rowIds[index]} columns={layout.columns} gridTemplateColumns={layout.gridTemplateColumns} className={checked ? "is-selected" : ""} selectionFallback={control} cells={{
            speaker: <ScriptRowSpeaker selection={control} label={`Speaker Profile của ${row.trackName} row ${index + 1}`} speakerLabel={speakerLabel} profileId={profileId} profiles={speakers} onActivate={() => { if (!selected.length) setSelection({ ids: [rowIds[index]], anchorId: rowIds[index] }); }}
              onProfileChange={onAssignWords ? (id) => { if (selected.length) assignSelected(id); } : undefined}
              track={<button aria-label={`Mở ${row.trackName} tại ${timecode(row.start)}`} onClick={() => onSelectTrack(row.trackId)} type="button">{row.trackName}</button>} />,
            content: <div className="script-table__content" role="gridcell">
              {fragments.map((fragment) => <div data-transcript-fragment={fragment.key} key={fragment.key}><ChannelWords onEditWord={onWordsChange ? (wordIndex, text) => updateTrackWord(row.trackId, wordIndex, text) : undefined} row={{ ...row, words: fragment.words }} track={tracks.find((track) => track.id === row.trackId)!} wordSelection={wordSelection} onWordSelectionChange={onWordSelectionChange} /></div>)}
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
            </div>,
            timestamp: <div className="script-table__timestamp" role="gridcell"><code>IN {timecode(row.start, 3)}</code><code>OUT {timecode(row.end, 3)}</code></div>,
          }} />;
        })}
        {transcriptWindow.bottom ? <div aria-hidden="true" style={{ height: transcriptWindow.bottom }} /> : null}
        </div>}
      </div>
      <ScriptScrollbar className="script-table-scrollbar" label="Thanh cuộn Script theo channel" viewportRef={viewRef} />
    </div>
    {!rows.length ? <p className="obs-script__empty">Các track đã Import chưa có transcript.</p> : null}
  </section>;
}
