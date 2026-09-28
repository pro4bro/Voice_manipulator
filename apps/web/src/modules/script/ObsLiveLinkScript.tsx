import type { ObsLiveLinkTranscriptRow } from "../../domain/types";
import { obsTranscriptText } from "../obs-capture/obs-transcript-feed";
import { obsOverlapAt, obsOverlapByUtterance, obsOverlapTime } from "../obs-capture/obs-overlap";
import { ModuleFrame } from "../../ui/ModuleFrame";

function timecode(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function ObsLiveLinkScript({ rows, recordingId, playheadSeconds, error, onSeek }: {
  rows: ObsLiveLinkTranscriptRow[];
  recordingId: string | null;
  playheadSeconds: number;
  error: string | null;
  onSeek: (row: ObsLiveLinkTranscriptRow, seconds?: number, replayUntilSeconds?: number) => void;
}) {
  const overlapByUtterance = obsOverlapByUtterance(rows);
  return <ModuleFrame eyebrow={recordingId ? `OBS LIVELINK · ${recordingId.slice(0, 8)}` : "OBS LIVELINK"}
    title="SCRIPT" className="script-module obs-script" action={<span className="obs-script__badge">LIVE DRAFT · {rows.length} LƯỢT</span>}>
    <div className="obs-script__intro">Mỗi hàng là một lượt nói từ nguồn OBS. Tên channel là nguồn âm thanh, chưa xác nhận danh tính người nói. Thời gian theo đoạn; text và từng từ cần duyệt lại.</div>
    {error ? <p className="obs-script__error" role="alert">Live STT: {error}</p> : null}
    <ol aria-label="Lượt nói theo channel OBS" className="obs-script__rows">
      {rows.map((row) => {
        const text = obsTranscriptText(row);
        const overlaps = overlapByUtterance.get(row.utteranceId) ?? [];
        const reviewingOverlap = obsOverlapAt(overlaps, playheadSeconds);
        return <li data-channel-id={row.channelId} data-utterance-id={row.utteranceId} key={row.utteranceId}>
          <button aria-label={`Chọn ${row.alias} tại ${timecode(row.startSeconds)}`}
            className="obs-script__row-button"
            onClick={() => onSeek(row)} title={`Chọn nguồn ${row.alias} tại ${row.startSeconds.toFixed(2)}s · thời gian theo đoạn`}
            type="button">
            <span className="obs-script__source"><b>{row.alias}</b><small>{timecode(row.startSeconds)}–{timecode(row.endSeconds)}</small></span>
            <span className={`obs-script__content${reviewingOverlap ? " is-overlap" : ""}`}>{text || (row.status === "error" ? "Nhận dạng lỗi · nghe lại từ track gốc" : "Đang nghe…")}</span>
            <span className={`obs-script__state is-${row.status}`}>{row.status === "final" ? "DRAFT" : row.status === "partial" ? "LIVE" : row.status === "error" ? "LỖI" : "NGHE"}</span>
          </button>
          {overlaps.length ? <div className="obs-script__overlaps" aria-label={`Đoạn chồng tiếng ${row.alias}`}>
            {overlaps.map((overlap) => <button key={`${overlap.startSeconds}-${overlap.endSeconds}`}
              aria-label={`Nghe lại chồng tiếng ${row.alias} từ ${obsOverlapTime(overlap.startSeconds)} đến ${obsOverlapTime(overlap.endSeconds)}`}
              onClick={() => onSeek(row, overlap.startSeconds, overlap.endSeconds)} type="button">
              <span aria-hidden="true">●</span> CHỒNG TIẾNG {obsOverlapTime(overlap.startSeconds)}–{obsOverlapTime(overlap.endSeconds)} · nghe track gốc
            </button>)}
          </div> : null}
        </li>;
      })}
    </ol>
    {!rows.length ? <p className="obs-script__empty">{recordingId ? "Chưa có lời nói được nhận dạng trên bản ghi này." : "Chọn OBS LiveLink và bấm Record để xem Script theo channel."}</p> : null}
    <div className="obs-script__footer">BẢN NHÁP · Đỏ khi playhead ở đoạn chồng tiếng; thời gian theo đoạn, chưa xác định từ nào trùng. Không dùng làm SRT cuối trước khi xác thực timing.</div>
  </ModuleFrame>;
}
