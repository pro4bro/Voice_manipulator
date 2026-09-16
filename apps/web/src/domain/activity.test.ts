import { describe, expect, it } from "vitest";

import { describeTask, mergeEvents, primaryTask, sortTasks } from "./activity";
import type { ActivityEvent, ActivityTask } from "./types";

function task(overrides: Partial<ActivityTask> = {}): ActivityTask {
  return {
    id: "task-1", kind: "tts", label: "Đọc Script · 12 đoạn", detail: "Đoạn 3/12", status: "running",
    fraction: 0.25, etaSeconds: null, startedAt: "2026-09-16T10:00:00Z", updatedAt: "2026-09-16T10:00:30Z",
    finishedAt: null, seconds: null, ...overrides,
  };
}

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return { seq: 1, at: "2026-09-16T10:00:00Z", source: "stt", level: "info", message: "đang nhận dạng", repeat: 1, ...overrides };
}

const NOW = new Date("2026-09-16T10:02:00Z").getTime();

describe("what the app is doing", () => {
  it("leads with training when several jobs run, and counts the rest", () => {
    const tasks = [task({ id: "a", kind: "tts" }), task({ id: "b", kind: "training" }), task({ id: "c", kind: "model" })];

    expect(primaryTask(tasks)?.id).toBe("b");
    expect(sortTasks(tasks).map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("falls back to the last thing that finished, so the end of a job is seen", () => {
    const finished = task({ id: "done", status: "complete", finishedAt: "2026-09-16T10:01:00Z", seconds: 60 });

    expect(primaryTask([finished])?.id).toBe("done");
  });

  it("says how long a running job has taken and how much is left", () => {
    const line = describeTask(task({ etaSeconds: 90 }), NOW);

    expect(line.stage).toBe("TẠO GIỌNG");
    expect(line.detail).toBe("Đoạn 3/12 · đã chạy 2m 00s · còn ~1m 30s");
    expect(line.percent).toBe(25);
    expect(line.live).toBe(true);
  });

  it("says exactly how long a finished job took", () => {
    const line = describeTask(task({
      kind: "training", label: "Training · Anh Vũ", detail: "step 550/550",
      status: "complete", fraction: 1, finishedAt: "2026-09-16T10:22:28Z", seconds: 1348,
    }), NOW);

    expect(line.detail).toBe("step 550/550 · Xong sau 22m 28s");
    expect(line.live).toBe(false);
  });

  it("carries the reason a job failed", () => {
    const line = describeTask(task({ status: "failed", error: "CUDA out of memory", seconds: 12 }), NOW);

    expect(line.detail).toContain("Lỗi sau 12s");
    expect(line.detail).toContain("CUDA out of memory");
  });
});

describe("the app's log", () => {
  it("replaces a line with its repeated self instead of adding another copy", () => {
    const held = mergeEvents([], [event({ seq: 1 })]);

    const after = mergeEvents(held, [event({ seq: 2, repeat: 129 })]);

    expect(after).toHaveLength(1);
    expect(after[0].repeat).toBe(129);
  });

  it("keeps lines that differ, and never the same sequence twice", () => {
    const held = mergeEvents([], [event({ seq: 1 }), event({ seq: 2, message: "xong" })]);

    const after = mergeEvents(held, [event({ seq: 2, message: "xong" }), event({ seq: 3, source: "tts", message: "xong" })]);

    expect(after.map((item) => item.seq)).toEqual([1, 2, 3]);
  });

  it("keeps only the newest lines when the log runs long", () => {
    const many = Array.from({ length: 20 }, (_, index) => event({ seq: index + 1, message: `dòng ${index}` }));

    const held = mergeEvents([], many, 5);

    expect(held.map((item) => item.seq)).toEqual([16, 17, 18, 19, 20]);
  });
});
