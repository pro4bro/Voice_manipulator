import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import { TrainingHistoryDialog, deleteRunQuestion, formatBytes } from "./TrainingHistory";
import type { ProjectAsrAdapter, TrainingRun, TrainingRunFootprint } from "../../domain/types";

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

  it("selects training runs and confirms their batch deletion once", async () => {
    const runs = [RUN, { ...RUN, id: "run-def" }];
    const readFootprint = vi.spyOn(api, "getTrainingRunFootprint").mockImplementation(async (_projectId, runId) => ({ ...footprint(), runId }));
    const deleteRun = vi.spyOn(api, "deleteTrainingRun").mockResolvedValue({ bytes: 0 } as Awaited<ReturnType<typeof api.deleteTrainingRun>>);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChanged = vi.fn();
    try {
      render(<TrainingHistoryDialog adapters={[]} onChanged={onChanged} onClose={vi.fn()} onOpenLog={vi.fn()} projectId="p1" runs={runs} speakers={[]} />);
      expect(await screen.findAllByText(/2\.5 GB/)).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Chọn run run-abc" }));
      fireEvent.click(screen.getByRole("button", { name: "Chọn run run-def" }), { shiftKey: true });
      expect(screen.getByText("2 mục đã chọn")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Xoá đã chọn" }));
      await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
      expect(confirm).toHaveBeenCalledOnce();
      expect(readFootprint).toHaveBeenCalledTimes(2);
      expect(deleteRun).toHaveBeenCalledTimes(2);
      expect(deleteRun).toHaveBeenNthCalledWith(1, "p1", "run-abc", false);
      expect(deleteRun).toHaveBeenNthCalledWith(2, "p1", "run-def", false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("selects all history items without deleting an adapter twice when its run is selected", async () => {
    const adapter = { id: "adapter-1", name: "ASR", baseModel: "base", createdAt: "2026-09-16T00:00:00Z" } as ProjectAsrAdapter;
    vi.spyOn(api, "getTrainingRunFootprint").mockResolvedValue(footprint({ asrAdapters: [{ id: adapter.id, name: adapter.name }] }));
    const deleteRun = vi.spyOn(api, "deleteTrainingRun").mockResolvedValue({ bytes: 0 } as Awaited<ReturnType<typeof api.deleteTrainingRun>>);
    const deleteAdapter = vi.spyOn(api, "deleteAsrAdapter").mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChanged = vi.fn();
    try {
      render(<TrainingHistoryDialog adapters={[adapter]} onChanged={onChanged} onClose={vi.fn()} onOpenLog={vi.fn()} projectId="p1" runs={[RUN]} speakers={[]} />);
      fireEvent.keyDown(screen.getByRole("list", { name: "Danh sách lịch sử training" }), { key: "a", ctrlKey: true });
      expect(screen.getByText("2 mục đã chọn")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Xoá đã chọn" }));
      await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
      expect(confirm).toHaveBeenCalledOnce();
      expect(deleteRun).toHaveBeenCalledWith("p1", RUN.id, true);
      expect(deleteAdapter).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
