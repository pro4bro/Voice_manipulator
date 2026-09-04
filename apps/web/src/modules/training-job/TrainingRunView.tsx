import { useMemo } from "react";

import { formatDuration } from "../../domain/reading-plan";
import type { TrainingProgressLine, TrainingRun, TrainingStepId } from "../../domain/types";

/**
 * What a training run is doing, for the hours it is doing it.
 *
 * A percentage is close to meaningless here. Step 7 is the whole run by wall
 * clock, and what tells a person whether to keep waiting is the loss curve and
 * whether dev loss is still tracking train loss. So the bar is the nine steps,
 * and the number is the curve.
 */

const STEPS: Array<{ id: TrainingStepId; label: string }> = [
  { id: "provision", label: "Dựng môi trường" },
  { id: "resolve-model", label: "Lấy base model" },
  { id: "read-manifest", label: "Đọc manifest" },
  { id: "write-jsonl", label: "Viết JSONL" },
  { id: "tokenize", label: "Tokenize audio" },
  { id: "load-model", label: "Nạp model + LoRA" },
  { id: "train", label: "Train" },
  { id: "checkpoint", label: "Checkpoint" },
  { id: "publish", label: "Merge & publish" },
];

const STATUS_LABELS: Record<TrainingRun["status"], string> = {
  pending: "Chờ chạy",
  running: "Đang chạy",
  interrupted: "Bị ngắt",
  cancelled: "Đã huỷ",
  failed: "Lỗi",
  complete: "Xong",
};

interface TrainingRunViewProps {
  run: TrainingRun;
  progress: TrainingProgressLine[];
  onCancel?: () => void;
  busy?: boolean;
}

interface Point {
  step: number;
  value: number;
}

/** A two-line chart, drawn small. No axis furniture the panel has no room for. */
function LossChart({ train, dev }: { train: Point[]; dev: Point[] }) {
  const all = [...train, ...dev];
  if (train.length < 2) return null;

  const maxStep = Math.max(...all.map((point) => point.step), 1);
  const values = all.map((point) => point.value);
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const span = top - bottom || 1;

  const path = (points: Point[]) =>
    points
      .map((point, index) => {
        const x = (point.step / maxStep) * 100;
        const y = 100 - ((point.value - bottom) / span) * 100;
        return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  return (
    <div className="loss-chart">
      <svg aria-label="Đường loss" preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
        <path className="loss-chart__train" d={path(train)} />
        {dev.length > 1 ? <path className="loss-chart__dev" d={path(dev)} /> : null}
      </svg>
      <footer>
        <span><i className="is-train" />train {train[train.length - 1].value.toFixed(4)}</span>
        {dev.length ? <span><i className="is-dev" />dev {dev[dev.length - 1].value.toFixed(4)}</span> : null}
        <small>{bottom.toFixed(2)} – {top.toFixed(2)}</small>
      </footer>
    </div>
  );
}

export function TrainingRunView({ run, progress, onCancel, busy = false }: TrainingRunViewProps) {
  const reached = STEPS.findIndex((step) => step.id === run.stepId);

  const { train, dev, latest } = useMemo(() => {
    const trainPoints: Point[] = [];
    const devPoints: Point[] = [];
    let last: TrainingProgressLine | null = null;
    for (const line of progress) {
      if (line.loss !== null && line.globalStep !== null) {
        trainPoints.push({ step: line.globalStep, value: line.loss });
      }
      // Dev loss arrives without a step of its own; it belongs at the last one
      // seen, which is where the evaluation actually ran.
      if (line.devLoss !== null) {
        devPoints.push({ step: last?.globalStep ?? run.globalStep, value: line.devLoss });
      }
      if (line.globalStep !== null) last = line;
    }
    return { train: trainPoints, dev: devPoints, latest: progress[progress.length - 1] ?? null };
  }, [progress, run.globalStep]);

  const tokenize = [...progress].reverse().find((line) => line.stepId === "tokenize" && line.total);

  return (
    <div className="training-run">
      <header>
        <div>
          <b>{run.emotion}</b>
          <small>{run.id}</small>
        </div>
        <span className={`run-status run-status--${run.status}`}>{STATUS_LABELS[run.status]}</span>
      </header>

      <ol className="training-steps">
        {STEPS.map((step, index) => (
          <li
            className={
              index < reached ? "is-done" : index === reached && run.status === "running" ? "is-active" : index === reached ? "is-current" : ""
            }
            key={step.id}
          >
            <i />
            <span>{step.label}</span>
            {step.id === "tokenize" && tokenize ? <small>{tokenize.done}/{tokenize.total} shard</small> : null}
            {step.id === "train" && run.globalStep ? <small>{run.globalStep}/{run.config.steps}</small> : null}
            {step.id === "checkpoint" && run.checkpoints.length ? <small>{run.checkpoints.length}</small> : null}
          </li>
        ))}
      </ol>

      <LossChart train={train} dev={dev} />

      {latest?.stepsPerSecond ? (
        <p className="training-rate">
          {latest.stepsPerSecond.toFixed(2)} step/s · còn khoảng{" "}
          {formatDuration((run.config.steps - run.globalStep) / latest.stepsPerSecond)}
        </p>
      ) : null}

      {run.checkpoints.length ? (
        <div className="training-checkpoints">
          <span>CHECKPOINT</span>
          <ul>
            {run.checkpoints.slice(-4).reverse().map((checkpoint) => (
              <li key={checkpoint.step}>
                <b>step {checkpoint.step}</b>
                <small>{(checkpoint.bytes / 1024 / 1024).toFixed(0)} MB</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.status === "interrupted" ? (
        <p className="training-note">
          Tiến trình đã dừng cùng app. Checkpoint vẫn còn — chạy tiếp được từ mốc cuối.
        </p>
      ) : null}
      {run.error ? <p className="training-note is-error">{run.error}</p> : null}

      {run.status === "running" || run.status === "pending" ? (
        <button className="button button--quiet button--full" disabled={busy} onClick={() => onCancel?.()} type="button">
          Huỷ run · giữ checkpoint
        </button>
      ) : null}
    </div>
  );
}
