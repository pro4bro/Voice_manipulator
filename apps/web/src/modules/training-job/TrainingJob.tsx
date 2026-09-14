import { useEffect, useMemo, useRef, useState } from "react";

import { formatDuration } from "../../domain/reading-plan";
import { activeRun, isLive, runFraction } from "../../domain/trainingBatch";
import type { SpeakerProfile, TrainingProgressLine, TrainingRun, TrainingStepId } from "../../domain/types";
import { Icon, type IconName } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface TrainingJobProps {
  speakers: SpeakerProfile[];
  /** Ticked in Train; shown as the waiting targets before any batch exists. */
  targetSpeakerIds?: string[];
  /** The newest batch, in training order. */
  batch?: TrainingRun[];
  progressByRun?: Record<string, TrainingProgressLine[]>;
  /** The option chosen in Train. While nothing runs, the flow shows its steps. */
  selectedMode?: string | null;
  busy?: boolean;
  onCancelRun?: (runId: string) => void;
}

type FlowStep = { id: TrainingStepId; label: string; detail: string; icon: IconName };

const TRAINING_FLOW: FlowStep[] = [
  { id: "read-manifest", label: "Dataset manifest", detail: "Lọc đoạn của voice target", icon: "file" },
  { id: "write-jsonl", label: "Viết JSONL", detail: "Cắt audio theo từng đoạn", icon: "list" },
  { id: "tokenize", label: "Tokenize audio", detail: "Train + dev shard", icon: "waveform" },
  { id: "load-model", label: "Nạp model", detail: "Base model + LoRA", icon: "settings" },
  { id: "train", label: "Train", detail: "Loss train / dev", icon: "training" },
  { id: "checkpoint", label: "Checkpoint", detail: "Lưu adapter", icon: "folder" },
  { id: "publish", label: "Publish voice", detail: "Dùng ở Voice Manipulation", icon: "spark" },
];

/** Zero-shot cloning: the same batch, the same steps where they apply, no training. */
const CLONE_FLOW: FlowStep[] = [
  { id: "read-manifest", label: "Dataset manifest", detail: "Lọc đoạn của voice target", icon: "file" },
  { id: "write-jsonl", label: "Chọn đoạn mẫu", detail: "3-10 giây, đúng transcript", icon: "waveform" },
  { id: "publish", label: "Publish voice", detail: "Dùng ở Voice Manipulation", icon: "spark" },
];

export function flowForMode(mode: string | null | undefined): FlowStep[] {
  return mode === "zero-shot-clone" ? CLONE_FLOW : TRAINING_FLOW;
}

const STEP_LABELS: Record<TrainingStepId, string> = {
  provision: "MÔI TRƯỜNG",
  "resolve-model": "MODEL",
  "read-manifest": "MANIFEST",
  "write-jsonl": "JSONL",
  tokenize: "TOKENIZE",
  "load-model": "LOAD",
  train: "TRAIN",
  checkpoint: "CHECKPOINT",
  publish: "PUBLISH",
};

const STATUS_LABELS: Record<TrainingRun["status"], string> = {
  pending: "Chờ lượt",
  running: "Đang chạy",
  interrupted: "Bị ngắt",
  cancelled: "Đã huỷ",
  failed: "Lỗi",
  complete: "Xong",
};

interface Point {
  step: number;
  value: number;
}

/** A two-line chart, drawn small. No axis furniture the panel has no room for. */
function LossChart({ train, dev }: { train: Point[]; dev: Point[] }) {
  if (train.length < 2) return null;
  const all = [...train, ...dev];
  const maxStep = Math.max(...all.map((point) => point.step), 1);
  const values = all.map((point) => point.value);
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const span = top - bottom || 1;
  const path = (points: Point[]) =>
    points
      .map((point, index) => `${index ? "L" : "M"}${((point.step / maxStep) * 100).toFixed(2)} ${(100 - ((point.value - bottom) / span) * 100).toFixed(2)}`)
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

/** What a progress line says, for a person reading the log. */
export function logMessage(line: TrainingProgressLine): string {
  if (line.message) return line.message;
  const parts: string[] = [];
  if (line.globalStep !== null) parts.push(`step ${line.globalStep}`);
  if (line.loss !== null) parts.push(`loss ${line.loss.toFixed(4)}`);
  if (line.devLoss !== null) parts.push(`dev loss ${line.devLoss.toFixed(4)}`);
  if (line.learningRate !== null) parts.push(`lr ${line.learningRate.toExponential(2)}`);
  if (line.stepsPerSecond !== null) parts.push(`${line.stepsPerSecond.toFixed(2)} step/s`);
  if (line.total) parts.push(`${line.done ?? 0}/${line.total} shard`);
  return parts.join(" · ");
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function TrainingJob({ speakers, targetSpeakerIds = [], batch = [], progressByRun = {}, selectedMode = null, busy = false, onCancelRun }: TrainingJobProps) {
  const logRef = useRef<HTMLOListElement>(null);
  const [follow, setFollow] = useState(true);
  const current = activeRun(batch);
  const currentProgress = current ? progressByRun[current.id] ?? [] : [];
  const nameOf = (id: string | null | undefined) => speakers.find((speaker) => speaker.id === id)?.name ?? (id ? id : "Toàn bộ dataset");
  const colorOf = (id: string | null | undefined) => speakers.find((speaker) => speaker.id === id)?.color;
  const live = batch.find((run) => run.status === "running") ?? batch.find(isLive) ?? null;

  const targets = batch.length
    ? batch.map((run) => ({ key: run.id, speakerId: run.speakerProfileId, run, fraction: runFraction(run, progressByRun[run.id]) }))
    : targetSpeakerIds.map((id) => ({ key: id, speakerId: id, run: null as TrainingRun | null, fraction: 0 }));
  const overall = targets.length ? targets.reduce((sum, target) => sum + target.fraction, 0) / targets.length : 0;

  const lines = useMemo(() => {
    const merged = batch.flatMap((run) => (progressByRun[run.id] ?? []).map((line) => ({ run, line })));
    return merged.sort((left, right) => left.line.at.localeCompare(right.line.at));
  }, [batch, progressByRun]);

  const { train, dev, latest } = useMemo(() => {
    const trainPoints: Point[] = [];
    const devPoints: Point[] = [];
    let last: TrainingProgressLine | null = null;
    for (const line of currentProgress) {
      if (line.loss !== null && line.globalStep !== null) trainPoints.push({ step: line.globalStep, value: line.loss });
      // Dev loss arrives without a step of its own; it belongs at the last one seen.
      if (line.devLoss !== null) devPoints.push({ step: last?.globalStep ?? current?.globalStep ?? 0, value: line.devLoss });
      if (line.globalStep !== null) last = line;
    }
    return { train: trainPoints, dev: devPoints, latest: [...currentProgress].reverse().find((line) => line.stepsPerSecond) ?? null };
  }, [currentProgress, current?.globalStep]);

  useEffect(() => {
    if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines.length, follow]);

  // A running batch owns the flow. Otherwise the flow follows the choice in
  // Train, and shows the last batch's progress only if it was that same kind.
  const shownMode = live ? live.config.mode : selectedMode ?? current?.config.mode;
  const FLOW = flowForMode(shownMode);
  const category = shownMode === "zero-shot-clone" ? "clone" : "train";
  const flowRun = current && flowForMode(current.config.mode) === FLOW ? current : null;
  const reached = flowRun ? FLOW.findIndex((step) => step.id === flowRun.stepId) : -1;
  const shards = [...currentProgress].reverse().find((line) => line.stepId === "tokenize" && line.total);

  function stepState(index: number) {
    if (!flowRun) return "";
    if (flowRun.status === "complete") return "is-done";
    if (index < reached) return "is-done";
    if (index === reached) {
      if (flowRun.status === "running") return "is-active";
      if (flowRun.status === "failed" || flowRun.status === "interrupted") return "is-failed";
      return "is-current";
    }
    return "";
  }

  return (
    <ModuleFrame
      action={current ? <span className={`run-status run-status--${current.status}`}>{STATUS_LABELS[current.status]}</span> : null}
      className={`training-job-module training-console is-${category}`}
      eyebrow="TRAINING JOB"
      title="Voice Training"
      tone="warm"
    >
      <section aria-label="Flow Voice Training" className="training-flow">
        <header>
          <span>FLOW · {category === "clone" ? "NHÁI GIỌNG" : "TRAIN GIỌNG"}</span>
          {current ? (
            <b><i style={{ background: colorOf(current.speakerProfileId) }} />{nameOf(current.speakerProfileId)}{(current.batchSize ?? 1) > 1 ? ` · voice ${(current.batchIndex ?? 0) + 1}/${current.batchSize}` : ""}</b>
          ) : <b>Chưa có run</b>}
          {current?.config.modelId ? <small>{current.config.modelId}</small> : null}
        </header>
        <ol className="training-flow__steps">
          {FLOW.map((step, index) => (
            <li className={stepState(index)} key={step.id}>
              <i><Icon name={step.icon} /></i>
              <b>{step.label}</b>
              <small>
                {step.id === "tokenize" && shards ? `${shards.done}/${shards.total} shard`
                  : step.id === "train" && current?.globalStep ? `${current.globalStep}/${current.config.steps}`
                    : step.id === "checkpoint" && current?.checkpoints.length ? `step ${current.checkpoints[current.checkpoints.length - 1].step} · ${(current.checkpoints[current.checkpoints.length - 1].bytes / 1024 / 1024).toFixed(0)} MB`
                      : step.detail}
              </small>
            </li>
          ))}
        </ol>
        <LossChart dev={dev} train={train} />
        {latest?.stepsPerSecond && current?.status === "running" ? (
          <p className="training-rate">{latest.stepsPerSecond.toFixed(2)} step/s · còn khoảng {formatDuration((current.config.steps - current.globalStep) / latest.stepsPerSecond)} cho voice này</p>
        ) : null}
        {current?.error ? <p className="training-note is-error">{nameOf(current.speakerProfileId)}: {current.error}</p> : null}
        {current?.status === "interrupted" ? <p className="training-note">Tiến trình dừng cùng app. Checkpoint vẫn còn, chạy tiếp được từ mốc cuối.</p> : null}
      </section>

      <section aria-label="Log training" className="training-log">
        <header>
          <span>LOG · {lines.length} dòng</span>
          <label><input checked={follow} onChange={(event) => setFollow(event.target.checked)} type="checkbox" />Tự cuộn</label>
        </header>
        <ol onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
          if (atBottom !== follow) setFollow(atBottom);
        }} ref={logRef}>
          {lines.map(({ run, line }, index) => {
            const message = logMessage(line);
            return (
              <li className={message.startsWith("$ ") ? "is-command" : ""} key={`${run.id}-${index}`}>
                <time>{new Date(line.at).toLocaleTimeString("vi-VN", { hour12: false })}</time>
                {batch.length > 1 ? <em style={{ borderColor: colorOf(run.speakerProfileId) }}>{nameOf(run.speakerProfileId)}</em> : null}
                <span>{STEP_LABELS[line.stepId] ?? line.stepId}</span>
                <code>{message}</code>
              </li>
            );
          })}
          {!lines.length ? <li className="training-log__empty">Chưa có dòng log nào. Tick voice target và bấm Bắt đầu ở panel Train; từng bước và lệnh chạy sẽ hiện ở đây.</li> : null}
        </ol>
      </section>

      <footer aria-label="Tiến trình tổng" className="training-overall">
        <div className="training-overall__head">
          <span>TỔNG</span>
          <b>{percent(overall)}</b>
          <small>{targets.length ? `${targets.filter((target) => target.run?.status === "complete").length}/${targets.length} voice xong` : "Chưa tick voice target"}</small>
          {live ? <button className="button button--quiet" disabled={busy} onClick={() => onCancelRun?.(live.id)} type="button">Huỷ · giữ checkpoint</button> : null}
        </div>
        <div className="training-overall__bar" role="progressbar" aria-label="Tiến trình training tổng" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(overall * 100)}>
          {targets.map((target) => <span key={target.key}><i style={{ width: percent(target.fraction) }} /></span>)}
        </div>
        <div className="training-overall__targets" style={{ gridTemplateColumns: `repeat(${Math.max(1, targets.length)}, minmax(0, 1fr))` }}>
          {targets.map((target) => (
            <div className={`training-target ${target.run ? `is-${target.run.status}` : ""}`} key={target.key}>
              <span><i style={{ background: colorOf(target.speakerId) }} />{nameOf(target.speakerId)}</span>
              <b>{percent(target.fraction)}</b>
              <div className="training-target__bar" role="progressbar" aria-label={`Tiến trình ${nameOf(target.speakerId)}`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(target.fraction * 100)}><i style={{ width: percent(target.fraction) }} /></div>
              <small>{target.run ? STATUS_LABELS[target.run.status] : "Chưa chạy"}</small>
            </div>
          ))}
        </div>
      </footer>
    </ModuleFrame>
  );
}
