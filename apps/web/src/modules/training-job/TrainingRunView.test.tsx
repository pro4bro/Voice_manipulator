import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrainingRunView } from "./TrainingRunView";
import type { TrainingProgressLine, TrainingRun } from "../../domain/types";

function run(overrides: Partial<TrainingRun> = {}): TrainingRun {
  return {
    version: 1,
    id: "run-abc123",
    projectId: "p1",
    manifestId: "dataset-1",
    status: "running",
    stepId: "train",
    globalStep: 1500,
    emotion: "angry",
    speakerProfileId: "speaker-1",
    checkpoints: [],
    error: null,
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T01:00:00Z",
    config: { steps: 5000, saveSteps: 1000, learningRate: 1e-4, loraR: 16 },
    ...overrides,
  };
}

function line(overrides: Partial<TrainingProgressLine> = {}): TrainingProgressLine {
  return {
    at: "2026-09-04T01:00:00Z",
    stepId: "train",
    message: "",
    globalStep: null,
    loss: null,
    devLoss: null,
    learningRate: null,
    stepsPerSecond: null,
    vramMb: null,
    done: null,
    total: null,
    ...overrides,
  };
}

const CURVE = [
  line({ globalStep: 100, loss: 4.2 }),
  line({ globalStep: 200, loss: 3.6 }),
  line({ globalStep: 300, loss: 3.1, stepsPerSecond: 2 }),
];

describe("TrainingRunView", () => {
  it("shows the nine steps rather than one percentage", () => {
    render(<TrainingRunView progress={CURVE} run={run()} />);

    expect(screen.getByText("Tokenize audio")).toBeInTheDocument();
    expect(screen.getByText("Nạp model + LoRA")).toBeInTheDocument();
    expect(screen.getByText("Merge & publish")).toBeInTheDocument();
  });

  it("draws the loss curve, which is what says whether to keep waiting", () => {
    render(<TrainingRunView progress={CURVE} run={run()} />);

    expect(screen.getByRole("img", { name: "Đường loss" })).toBeInTheDocument();
    expect(screen.getByText(/train 3.1000/)).toBeInTheDocument();
  });

  it("keeps dev loss as its own line, because the gap is the overfit signal", () => {
    render(
      <TrainingRunView
        progress={[...CURVE, line({ devLoss: 3.9 })]}
        run={run()}
      />,
    );

    expect(screen.getByText(/dev 3.9000/)).toBeInTheDocument();
  });

  it("draws no chart from a single point instead of a misleading flat line", () => {
    render(<TrainingRunView progress={[line({ globalStep: 100, loss: 4.2 })]} run={run()} />);

    expect(screen.queryByRole("img", { name: "Đường loss" })).not.toBeInTheDocument();
  });

  it("reports tokenizing in shards, not as a fraction of the run", () => {
    render(
      <TrainingRunView
        progress={[line({ stepId: "tokenize", done: 12, total: 32 })]}
        run={run({ stepId: "tokenize", globalStep: 0 })}
      />,
    );

    expect(screen.getByText("12/32 shard")).toBeInTheDocument();
  });

  it("estimates what is left from the measured rate", () => {
    render(<TrainingRunView progress={CURVE} run={run()} />);

    expect(screen.getByText(/2.00 step\/s/)).toBeInTheDocument();
  });

  it("says an interrupted run kept its checkpoints", () => {
    render(<TrainingRunView progress={CURVE} run={run({ status: "interrupted" })} />);

    expect(screen.getByText(/Checkpoint vẫn còn/)).toBeInTheDocument();
    expect(screen.getByText("Bị ngắt")).toBeInTheDocument();
  });

  it("offers cancel only while the run is live, and says checkpoints survive", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<TrainingRunView onCancel={onCancel} progress={CURVE} run={run()} />);
    fireEvent.click(screen.getByRole("button", { name: /Huỷ run/ }));

    expect(onCancel).toHaveBeenCalledOnce();

    rerender(<TrainingRunView onCancel={onCancel} progress={CURVE} run={run({ status: "complete" })} />);
    expect(screen.queryByRole("button", { name: /Huỷ run/ })).not.toBeInTheDocument();
  });

  it("lists the checkpoints a resume could start from", () => {
    render(
      <TrainingRunView
        progress={CURVE}
        run={run({
          checkpoints: [
            { step: 1000, path: "c/1000", bytes: 52_428_800, createdAt: "2026-09-04T00:30:00Z" },
            { step: 2000, path: "c/2000", bytes: 52_428_800, createdAt: "2026-09-04T01:00:00Z" },
          ],
        })}
      />,
    );

    expect(screen.getByText("step 2000")).toBeInTheDocument();
    expect(screen.getAllByText("50 MB")).toHaveLength(2);
  });

  it("surfaces a failure message instead of a silent stop", () => {
    render(<TrainingRunView progress={CURVE} run={run({ status: "failed", error: "CUDA out of memory" })} />);

    expect(screen.getByText("CUDA out of memory")).toBeInTheDocument();
    expect(screen.getByText("Lỗi")).toBeInTheDocument();
  });
});
