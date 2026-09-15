import { describe, expect, it } from "vitest";

import { activeRun, newestBatch, runFraction, trainingActivity } from "./trainingBatch";
import type { TrainingRun } from "./types";

function run(overrides: Partial<TrainingRun> = {}): TrainingRun {
  return {
    version: 1, id: "run-1", projectId: "p", manifestId: "d", status: "running", stepId: "train", globalStep: 0,
    emotion: "normal", speakerProfileId: "s1", checkpoints: [], error: null,
    createdAt: "2026-09-04T00:00:00Z", updatedAt: "2026-09-04T00:00:00Z",
    config: { steps: 1000, saveSteps: 100, learningRate: 1e-4, loraR: 16 },
    ...overrides,
  };
}

describe("training batch", () => {
  it("tells the status bar which voice trains, where it is and how long is left", () => {
    const line = { at: "", stepId: "train" as const, message: "", loss: null, devLoss: null, learningRate: null, vramMb: null, done: null, total: null };
    const live = run({ id: "r1", status: "running", stepId: "train", globalStep: 1000, speakerProfileId: "speaker-an" });
    const activity = trainingActivity([live], { r1: [{ ...line, globalStep: 1000, stepsPerSecond: 2 }] }, [{ id: "speaker-an", name: "Anh Vũ" } as never]);

    expect(activity?.stage).toBe("TRAINING");
    expect(activity?.name).toBe("Anh Vũ");
    expect(activity?.detail).toContain(`STEP 1000/${live.config.steps}`);
    expect(activity?.detail).toContain("2.00 step/s");
    expect(activity?.percent).toBeGreaterThan(15);
    expect(trainingActivity([run({ status: "complete" })], {})).toBeNull();
  });

  it("moves with global step through training, which is most of the bar", () => {
    expect(runFraction(run({ status: "pending", stepId: "provision" }))).toBe(0);
    expect(runFraction(run({ stepId: "read-manifest" }))).toBeGreaterThan(0);
    const half = runFraction(run({ globalStep: 500 }));
    expect(half).toBeGreaterThan(0.5);
    expect(half).toBeLessThan(runFraction(run({ globalStep: 1000 })));
    expect(runFraction(run({ status: "complete", stepId: "checkpoint" }))).toBe(1);
  });

  it("moves through tokenizing by shard", () => {
    const tokenizing = run({ stepId: "tokenize" });
    const line = { at: "", stepId: "tokenize" as const, message: "", globalStep: null, loss: null, devLoss: null, learningRate: null, stepsPerSecond: null, vramMb: null };
    expect(runFraction(tokenizing, [{ ...line, done: 8, total: 8 }])).toBeGreaterThan(runFraction(tokenizing, [{ ...line, done: 1, total: 8 }]));
  });

  it("takes the newest batch in training order, and treats an old single run as its own batch", () => {
    const runs = [
      run({ id: "old", createdAt: "2026-09-01T00:00:00Z", batchId: null }),
      run({ id: "b2", createdAt: "2026-09-04T00:00:01Z", batchId: "batch-x", batchIndex: 1, status: "pending" }),
      run({ id: "b1", createdAt: "2026-09-04T00:00:00Z", batchId: "batch-x", batchIndex: 0, status: "complete" }),
    ];

    expect(newestBatch(runs).map((item) => item.id)).toEqual(["b1", "b2"]);
    expect(newestBatch([runs[0]]).map((item) => item.id)).toEqual(["old"]);
    expect(activeRun(newestBatch(runs))?.id).toBe("b1");
  });
});
