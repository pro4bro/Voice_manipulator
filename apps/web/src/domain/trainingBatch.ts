import { formatDuration } from "./reading-plan";
import type { SpeakerProfile, TrainingProgressLine, TrainingRun, TrainingStepId } from "./types";

/**
 * How far a run has come, as one number for a progress bar.
 *
 * Training itself is nearly the whole wall clock, so it gets nearly the whole
 * bar and moves with global step. The steps before it are short but not
 * instant - tokenizing an hour of audio takes minutes - so they get a sliver
 * each rather than none, which would leave the bar frozen at zero while work
 * is plainly happening in the log.
 */
const STEP_START: Record<TrainingStepId, number> = {
  provision: 0,
  "resolve-model": 0,
  "read-manifest": 0.01,
  "write-jsonl": 0.03,
  tokenize: 0.06,
  "load-model": 0.12,
  train: 0.15,
  checkpoint: 0.96,
  publish: 0.98,
};

export function runFraction(run: TrainingRun, progress: TrainingProgressLine[] = []): number {
  if (run.status === "complete") return 1;
  if (run.status === "pending" && run.stepId === "provision" && !progress.length) return 0;
  if (run.stepId === "train" || (run.globalStep > 0 && run.stepId !== "checkpoint" && run.stepId !== "publish")) {
    const steps = Math.max(1, run.config.steps || 1);
    return clamp(STEP_START.train + (STEP_START.checkpoint - STEP_START.train) * Math.min(1, run.globalStep / steps));
  }
  if (run.stepId === "tokenize") {
    const shards = [...progress].reverse().find((line) => line.stepId === "tokenize" && line.total);
    if (shards?.total) {
      return clamp(STEP_START.tokenize + (STEP_START["load-model"] - STEP_START.tokenize) * Math.min(1, (shards.done ?? 0) / shards.total));
    }
  }
  return STEP_START[run.stepId] ?? 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** The newest batch, in the order its voices train. A run without a batch is its own. */
export function newestBatch(runs: TrainingRun[]): TrainingRun[] {
  const newest = [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!newest) return [];
  if (!newest.batchId) return [newest];
  return runs
    .filter((run) => run.batchId === newest.batchId)
    .sort((left, right) => (left.batchIndex ?? 0) - (right.batchIndex ?? 0));
}

export function isLive(run: TrainingRun) {
  return run.status === "pending" || run.status === "running";
}

/** The run doing the work now, or the last one that did. */
export function activeRun(batch: TrainingRun[]): TrainingRun | null {
  return batch.find((run) => run.status === "running")
    ?? [...batch].reverse().find((run) => run.status !== "pending")
    ?? batch[0]
    ?? null;
}

const ACTIVITY_STAGES: Partial<Record<TrainingStepId, string>> = {
  provision: "TRAIN · MÔI TRƯỜNG",
  "resolve-model": "TRAIN · MODEL",
  "read-manifest": "TRAIN · DATASET",
  "write-jsonl": "TRAIN · DATASET",
  tokenize: "TRAIN · TOKENIZE",
  "load-model": "TRAIN · LOAD MODEL",
  train: "TRAINING",
  checkpoint: "TRAIN · CHECKPOINT",
  publish: "TRAIN · PUBLISH",
};

export interface TrainingActivity {
  stage: string;
  name: string;
  detail: string;
  /** 0-100, over the whole batch. */
  percent: number;
}

/** What the status bar says while a batch trains, or null when none does. */
export function trainingActivity(
  batch: TrainingRun[],
  progressByRun: Record<string, TrainingProgressLine[]>,
  speakers: SpeakerProfile[] = [],
): TrainingActivity | null {
  const run = batch.find((item) => item.status === "running") ?? batch.find((item) => item.status === "pending");
  if (!run) return null;
  const progress = progressByRun[run.id] ?? [];
  const speaker = speakers.find((item) => item.id === run.speakerProfileId)?.name ?? "Toàn bộ dataset";
  const done = batch.filter((item) => item.status === "complete").length;
  const parts: string[] = [];
  if (batch.length > 1) parts.push(`${done}/${batch.length} VOICE`);
  if (run.stepId === "train" || run.globalStep > 0) {
    parts.push(`STEP ${run.globalStep}/${run.config.steps}`);
    const rate = [...progress].reverse().find((line) => line.stepsPerSecond)?.stepsPerSecond;
    if (rate && run.status === "running") {
      parts.push(`${rate.toFixed(2)} step/s · còn ~${formatDuration(Math.max(0, run.config.steps - run.globalStep) / rate)}`);
    }
  }
  const overall = batch.reduce((sum, item) => sum + runFraction(item, progressByRun[item.id]), 0) / Math.max(1, batch.length);
  return {
    stage: run.status === "pending" ? "TRAIN · CHỜ GPU" : ACTIVITY_STAGES[run.stepId] ?? "TRAINING",
    name: speaker,
    detail: parts.join(" · "),
    percent: overall * 100,
  };
}
