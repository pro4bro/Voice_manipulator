import type { ObsLiveLinkTranscriptRow } from "../../domain/types";
import { obsTranscriptText } from "../obs-capture/obs-transcript-feed";
import { obsOverlapAt, obsOverlapByUtterance, obsOverlapTime, type ObsOverlapInterval } from "../obs-capture/obs-overlap";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { obsTrackLabel } from "../../domain/obs-track-label";

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

export function ObsLiveLinkScript({ rows, recordingId, playheadSeconds, error, onSeek, embedded = false }: {
  rows: ObsLiveLinkTranscriptRow[];
  recordingId: string | null;
  playheadSeconds: number;
  error: string | null;
  onSeek: (row: ObsLiveLinkTranscriptRow, seconds?: number) => void;
  embedded?: boolean;
}) {
  const overlapByUtterance = obsOverlapByUtterance(rows);
  const turns = groupObsSpeechTurns(rows);
  const content = <>
    {embedded ? <header className="obs-script__embedded-heading"><strong>OBS LIVELINK · {recordingId?.slice(0, 8) ?? "chưa ghi"}</strong><span className="obs-script__badge">LIVE DRAFT · {turns.length} LƯỢT</span></header> : <div className="obs-script__intro">Mỗi track là một nguồn âm OBS, chưa xác nhận danh tính người nói. Thời gian theo đoạn; text và từng từ cần duyệt lại.</div>}
    {error ? <p className="obs-script__error" role="alert">Live STT: {error}</p> : null}
    <ol aria-label="Lượt nói theo track OBS" className="obs-script__rows">
      {turns.map((turn) => {
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
        return <li data-channel-id={row.channelId} data-utterance-id={row.utteranceId} key={row.utteranceId}>
          <button aria-label={`Chọn ${row.alias} tại ${timecode(row.startSeconds)}`}
            className="obs-script__row-button"
            onClick={() => onSeek(row)} title={`Chọn nguồn ${row.alias} tại ${row.startSeconds.toFixed(2)}s · thời gian theo đoạn`}
            type="button">
            <span className="obs-script__source"><b>{obsTrackLabel(row.alias)}</b><small>{timecode(row.startSeconds)}–{timecode(turn.endSeconds)}</small></span>
            <span className={`obs-script__content${reviewingOverlap ? " is-overlap" : ""}`}>{text || (row.status === "error" ? "Nhận dạng lỗi · nghe lại từ track gốc" : "Đang nghe…")}</span>
            <span className={`obs-script__state is-${row.status}`}>{row.status === "final" ? "DRAFT" : row.status === "partial" ? "LIVE" : row.status === "error" ? "LỖI" : "NGHE"}</span>
          </button>
          {overlaps.length ? <div className="obs-script__overlaps" aria-label={`Đoạn chồng tiếng ${row.alias}`}>
            {overlaps.map((overlap) => <button key={`${overlap.startSeconds}-${overlap.endSeconds}`}
              aria-label={`Đến đoạn chồng tiếng ${row.alias} từ ${obsOverlapTime(overlap.startSeconds)} đến ${obsOverlapTime(overlap.endSeconds)}`}
              onClick={() => onSeek(row, overlap.startSeconds)} title="Đến đoạn chồng tiếng trên track gốc" type="button">
              <span aria-hidden="true">●</span> {obsOverlapTime(overlap.startSeconds)}–{obsOverlapTime(overlap.endSeconds)}
            </button>)}
          </div> : null}
        </li>;
      })}
    </ol>
    {!rows.length ? <p className="obs-script__empty">{recordingId ? "Chưa có lời nói được nhận dạng trên bản ghi này." : "Chọn OBS LiveLink và bấm Record để xem Script theo track."}</p> : null}
    {!embedded ? <div className="obs-script__footer">BẢN NHÁP · Đỏ khi playhead ở đoạn chồng tiếng; thời gian theo đoạn, chưa xác định từ nào trùng. Không dùng làm SRT cuối trước khi xác thực timing.</div> : null}
  </>;
  if (embedded) return <section aria-label="Lượt nói OBS LiveLink" className="obs-script obs-script--embedded">{content}</section>;
  return <ModuleFrame eyebrow={recordingId ? `OBS LIVELINK · ${recordingId.slice(0, 8)}` : "OBS LIVELINK"}
    title="SCRIPT" className="script-module obs-script" action={<span className="obs-script__badge">LIVE DRAFT · {turns.length} LƯỢT</span>}>{content}</ModuleFrame>;
}
