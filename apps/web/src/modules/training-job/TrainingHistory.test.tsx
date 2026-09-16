import { describe, expect, it } from "vitest";

import { deleteRunQuestion, formatBytes } from "./TrainingHistory";
import type { TrainingRun, TrainingRunFootprint } from "../../domain/types";

const RUN = {
  version: 1, id: "run-abc", projectId: "p1", manifestId: "dataset-1", status: "complete", stepId: "publish",
  globalStep: 500, emotion: "normal", speakerProfileId: "speaker-an", checkpoints: [], error: null,
  createdAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T01:00:00Z",
  config: { modelId: "omnivoice-lora", steps: 500, saveSteps: 1000, learningRate: 1e-4, loraR: 16 },
} as unknown as TrainingRun;

function footprint(overrides: Partial<TrainingRunFootprint> = {}): TrainingRunFootprint {
  return { runId: "run-abc", bytes: 2_700_000_000, voices: [], asrAdapters: [], ...overrides };
}

describe("training history", () => {
  it("says what a delete takes and how much room it frees", () => {
    const question = deleteRunQuestion(RUN, footprint({
      voices: [{ id: "voice-1", name: "Anh Vũ · LoRA" }],
      asrAdapters: [{ id: "asr-1", name: "Anh Vũ · VibeVoice-ASR LoRA" }],
    }), "Anh Vũ");

    expect(question).toContain("run-abc");
    expect(question).toContain("2.5 GB");
    expect(question).toContain("• voice Anh Vũ · LoRA");
    expect(question).toContain("• adapter Anh Vũ · VibeVoice-ASR LoRA");
    expect(question).toContain("Không khôi phục được");
  });

  it("says plainly when a run made nothing, so deleting it loses nothing else", () => {
    expect(deleteRunQuestion(RUN, footprint(), "Anh Vũ")).toContain("chưa tạo voice hay adapter nào");
  });

  it("reports sizes in the unit a person reads", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
