import type { ActivityTask, ProjectMediaAsset } from "../../domain/types";

export const queueCategories = [
  { id: "footage", label: "Footage" }, { id: "training", label: "Training" },
  { id: "generate", label: "Generate" }, { id: "lipsync", label: "Lip Sync" },
  { id: "export", label: "Export" }, { id: "other", label: "Other" },
] as const;
export type QueueCategory = typeof queueCategories[number]["id"];

export type QueueTask = Omit<ActivityTask, "status"> & { status: ActivityTask["status"] | "queued" | "interrupted" } & {
  assetId?: string | null; footageId?: string | null; parentTaskId?: string | null; groupLabel?: string | null;
  children?: QueueTask[];
};
export interface QueueSlot {
  id: string; label: string; tasks: QueueTask[]; history: QueueTask[];
  status: "running" | "queued" | "failed" | "cancelled" | "interrupted" | "complete";
  fraction: number | null;
  currentOperation: QueueTask | null;
}

export function queueCategoryFor(kind: string): QueueCategory {
  switch (kind.toLowerCase()) {
    case "import": case "stt": case "alignment": case "diarization": return "footage";
    case "training": return "training";
    case "tts": case "generate": return "generate";
    case "lipsync": case "lip_sync": return "lipsync";
    case "export": return "export";
    default: return "other";
  }
}

const isDone = (task: QueueTask) => task.status === "complete";
function taskAsset(task: QueueTask): string | null { return task.footageId ?? task.assetId ?? null; }

function resolveFootage(task: QueueTask, assets: ProjectMediaAsset[]): string | null {
  const direct = taskAsset(task);
  if (!direct) return null;
  if (direct.startsWith("obs-recording:")) {
    const recordingId = direct.slice("obs-recording:".length);
    const recorded = assets.find((item) => item.obsRecordingId === recordingId && item.sourceArchiveAssetId)
      ?? assets.find((item) => item.obsRecordingId === recordingId);
    if (recorded) return recorded.sourceArchiveAssetId ?? recorded.id;
  }
  const asset = assets.find((item) => item.id === direct);
  return asset?.sourceArchiveAssetId ?? direct;
}

function statusOf(tasks: QueueTask[]): QueueSlot["status"] {
  if (tasks.some((task) => task.status === "failed")) return "failed";
  if (tasks.some((task) => task.status === "cancelled")) return "cancelled";
  if (tasks.some((task) => task.status === "interrupted")) return "interrupted";
  if (tasks.some((task) => task.status === "running")) return "running";
  if (tasks.some((task) => task.status === "queued")) return "queued";
  return "complete";
}

function average(tasks: QueueTask[]): number | null {
  if (!tasks.length || tasks.some((task) => task.fraction === null || !Number.isFinite(task.fraction))) return null;
  return tasks.reduce((sum, task) => sum + task.fraction!, 0) / tasks.length;
}

function operationKey(task: QueueTask): string {
  // Training resumes reuse a run ID. ProjectTaskHistory archives the previous
  // receipt as `<task-id>@<started-at>`, so strip that attempt suffix to keep
  // older runs under the current run's History instead of a second Queue slot.
  const identity = task.kind.toLowerCase() === "training" && task.id.startsWith("training:")
    ? task.id.split("@")[0] : task.assetId || task.id;
  return task.kind + "\0" + identity;
}

function latestAttempts(tasks: QueueTask[]): { current: QueueTask[]; history: QueueTask[] } {
  const byOperation = new Map<string, QueueTask[]>();
  for (const task of tasks) {
    const key = operationKey(task);
    byOperation.set(key, [...(byOperation.get(key) ?? []), task]);
  }
  const current: QueueTask[] = [];
  const history: QueueTask[] = [];
  for (const attempts of byOperation.values()) {
    attempts.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const latest = attempts[0];
    current.push(latest);
    const concurrent = attempts.slice(1).filter((task) => task.status === "running" || task.status === "queued");
    current.push(...concurrent);
    const currentIds = new Set([latest.id, ...concurrent.map((task) => task.id)]);
    history.push(...attempts.slice(1).filter((task) => !currentIds.has(task.id)));
  }
  current.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  history.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { current, history };
}

export function buildQueueSlots(tasks: ActivityTask[], category: QueueCategory, assets: ProjectMediaAsset[] = []): QueueSlot[] {
  const selected = (tasks as QueueTask[]).filter((task) => queueCategoryFor(task.kind) === category);
  const latest = latestAttempts(selected);
  const groups = new Map<string, QueueTask[]>();
  for (const task of latest.current) {
    const footage = category === "footage" ? resolveFootage(task, assets) : null;
    const id = footage ? `footage:${footage}` : category === "footage" ? `task:${task.id}` : "pending-tree";
    groups.set(id, [...(groups.get(id) ?? []), task]);
  }

  if (category !== "footage") {
    const byId = new Map(latest.current.map((task) => [task.id, task]));
    const children = new Map<string, QueueTask[]>();
    const roots: QueueTask[] = [];
    for (const task of latest.current) {
      if (task.parentTaskId && byId.has(task.parentTaskId) && task.parentTaskId !== task.id) {
        children.set(task.parentTaskId, [...(children.get(task.parentTaskId) ?? []), task]);
      } else roots.push(task);
    }
    const buildTree = (task: QueueTask, seen = new Set<string>()): QueueTask => {
      if (seen.has(task.id)) return task;
      const nextSeen = new Set(seen).add(task.id);
      return { ...task, children: (children.get(task.id) ?? []).map((child) => buildTree(child, nextSeen)) };
    };
    const treeRoots = roots.length ? roots : latest.current;
    const slots = treeRoots.map((root) => {
      const tree = buildTree(root);
      const all = flattenTasks([tree]);
      const leaves = leafTasks([tree]);
      const rootHistory = latest.history.filter((task) => task.parentTaskId === root.id
        || task.id === root.id || operationKey(task) === operationKey(root));
      const activeChildren = all.filter((task) => task.id !== tree.id);
      const currentOperation = activeChildren.find((task) => task.status === "running") ?? activeChildren.find((task) => task.status === "queued") ?? tree;
      return { id: `task:${root.id}`, label: root.groupLabel ?? root.label, tasks: [tree], history: rootHistory, status: statusOf(all), fraction: average(leaves), currentOperation };
    });
    return slots.sort((a, b) => a.tasks[0].startedAt.localeCompare(b.tasks[0].startedAt));
  }

  return [...groups].map(([id, group]) => {
    const current = group;
    const history = latest.history.filter((task) => resolveFootage(task, assets) === id.slice("footage:".length));
    const assetId = resolveFootage(current[0], assets);
    const asset = assets.find((item) => item.id === assetId);
    const label = asset?.name ?? current[0].groupLabel ?? current[0].label;
    const currentOperation = current.find((task) => task.status === "running") ?? current.find((task) => task.status === "queued") ?? current[current.length - 1];
    return { id, label, tasks: current, history, status: statusOf(current), fraction: average(current), currentOperation };
  }).sort((a, b) => a.tasks[0].startedAt.localeCompare(b.tasks[0].startedAt));
}

function flattenTasks(tasks: QueueTask[]): QueueTask[] { return tasks.flatMap((task) => [task, ...flattenTasks(task.children ?? [])]); }
function leafTasks(tasks: QueueTask[]): QueueTask[] { return tasks.flatMap((task) => task.children?.length ? leafTasks(task.children) : [task]); }

export function queueProgress(slots: QueueSlot[]): number | null {
  if (!slots.length || slots.some((slot) => slot.fraction === null || !Number.isFinite(slot.fraction))) return null;
  return slots.reduce((sum, slot) => sum + slot.fraction!, 0) / slots.length;
}

export function isQueueDone(slot: QueueSlot): boolean { return slot.status === "complete"; }
