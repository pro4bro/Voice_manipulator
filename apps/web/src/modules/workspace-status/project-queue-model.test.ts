import { describe, expect, it } from "vitest";
import type { ActivityTask, ProjectMediaAsset } from "../../domain/types";
import { buildQueueSlots, queueProgress } from "./project-queue-model";

function task(id: string, overrides: Partial<ActivityTask> & Record<string, unknown> = {}): ActivityTask {
  return { id, kind: "stt", label: id, detail: "", status: "running", fraction: null, etaSeconds: null, startedAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides } as ActivityTask;
}

describe("project queue model", () => {
  it("joins live OBS task history to its published footage archive", () => {
    const slots = buildQueueSlots([
      task("live", { footageId: "obs-recording:recording", assetId: "obs-channel:recording:mic", status: "complete", fraction: 1 }),
      task("import", { kind: "import", footageId: "archive", assetId: "archive", fraction: .5 }),
    ], "footage", [
      { id: "archive", name: "recording.mka", obsRecordingId: "recording" },
      { id: "mic", name: "Mic", sourceArchiveAssetId: "archive", obsRecordingId: "recording" },
    ] as ProjectMediaAsset[]);
    expect(slots).toHaveLength(1);
    expect(slots[0].fraction).toBe(.75);
    expect(slots[0].label).toBe("recording.mka");
  });
  it("groups multitrack work by footage/archive and averages child fractions", () => {
    const assets = [
      { id: "archive", name: "meeting.mka" },
      { id: "track-1", name: "Track 1", sourceArchiveAssetId: "archive" },
      { id: "track-2", name: "Track 2", sourceArchiveAssetId: "archive" },
    ] as ProjectMediaAsset[];
    const slots = buildQueueSlots([
      task("a", { assetId: "track-1", fraction: 0.25 }),
      task("b", { assetId: "track-2", kind: "import", fraction: 0.75 }),
    ], "footage", assets);

    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe("meeting.mka");
    expect(slots[0].tasks).toHaveLength(2);
    expect(slots[0].fraction).toBe(0.5);
  });

  it("makes a slot and aggregate unknown when any included child has unknown progress", () => {
    const slots = buildQueueSlots([
      task("known", { footageId: "f1", fraction: 0.9 }),
      task("unknown", { footageId: "f1", kind: "alignment", fraction: null }),
      task("other", { footageId: "f2", fraction: 0.5 }),
    ], "footage");
    expect(slots.find((slot) => slot.id === "footage:f1")?.fraction).toBeNull();
    expect(queueProgress(slots)).toBeNull();
  });

  it("groups retries by kind and asset, choosing latest start and retaining concurrent jobs", () => {
    const slots = buildQueueSlots([
      task("old", { footageId: "f", assetId: "track-a", kind: "stt", label: "Same label", status: "complete", fraction: 0.2, startedAt: "2026-01-01", updatedAt: "2026-01-04" }),
      task("new", { footageId: "f", assetId: "track-a", kind: "stt", label: "Same label", fraction: 0.8, startedAt: "2026-01-02", updatedAt: "2026-01-02" }),
      task("parallel", { footageId: "f", assetId: "track-b", kind: "stt", label: "Same label", fraction: 0.6, startedAt: "2026-01-01" }),
      task("running-old", { footageId: "f", assetId: "track-a", kind: "alignment", status: "running", fraction: 0.3, startedAt: "2026-01-01" }),
      task("queued-new", { footageId: "f", assetId: "track-a", kind: "alignment", status: "queued", fraction: null, startedAt: "2026-01-02" }),
      task("queued-older", { footageId: "f", assetId: "track-a", kind: "alignment", status: "queued", fraction: null, startedAt: "2025-12-31" }),
    ], "footage");
    const ids = slots[0].tasks.map((item) => item.id);
    expect(ids).toContain("new");
    expect(ids).toContain("parallel");
    expect(ids).toContain("running-old");
    expect(ids).toContain("queued-new");
    expect(ids).toContain("queued-older");
    expect(slots[0].history.map((item) => item.id)).toEqual(["old"]);
    expect(slots[0].fraction).toBeNull();
  });

  it("leaves unknown progress unknown and maps generation aliases", () => {
    const slots = buildQueueSlots([task("x", { kind: "tts", fraction: null })], "generate");
    expect(slots[0].fraction).toBeNull();
    expect(queueProgress(slots)).toBeNull();
  });

  it("keeps cancelled work out of Done", () => {
    const slots = buildQueueSlots([task("cancelled", { kind: "import", status: "cancelled", fraction: 0.3 })], "footage");
    expect(slots[0].status).toBe("cancelled");
  });

  it("nests non-footage children under their parent and averages leaves only", () => {
    const slots = buildQueueSlots([
      task("batch", { kind: "generate", label: "Voice batch", status: "running", fraction: 0.1 }),
      task("row-a", { kind: "tts", label: "Line A", parentTaskId: "batch", assetId: "row-a", status: "complete", fraction: 1, startedAt: "2026-01-02" }),
      task("row-b", { kind: "tts", label: "Line B", parentTaskId: "batch", assetId: "row-b", status: "running", fraction: 0.5, startedAt: "2026-01-03" }),
      task("orphan", { kind: "tts", label: "Orphan", parentTaskId: "missing", assetId: "orphan", fraction: 0.3 }),
    ], "generate");

    const batch = slots.find((slot) => slot.id === "task:batch");
    expect(batch?.tasks[0].children?.map((child) => child.id)).toEqual(["row-a", "row-b"]);
    expect(batch?.fraction).toBe(0.75);
    expect(batch?.status).toBe("running");
    expect(batch?.currentOperation?.id).toBe("row-b");
    expect(slots.some((slot) => slot.id === "task:row-a")).toBe(false);
    expect(slots.some((slot) => slot.id === "task:orphan")).toBe(true);
  });

  it("retains a parent failure even when child rows show completion", () => {
    const slots = buildQueueSlots([
      task("batch", { kind: "generate", status: "failed", fraction: null }),
      task("row", { kind: "tts", parentTaskId: "batch", assetId: "row", status: "complete", fraction: 1 }),
    ], "generate");
    expect(slots[0].status).toBe("failed");
    expect(slots[0].fraction).toBe(1);
  });
});
