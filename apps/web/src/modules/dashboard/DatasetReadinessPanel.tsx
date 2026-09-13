import { emotionLabel } from "../../domain/emotions";
import { formatDuration } from "../../domain/reading-plan";
import type { DatasetReadiness, EmotionLabel, SpeakerProfile } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface DatasetReadinessPanelProps {
  readiness: DatasetReadiness | null;
  speakers: SpeakerProfile[];
  busy?: boolean;
  onCompile?: () => void;
}

const TIER_LABELS: Record<string, string> = {
  guided: "Đọc theo bài",
  record: "Tự thu",
  import: "Nhập vào",
};

const REJECTION_LABELS: Record<string, string> = {
  "no-audio": "Không có audio",
  "missing-audio-file": "Thiếu file audio",
  "empty-text": "Chưa có transcript",
  "no-word-timing": "Chưa có word timing",
  "unassigned-speaker": "Chưa gán speaker",
  "unknown-speaker": "Speaker không tồn tại",
  "mixed-speaker-unresolved": "Nhiều người, chưa gán ai",
  "no-usable-segment": "Không cắt được đoạn nào",
};

export function DatasetReadinessPanel({ readiness, speakers, busy = false, onCompile }: DatasetReadinessPanelProps) {
  const segments = readiness?.segments ?? 0;
  const rejections = readiness?.rejections ?? [];
  const misreads = (readiness?.scriptValidations ?? []).filter((item) => item.matchRatio < 0.95);
  const emotions = Object.entries(readiness?.secondsByEmotion ?? {}).sort((a, b) => b[1] - a[1]);
  const perSpeaker = Object.entries(readiness?.secondsBySpeaker ?? {})
    .map(([id, seconds]) => ({ id, seconds, speaker: speakers.find((speaker) => speaker.id === id) }))
    .sort((a, b) => b.seconds - a.seconds);
  const dropped = (readiness?.secondsDroppedUnassigned ?? 0) + (readiness?.secondsDroppedOverlap ?? 0);

  return (
    <ModuleFrame eyebrow="DATASET" title="Dataset readiness" className="training-job-module dataset-readiness-module" tone="warm">
      <div className="training-score">
        <div><strong>{segments}</strong><span>đoạn</span></div>
        <p>
          <b>{readiness ? `${readiness.readyAssets}/${readiness.selectedAssets} footage dùng được` : "Chưa đọc được readiness"}</b>
          <span>{formatDuration(readiness?.totalSeconds ?? 0)} dữ liệu</span>
        </p>
      </div>

      {perSpeaker.length ? (
        <div className="dataset-emotions">
          <span>THEO SPEAKER PROFILE</span>
          <ul>
            {perSpeaker.map((item) => (
              <li key={item.id}>
                <span><i className="dataset-speaker-dot" style={{ background: item.speaker?.color }} />{item.speaker?.name ?? item.id}</span>
                <small>{formatDuration(item.seconds)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {segments > 0 ? (
        <ul className="dataset-tiers">
          {Object.entries(readiness?.segmentsByTier ?? {}).map(([tier, count]) => (
            <li key={tier}><span>{TIER_LABELS[tier] ?? tier}</span><b>{count}</b></li>
          ))}
        </ul>
      ) : null}

      {emotions.length ? (
        <div className="dataset-emotions">
          <span>THEO CẢM XÚC</span>
          <ul>
            {emotions.map(([emotion, seconds]) => (
              <li key={emotion}>
                <span>{emotionLabel(emotion as EmotionLabel)}</span>
                <small>{formatDuration(seconds)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dropped > 0 ? (
        <div className="dataset-problems">
          <span>ĐÃ BỎ KHỎI DATASET</span>
          <ul>
            {readiness?.secondsDroppedUnassigned ? <li><b>Chưa gán Speaker Profile</b><small>{formatDuration(readiness.secondsDroppedUnassigned)}</small></li> : null}
            {readiness?.secondsDroppedOverlap ? <li><b>Chồng tiếng</b><small>{formatDuration(readiness.secondsDroppedOverlap)}</small></li> : null}
          </ul>
        </div>
      ) : null}

      {misreads.length ? (
        <div className="dataset-problems is-warning">
          <span>ĐỌC LỆCH SO VỚI BÀI · {misreads.length}</span>
          <ul>
            {misreads.slice(0, 4).map((item) => (
              <li key={item.assetId}>
                <b>{Math.round(item.matchRatio * 100)}% khớp</b>
                <small>
                  {item.omissions.length ? `thiếu ${item.omissions.length}` : ""}
                  {item.substitutions.length ? ` · sai ${item.substitutions.length}` : ""}
                  {item.insertions.length ? ` · thừa ${item.insertions.length}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rejections.length ? (
        <div className="dataset-problems">
          <span>BỊ LOẠI · {rejections.length}</span>
          <ul>
            {rejections.slice(0, 8).map((item) => (
              <li key={item.assetId}>
                <b>{item.assetName || item.assetId}</b>
                <small>{REJECTION_LABELS[item.reason] ?? item.reason}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button className="button button--quiet button--full" disabled={busy || segments === 0} onClick={() => onCompile?.()} type="button">
        {busy ? "Đang biên dịch..." : segments ? `Biên dịch thử ${segments} đoạn` : "Chưa có đoạn nào để biên dịch"}
      </button>
      <small className="dataset-readiness-note">Bấm Bắt đầu ở Voice Training sẽ tự biên dịch lại dataset mới nhất trước khi train.</small>
    </ModuleFrame>
  );
}
