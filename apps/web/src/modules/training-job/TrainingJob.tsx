import { ModuleFrame } from "../../ui/ModuleFrame";
import { emotionLabel } from "../../domain/emotions";
import { formatDuration } from "../../domain/reading-plan";
import { TrainingRunView } from "./TrainingRunView";
import type {
  DatasetReadiness,
  EmotionLabel,
  SpeakerProfile,
  TrainingProgressLine,
  TrainingRuntimeReport,
  TrainingRun,
} from "../../domain/types";

interface TrainingJobProps {
  readiness: DatasetReadiness | null;
  speakers: SpeakerProfile[];
  busy?: boolean;
  onCompile?: () => void;
  /** The newest run, when there is one. A live run owns the panel. */
  run?: TrainingRun | null;
  runProgress?: TrainingProgressLine[];
  onCancelRun?: () => void;
  manifestId?: string | null;
  runtime?: TrainingRuntimeReport | null;
  onStart?: () => void;
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
  "mixed-speaker-unresolved": "Nhiều người, chưa gán hết",
  "no-usable-segment": "Không cắt được đoạn nào",
};

export function TrainingJob({
  readiness,
  speakers,
  busy = false,
  onCompile,
  run = null,
  runProgress = [],
  onCancelRun,
  manifestId = null,
  runtime = null,
  onStart,
}: TrainingJobProps) {
  // A run in flight is the only thing worth this panel's space; dataset
  // readiness is what you look at before there is one and after it finishes.
  if (run && (run.status === "running" || run.status === "pending")) {
    return (
      <ModuleFrame eyebrow="TRAINING JOB" title="Đang train" className="training-job-module" tone="warm">
        <TrainingRunView busy={busy} onCancel={onCancelRun} progress={runProgress} run={run} />
      </ModuleFrame>
    );
  }

  const segments = readiness?.segments ?? 0;
  const rejections = readiness?.rejections ?? [];
  const validations = readiness?.scriptValidations ?? [];
  const misreads = validations.filter((item) => item.matchRatio < 0.95);
  const speakerNames = (readiness?.speakerProfileIds ?? [])
    .map((id) => speakers.find((speaker) => speaker.id === id)?.name ?? id)
    .join(", ");
  const emotions = Object.entries(readiness?.secondsByEmotion ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <ModuleFrame eyebrow="TRAINING JOB" title="Dataset readiness" className="training-job-module" tone="warm">
      <div className="training-score">
        <div><strong>{segments}</strong><span>đoạn</span></div>
        <p>
          <b>{readiness ? `${readiness.readyAssets}/${readiness.selectedAssets} footage dùng được` : "Chưa đọc được readiness"}</b>
          <span>{formatDuration(readiness?.totalSeconds ?? 0)} · {speakerNames || "chưa có speaker"}</span>
        </p>
      </div>

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
            {rejections.slice(0, 5).map((item) => (
              <li key={item.assetId}>
                <b>{item.assetName || item.assetId}</b>
                <small>{REJECTION_LABELS[item.reason] ?? item.reason}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {run ? (
        <TrainingRunView busy={busy} onCancel={onCancelRun} progress={runProgress} run={run} />
      ) : null}

      <button
        className="button button--accent button--full"
        disabled={busy || segments === 0}
        onClick={() => onCompile?.()}
        type="button"
      >
        {busy ? "Đang biên dịch..." : segments ? `Biên dịch ${segments} đoạn` : "Chưa có đoạn nào để biên dịch"}
      </button>
      {manifestId ? (
        <button
          className="button button--quiet button--full"
          disabled={busy || !runtime?.ready}
          onClick={() => onStart?.()}
          type="button"
        >
          {busy ? "Đang khởi động..." : runtime?.ready ? "Bắt đầu training" : `Chưa sẵn sàng · thiếu ${(runtime?.packages ?? []).filter((item) => !item.installed).map((item) => item.name).slice(0, 3).join(", ") || "training runtime"}`}
        </button>
      ) : null}
    </ModuleFrame>
  );
}
