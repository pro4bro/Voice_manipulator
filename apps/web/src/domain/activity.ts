import { formatDuration } from "./reading-plan";
import type { ActivityEvent, ActivityTask } from "./types";

/**
 * What the app is doing, said the same way everywhere it is shown.
 *
 * Every long job in the app - training, Speech to Text, diarization, TTS, a
 * voice changer session, a model being loaded - reports into one stream on the
 * API. The status bar, the Script module's progress strip and the Voice
 * Training log all read that one stream, so nothing can be running with the app
 * looking idle.
 */

/** Which job a person cares about most when several run at once. */
const PRIORITY = ["training", "stt", "diarization", "tts", "voice-changer", "model", "engine"];

export const TASK_STAGES: Record<string, string> = {
  training: "TRAINING",
  stt: "SPEECH TO TEXT",
  diarization: "TÁCH NGƯỜI NÓI",
  tts: "TẠO GIỌNG",
  "voice-changer": "VOICE CHANGER",
  model: "NẠP MODEL",
  engine: "ENGINE",
};

export function isLiveTask(task: ActivityTask): boolean {
  return task.status === "running";
}

export function sortTasks(tasks: ActivityTask[]): ActivityTask[] {
  const rank = (task: ActivityTask) => {
    const index = PRIORITY.indexOf(task.kind);
    return index === -1 ? PRIORITY.length : index;
  };
  return [...tasks].sort((left, right) => rank(left) - rank(right) || left.startedAt.localeCompare(right.startedAt));
}

/** The job the status bar leads with, or null when the app is idle. */
export function primaryTask(tasks: ActivityTask[]): ActivityTask | null {
  const live = sortTasks(tasks.filter(isLiveTask));
  if (live.length) return live[0];
  const finished = [...tasks].sort((left, right) => (right.finishedAt ?? "").localeCompare(left.finishedAt ?? ""));
  return finished[0] ?? null;
}

export interface TaskLine {
  stage: string;
  label: string;
  detail: string;
  percent: number | null;
  live: boolean;
}

/**
 * One job as a line of text: where it is, how fast, how long it has taken and
 * how much is left. A finished job says how long it took, not just that it is
 * done - "đã train trong 22 phút" is what a person wants when they come back.
 */
export function describeTask(task: ActivityTask, now: number = Date.now()): TaskLine {
  const parts: string[] = [];
  if (task.detail) parts.push(task.detail);
  const elapsed = Math.max(0, (now - new Date(task.startedAt).getTime()) / 1000);
  if (task.status === "running") {
    parts.push(`đã chạy ${formatDuration(elapsed)}`);
    if (task.etaSeconds != null) parts.push(`còn ~${formatDuration(task.etaSeconds)}`);
  } else {
    const seconds = task.seconds ?? elapsed;
    parts.push(`${statusWord(task)} sau ${formatDuration(seconds)}`);
    if (task.error) parts.push(task.error);
  }
  return {
    stage: TASK_STAGES[task.kind] ?? task.kind.toUpperCase(),
    label: task.label,
    detail: parts.join(" · "),
    percent: task.fraction == null ? null : Math.round(task.fraction * 100),
    live: task.status === "running",
  };
}

function statusWord(task: ActivityTask): string {
  if (task.status === "failed") return "Lỗi";
  if (task.status === "cancelled") return "Đã huỷ";
  return "Xong";
}

/**
 * Add what the API just sent to what the page already has.
 *
 * A repeated line comes back with a higher sequence and a bigger count, in
 * place of the copy already held, so the log shows "…129…" rather than 129
 * lines or a line stuck at one.
 */
export function mergeEvents(held: ActivityEvent[], incoming: ActivityEvent[], cap = 1000): ActivityEvent[] {
  const merged = [...held];
  for (const event of incoming) {
    const last = merged[merged.length - 1];
    if (last && last.source === event.source && last.level === event.level && last.message === event.message) {
      merged[merged.length - 1] = event;
      continue;
    }
    if (merged.some((held) => held.seq === event.seq)) continue;
    merged.push(event);
  }
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}
