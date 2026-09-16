import { useEffect, useMemo, useRef, useState } from "react";

import { formatDuration } from "../../domain/reading-plan";
import { activeRun, isLive, runFraction, runTimings } from "../../domain/trainingBatch";
import type { ActivityEvent, ActivityTask, ProjectAsrAdapter, SpeakerProfile, TrainingProgressLine, TrainingRun, TrainingStepId } from "../../domain/types";
import { describeTask, isLiveTask, sortTasks } from "../../domain/activity";
import { Icon, type IconName } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { RunLogDialog, TrainingHistoryDialog } from "./TrainingHistory";

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
  projectId?: string;
  /** Every run of the project, for the history and its delete. */
  runs?: TrainingRun[];
  adapters?: ProjectAsrAdapter[];
  /** The app's own log and jobs, so this panel shows the whole app, not just training. */
  activityEvents?: ActivityEvent[];
  activityTasks?: ActivityTask[];
  /** Runs, voices or adapters changed on disk; refresh what shows them. */
  onRunsChanged?: () => void;
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

/** VibeVoice trainers read audio directly: no tokenize step, and an ASR run publishes an STT choice. */
const VIBEVOICE_TTS_FLOW: FlowStep[] = [
  { id: "read-manifest", label: "Dataset manifest", detail: "Lọc đoạn của voice target", icon: "file" },
  { id: "write-jsonl", label: "Viết dữ liệu", detail: "JSONL + voice prompt", icon: "list" },
  { id: "load-model", label: "Nạp model", detail: "VibeVoice + LoRA", icon: "settings" },
  { id: "train", label: "Train", detail: "Loss theo epoch", icon: "training" },
  { id: "checkpoint", label: "Checkpoint", detail: "Lưu adapter", icon: "folder" },
  { id: "publish", label: "Publish voice", detail: "Dùng ở Voice Manipulation", icon: "spark" },
];

const VIBEVOICE_ASR_FLOW: FlowStep[] = VIBEVOICE_TTS_FLOW.map((step) =>
  step.id === "write-jsonl" ? { ...step, detail: "Audio + nhãn JSON" }
    : step.id === "publish" ? { ...step, label: "Publish adapter", detail: "Thêm vào Speech to Text" }
      : step,
);

/** RVC through Applio: audio in, pitch and content features, then the model and its retrieval index. */
const RVC_FLOW: FlowStep[] = [
  { id: "read-manifest", label: "Dataset manifest", detail: "Lọc đoạn của voice target", icon: "file" },
  { id: "write-jsonl", label: "Xuất audio", detail: "Một WAV mỗi đoạn", icon: "list" },
  { id: "tokenize", label: "Đặc trưng", detail: "Cắt 40 kHz · RMVPE + ContentVec", icon: "waveform" },
  { id: "train", label: "Train RVC", detail: "Theo epoch", icon: "training" },
  { id: "checkpoint", label: "Model + index", detail: "Lưu .pth và index", icon: "folder" },
  { id: "publish", label: "Publish voice", detail: "Dùng ở Voice Changer", icon: "spark" },
];

export function flowForMode(mode: string | null | undefined): FlowStep[] {
  if (mode === "zero-shot-clone") return CLONE_FLOW;
  if (mode === "vc-train") return RVC_FLOW;
  if (mode === "tts-lora") return VIBEVOICE_TTS_FLOW;
  if (mode === "asr-lora") return VIBEVOICE_ASR_FLOW;
  return TRAINING_FLOW;
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

/** One line of the panel's log, from a run's journal or from the app's stream. */
interface LogRow {
  key: string;
  at: string;
  source: string;
  level: "info" | "warning" | "error";
  text: string;
  repeat: number;
  run: TrainingRun | null;
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
  if (line.globalStep !== null && !line.total) parts.push(`step ${line.globalStep}`);
  if (line.loss !== null) parts.push(`loss ${line.loss.toFixed(4)}`);
  if (line.devLoss !== null) parts.push(`dev loss ${line.devLoss.toFixed(4)}`);
  if (line.learningRate !== null) parts.push(`lr ${line.learningRate.toExponential(2)}`);
  if (line.stepsPerSecond !== null) parts.push(`${line.stepsPerSecond.toFixed(2)} step/s`);
  if (line.total) parts.push(line.stepId === "tokenize" ? `${line.done ?? 0}/${line.total} shard` : `step ${line.done ?? 0}/${line.total}`);
  return parts.join(" · ");
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function TrainingJob({ speakers, targetSpeakerIds = [], batch = [], progressByRun = {}, selectedMode = null, busy = false, onCancelRun, projectId, runs = [], adapters = [], activityEvents = [], activityTasks = [], onRunsChanged }: TrainingJobProps) {
  const logRef = useRef<HTMLOListElement>(null);
  const [follow, setFollow] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logRun, setLogRun] = useState<TrainingRun | null>(null);
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
    const merged: LogRow[] = batch.flatMap((run) => (progressByRun[run.id] ?? []).map((line) => ({
      key: `${run.id}-${line.at}-${line.message}`,
      at: line.at,
      source: STEP_LABELS[line.stepId] ?? line.stepId,
      level: line.level ?? "info",
      text: logMessage(line),
      repeat: 1,
      run,
    })));
    // Training's own lines are already here through the journal; everything else
    // the app did - STT, TTS, model loading, the API - comes from the stream.
    for (const event of activityEvents) {
      if (event.source === "training") continue;
      merged.push({
        key: `event-${event.seq}`,
        at: event.at,
        source: event.source.toUpperCase(),
        level: event.level,
        text: event.message,
        repeat: event.repeat,
        run: null,
      });
    }
    return merged.sort((left, right) => left.at.localeCompare(right.at));
  }, [activityEvents, batch, progressByRun]);

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

  const problems = useMemo(() => ({
    errors: lines.filter((row) => row.level === "error").length,
    warnings: lines.filter((row) => row.level === "warning").length,
  }), [lines]);

  // Every other job the app is doing, listed under the flow so this page is
  // never the only thing that looks busy.
  const otherJobs = useMemo(
    () => sortTasks(activityTasks.filter((task) => isLiveTask(task) && task.kind !== "training")),
    [activityTasks],
  );
  const timings = current ? runTimings(current, currentProgress) : null;

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
      action={<span className="training-job-actions">
        {projectId ? <button className="button button--quiet" onClick={() => setHistoryOpen(true)} title="Mọi run của project, dung lượng và nút xoá" type="button"><Icon name="list" /> Lịch sử · {runs.length}</button> : null}
        {current ? <span className={`run-status run-status--${current.status}`}>{STATUS_LABELS[current.status]}</span> : null}
      </span>}
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
        {current && timings ? (
          <p className="training-rate">
            {current.status === "running" ? <>
              Đã chạy {formatDuration(timings.elapsedSeconds)}
              {latest?.stepsPerSecond ? ` · ${latest.stepsPerSecond.toFixed(2)} step/s` : ""}
              {timings.remainingSeconds !== null ? ` · còn khoảng ${formatDuration(timings.remainingSeconds)} cho voice này` : " · chưa ước lượng được thời gian còn lại"}
            </> : <>
              {STATUS_LABELS[current.status]} · tổng {timings.totalText ?? formatDuration(timings.elapsedSeconds)}
              {timings.trainText ? ` · riêng train ${timings.trainText}` : ""}
            </>}
          </p>
        ) : null}
        {otherJobs.length ? (
          <ul className="training-other-jobs">
            {otherJobs.map((task) => {
              const line = describeTask(task);
              return <li key={task.id}><b>{line.stage}</b><span>{line.label}</span><small>{line.detail}</small>{line.percent !== null ? <i><em style={{ width: `${line.percent}%` }} /></i> : null}</li>;
            })}
          </ul>
        ) : null}
        {current?.error ? <p className="training-note is-error">{nameOf(current.speakerProfileId)}: {current.error}</p> : null}
        {current?.status === "interrupted" ? <p className="training-note">Tiến trình dừng cùng app. Checkpoint vẫn còn, chạy tiếp được từ mốc cuối.</p> : null}
      </section>

      <section aria-label="Log training" className="training-log">
        <header>
          <span>LOG · {lines.length} dòng{problems.errors ? ` · ${problems.errors} lỗi` : ""}{problems.warnings ? ` · ${problems.warnings} cảnh báo` : ""}</span>
          {projectId && current ? <button className="training-log__full" onClick={() => setLogRun(current)} title="Mọi dòng log và output engine (process.log) của run này" type="button">Log đầy đủ</button> : null}
          <label><input checked={follow} onChange={(event) => setFollow(event.target.checked)} type="checkbox" />Tự cuộn</label>
        </header>
        <ol onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
          if (atBottom !== follow) setFollow(atBottom);
        }} ref={logRef}>
          {lines.map((row, index) => (
            <li className={[row.text.startsWith("$ ") ? "is-command" : "", row.level !== "info" ? `is-${row.level}` : ""].filter(Boolean).join(" ")} key={`${row.key}-${index}`}>
              <time>{new Date(row.at).toLocaleTimeString("vi-VN", { hour12: false })}</time>
              {batch.length > 1 && row.run ? <em style={{ borderColor: colorOf(row.run.speakerProfileId) }}>{nameOf(row.run.speakerProfileId)}</em> : null}
              <span>{row.source}</span>
              <code>{row.text}{row.repeat > 1 ? <b className="training-log__repeat" title={`Dòng này lặp ${row.repeat} lần`}>…{row.repeat}…</b> : null}</code>
            </li>
          ))}
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
      {historyOpen && projectId ? <TrainingHistoryDialog adapters={adapters} onChanged={() => onRunsChanged?.()} onClose={() => setHistoryOpen(false)} onOpenLog={setLogRun} projectId={projectId} runs={runs} speakers={speakers} /> : null}
      {logRun && projectId ? <RunLogDialog onClose={() => setLogRun(null)} projectId={projectId} run={runs.find((run) => run.id === logRun.id) ?? logRun} /> : null}
    </ModuleFrame>
  );
}
