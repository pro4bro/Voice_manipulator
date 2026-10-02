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
  for (const row of speechRows) {
    const text = obsTranscriptText(row);
    const previous = turns.at(-1);
    if (previous && row.recordingId === previous.first.recordingId && row.channelId === previous.first.channelId) {
      previous.rows.push(row);
      previous.text = `${previous.text} ${text}`;
      previous.endSeconds = Math.max(previous.endSeconds, row.endSeconds);
    } else {
      turns.push({ first: row, rows: [row], text, endSeconds: row.endSeconds });
    }
  }
  if (!turns.length && rows.length) {
    const latest = rows.at(-1)!;
    turns.push({ first: latest, rows: [latest], text: "", endSeconds: latest.endSeconds });
  }
  return turns;
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
