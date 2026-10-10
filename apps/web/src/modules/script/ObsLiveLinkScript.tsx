import { useRef, useState } from "react";
import type { ObsLiveLinkTranscriptRow, SpeakerProfile } from "../../domain/types";
import { obsTranscriptText } from "../obs-capture/obs-transcript-feed";
import { obsOverlapAt, obsOverlapByUtterance, obsOverlapSelectionMatches, obsOverlapTime,
  type ObsOverlapInterval, type ObsOverlapSelection } from "../obs-capture/obs-overlap";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { obsTrackLabel } from "../../domain/obs-track-label";
import { ScriptScrollbar } from "./ScriptScrollbar";
import { ScriptRowSelection, ScriptRowSpeaker, ScriptTranscriptHeader, ScriptTranscriptRow, useScriptTableLayout } from "./script-transcript-layout";
import { useScriptShortcuts } from "./script-shortcuts";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";

interface SpeechTurn { first: ObsLiveLinkTranscriptRow; rows: ObsLiveLinkTranscriptRow[]; text: string; endSeconds: number; }

export function groupObsSpeechTurns(rows: ObsLiveLinkTranscriptRow[]): SpeechTurn[] {
  const turns: SpeechTurn[] = [];
  const speechRows = [...rows].filter((row) => row.status !== "error" && obsTranscriptText(row))
    .sort((a, b) => a.startSeconds - b.startSeconds || a.firstEventRevision - b.firstEventRevision);
  const byTrack = new Map<string, ObsLiveLinkTranscriptRow[]>();
  for (const row of speechRows) {
    const key = `${row.recordingId}\0${row.channelId}`;
    const trackRows = byTrack.get(key);
    if (trackRows) trackRows.push(row);
    else byTrack.set(key, [row]);
  }
  for (const trackRows of byTrack.values()) {
    const first = trackRows[0];
    const otherSpeech = speechRows.filter((row) => row.recordingId === first.recordingId && row.channelId !== first.channelId)
      .reduce<Array<{ start: number; end: number }>>((intervals, row) => {
        const previous = intervals.at(-1);
        if (previous && row.startSeconds <= previous.end + 0.25) previous.end = Math.max(previous.end, row.endSeconds);
        else intervals.push({ start: row.startSeconds, end: row.endSeconds });
        return intervals;
      }, []);
    let otherCursor = 0;
    let turn: SpeechTurn | null = null;
    for (const row of trackRows) {
      const gapStart = (turn?.endSeconds ?? row.startSeconds) + 0.25;
      const gapEnd = row.startSeconds - 0.25;
      while (otherSpeech[otherCursor]?.end <= gapStart) otherCursor += 1;
      let interrupted = false;
      for (let index = otherCursor; otherSpeech[index]?.start < gapEnd; index += 1) {
        const interval = otherSpeech[index];
        if (Math.min(interval.end, gapEnd) - Math.max(interval.start, gapStart) >= 0.3) {
          interrupted = true;
          break;
        }
      }
      if (!turn || interrupted) {
        turn = { first: row, rows: [], text: "", endSeconds: row.endSeconds };
        turns.push(turn);
      }
      turn.rows.push(row);
      turn.text = turn.text ? `${turn.text} ${obsTranscriptText(row)}` : obsTranscriptText(row);
      turn.endSeconds = Math.max(turn.endSeconds, row.endSeconds);
    }
  }
  if (!turns.length && rows.length) {
    const latest = rows.at(-1)!;
    turns.push({ first: latest, rows: [latest], text: "", endSeconds: latest.endSeconds });
  }
  return turns.sort((a, b) => a.first.startSeconds - b.first.startSeconds ||
    a.first.firstEventRevision - b.first.firstEventRevision);
}

function timecode(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function ObsLiveLinkScript({ rows, recordingId, playheadSeconds, error, onSeek, onSelectOverlap,
                                    selectedOverlap = null, embedded = false, speakers = [] }: {
  rows: ObsLiveLinkTranscriptRow[];
  recordingId: string | null;
  playheadSeconds: number;
  error: string | null;
  onSeek: (row: ObsLiveLinkTranscriptRow, seconds?: number) => void;
  onSelectOverlap?: (selection: ObsOverlapSelection | null) => void;
  selectedOverlap?: ObsOverlapSelection | null;
  embedded?: boolean;
  speakers?: SpeakerProfile[];
}) {
  const overlapByUtterance = obsOverlapByUtterance(rows);
  const turns = groupObsSpeechTurns(rows);
  const viewRef = useRef<HTMLDivElement>(null);
  const layout = useScriptTableLayout();
  const rowIds = turns.map((turn) => `${turn.first.recordingId}:${turn.first.channelId}:${turn.first.utteranceId}`);
  const [selection, setSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const selected = reconcileListSelection(selection, rowIds).ids;
  useScriptShortcuts(viewRef, { selectAll: () => setSelection((current) => selectAllListItems(current, rowIds)) });
  const content = <>
    {embedded ? <header className="obs-script__embedded-heading"><strong>OBS LIVELINK · {recordingId?.slice(0, 8) ?? "chưa ghi"}</strong><span className="obs-script__badge">LIVE DRAFT · {turns.length} LƯỢT</span></header> : <div className="obs-script__intro">Mỗi track là một nguồn âm OBS, chưa xác nhận danh tính người nói. Thời gian theo đoạn; text và từng từ cần duyệt lại.</div>}
    {error ? <p className="obs-script__error" role="alert">Live STT: {error}</p> : null}
    <div className="script-table-scroll-region">
      <div aria-label="Lượt nói theo track OBS" role="grid" className="script-table-scroll" ref={viewRef}>
        <div className="script-table" style={{ minWidth: layout.columns.reduce((sum, column) => sum + column.width, 60) }}>
        <ScriptTranscriptHeader layout={layout} />
        {turns.map((turn, index) => {
        const row = turn.first;
        const text = turn.text;
        const overlaps = turn.rows.flatMap((item) => overlapByUtterance.get(item.utteranceId) ?? [])
          .sort((a, b) => a.startSeconds - b.startSeconds)
          .reduce<ObsOverlapInterval[]>((merged, interval) => {
            const last = merged.at(-1);
            if (last && interval.startSeconds <= last.endSeconds) {
              last.endSeconds = Math.max(last.endSeconds, interval.endSeconds);
              last.otherChannelIds = [...new Set([...last.otherChannelIds, ...interval.otherChannelIds])];
            } else merged.push({ ...interval });
            return merged;
          }, []);
        const reviewingOverlap = obsOverlapAt(overlaps, playheadSeconds);
        const checked = selected.includes(rowIds[index]);
        const control = <ScriptRowSelection number={index + 1} label={`Chọn row ${index + 1} của ${obsTrackLabel(row.alias)}`} selected={checked}
          onSelect={(event) => setSelection((current) => selectListItem(current, rowIds, rowIds[index], { shift: event.shiftKey, toggle: !event.shiftKey || event.ctrlKey || event.metaKey }))} />;
        return <ScriptTranscriptRow data-channel-id={row.channelId} data-utterance-id={row.utteranceId} key={rowIds[index]} columns={layout.columns} gridTemplateColumns={layout.gridTemplateColumns} className={checked ? "is-selected" : ""} selectionFallback={control} cells={{
          speaker: <ScriptRowSpeaker selection={control} label={`Speaker Profile của ${obsTrackLabel(row.alias)} row ${index + 1}`} profileId={null} profiles={speakers}
            track={<button aria-label={`Chọn ${row.alias} tại ${timecode(row.startSeconds)}`} onClick={() => onSeek(row)} title="Nguồn OBS live: gán profile sau khi lưu transcript" type="button">{obsTrackLabel(row.alias)}</button>} />,
          content: <div className="script-table__content" role="gridcell"><button className={`script-transcript-seek${reviewingOverlap ? " is-overlap" : ""}`} onClick={() => onSeek(row)} type="button">{text || (row.status === "error" ? "Nhận dạng lỗi · nghe lại từ track gốc" : "Đang nghe…")}</button>
            {overlaps.length ? <div className="obs-script__overlaps" aria-label={`Đoạn chồng tiếng ${row.alias}`}>
            {overlaps.map((overlap) => <button key={`${overlap.startSeconds}-${overlap.endSeconds}`}
              aria-pressed={obsOverlapSelectionMatches(selectedOverlap, row.recordingId, row.channelId, overlap)}
              aria-label={`Đến đoạn chồng tiếng ${row.alias} từ ${obsOverlapTime(overlap.startSeconds)} đến ${obsOverlapTime(overlap.endSeconds)}`}
              onClick={() => {
                onSelectOverlap?.({ recordingId: row.recordingId, startSeconds: overlap.startSeconds,
                  endSeconds: overlap.endSeconds, sourceIds: [...new Set([row.channelId, ...overlap.otherChannelIds])] });
                onSeek(row, overlap.startSeconds);
              }} title="Chọn đoạn chồng tiếng trên track gốc" type="button">
              <span aria-hidden="true">●</span> {obsOverlapTime(overlap.startSeconds)}–{obsOverlapTime(overlap.endSeconds)}
            </button>)}
          </div> : null}
          </div>,
          timestamp: <div className="script-table__timestamp" role="gridcell"><code>IN {timecode(row.startSeconds)}</code><code>OUT {timecode(turn.endSeconds)}</code><span className={`obs-script__state is-${row.status}`}>{row.status === "final" ? "DRAFT" : row.status === "partial" ? "LIVE" : row.status === "error" ? "LỖI" : "NGHE"}</span></div>,
        }} />;

        })}
        </div>
      </div>
      <ScriptScrollbar className="script-table-scrollbar" label="Thanh cuộn lượt nói OBS" viewportRef={viewRef} />
    </div>
    {!rows.length ? <p className="obs-script__empty">{recordingId ? "Chưa có lời nói được nhận dạng trên bản ghi này." : "Chọn OBS LiveLink và bấm Record để xem Script theo track."}</p> : null}
    {!embedded ? <div className="obs-script__footer">BẢN NHÁP · Đỏ khi playhead ở đoạn chồng tiếng; thời gian theo đoạn, chưa xác định từ nào trùng. Không dùng làm SRT cuối trước khi xác thực timing.</div> : null}
  </>;
  if (embedded) return <section aria-label="Lượt nói OBS LiveLink" className="script-transcript-feed">{content}</section>;
  return <ModuleFrame eyebrow={recordingId ? `OBS LIVELINK · ${recordingId.slice(0, 8)}` : "OBS LIVELINK"}
    title="SCRIPT" className="script-module obs-script" action={<span className="obs-script__badge">LIVE DRAFT · {turns.length} LƯỢT</span>}>{content}</ModuleFrame>;
}
