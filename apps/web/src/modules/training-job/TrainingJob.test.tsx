import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrainingJob, logMessage } from "./TrainingJob";
import type { SpeakerProfile, TrainingProgressLine, TrainingRun } from "../../domain/types";

function speaker(id: string, name: string): SpeakerProfile {
  return { id, name, language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#888", createdAt: "2026-09-04T00:00:00Z" };
}

const AN = speaker("speaker-an", "An");
const BINH = speaker("speaker-binh", "Bình");

function run(overrides: Partial<TrainingRun> = {}): TrainingRun {
  return {
    version: 1,
    id: "run-an",
    projectId: "p1",
    manifestId: "dataset-1",
    status: "running",
    stepId: "train",
    globalStep: 2500,
    emotion: "normal",
    speakerProfileId: "speaker-an",
    batchId: "batch-1",
    batchIndex: 0,
    batchSize: 2,
    checkpoints: [],
    error: null,
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T01:00:00Z",
    config: { modelId: "omnivoice-lora", steps: 5000, saveSteps: 1000, learningRate: 1e-4, loraR: 16 },
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
  line({ at: "2026-09-04T01:00:01Z", globalStep: 100, loss: 4.2 }),
  line({ at: "2026-09-04T01:00:02Z", globalStep: 200, loss: 3.6 }),
  line({ at: "2026-09-04T01:00:03Z", globalStep: 300, loss: 3.1, stepsPerSecond: 2 }),
];

const BATCH = [run(), run({ id: "run-binh", speakerProfileId: "speaker-binh", batchIndex: 1, status: "pending", stepId: "provision", globalStep: 0 })];

describe("TrainingJob", () => {
  it("shows the training flow only, not data preparation", () => {
    render(<TrainingJob batch={BATCH} progressByRun={{ "run-an": CURVE }} speakers={[AN, BINH]} />);

    const flow = screen.getByRole("region", { name: "Flow Voice Training" });
    expect(within(flow).getByText("Tokenize audio")).toBeInTheDocument();
    expect(within(flow).getByText("Checkpoint")).toBeInTheDocument();
    expect(within(flow).queryByText(/Speech to Text|Nhận diện speaker/)).not.toBeInTheDocument();
    expect(within(flow).getByText("2500/5000")).toBeInTheDocument();
    expect(within(flow).getByText(/An · voice 1\/2/)).toBeInTheDocument();
  });

  it("shows the short flow for a cloned voice, which has no training steps", () => {
    render(<TrainingJob batch={[run({ status: "complete", stepId: "publish", globalStep: 0, config: { ...run().config, modelId: "omnivoice-zero-shot-clone", mode: "zero-shot-clone" } })]} speakers={[AN]} />);

    const flow = screen.getByRole("region", { name: "Flow Voice Training" });
    expect(within(flow).getByText("Chọn đoạn mẫu")).toBeInTheDocument();
    expect(within(flow).queryByText("Tokenize audio")).not.toBeInTheDocument();
    expect(within(flow).getAllByRole("listitem").every((item) => item.classList.contains("is-done"))).toBe(true);
    expect(screen.getByRole("progressbar", { name: "Tiến trình An" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows VibeVoice runs without a tokenize step, and an ASR run publishing an STT adapter", () => {
    const { rerender } = render(<TrainingJob selectedMode="tts-lora" speakers={[AN]} />);
    expect(screen.queryByText("Tokenize audio")).not.toBeInTheDocument();
    expect(screen.getByText("JSONL + voice prompt")).toBeInTheDocument();

    rerender(<TrainingJob selectedMode="asr-lora" speakers={[AN]} />);
    expect(screen.getByText("Thêm vào Speech to Text")).toBeInTheDocument();
  });

  it("shows the flow of the kind chosen in Train while nothing is running", () => {
    const finishedTraining = [run({ status: "complete", stepId: "checkpoint" })];
    const { rerender, container } = render(<TrainingJob batch={finishedTraining} selectedMode="zero-shot-clone" speakers={[AN]} />);

    const flow = screen.getByRole("region", { name: "Flow Voice Training" });
    expect(within(flow).getByText("Chọn đoạn mẫu")).toBeInTheDocument();
    expect(within(flow).getByText(/FLOW · NHÁI GIỌNG/)).toBeInTheDocument();
    expect(within(flow).queryAllByRole("listitem").some((item) => item.classList.contains("is-done"))).toBe(false);
    expect(container.querySelector(".training-console")).toHaveClass("is-clone");

    rerender(<TrainingJob batch={BATCH} selectedMode="zero-shot-clone" speakers={[AN, BINH]} />);
    expect(within(screen.getByRole("region", { name: "Flow Voice Training" })).getByText("Tokenize audio")).toBeInTheDocument();
  });

  it("logs every step and the command it ran, across all voices in time order", () => {
    const progress = {
      "run-an": [
        line({ at: "2026-09-04T01:00:00Z", stepId: "read-manifest", message: "Voice target 1/2: An · 12 đoạn · 3.0 phút." }),
        line({ at: "2026-09-04T01:00:05Z", stepId: "tokenize", message: "$ python -m omnivoice.scripts.extract_audio_tokens --input_jsonl <run>/data/train.jsonl" }),
      ],
      "run-binh": [line({ at: "2026-09-04T01:00:09Z", stepId: "read-manifest", message: "Voice target 2/2: Bình · 8 đoạn · 2.0 phút." })],
    };
    render(<TrainingJob batch={BATCH} progressByRun={progress} speakers={[AN, BINH]} />);

    const log = screen.getByRole("region", { name: "Log training" });
    const entries = within(log).getAllByRole("listitem");
    expect(entries).toHaveLength(3);
    expect(entries[1]).toHaveClass("is-command");
    expect(entries[2]).toHaveTextContent("Bình");
  });

  it("writes metric lines as words rather than an empty row", () => {
    expect(logMessage(line({ globalStep: 300, loss: 3.1, stepsPerSecond: 2 }))).toBe("step 300 · loss 3.1000 · 2.00 step/s");
  });

  it("splits the overall bar into one part per voice target, each with its own bar", () => {
    render(<TrainingJob batch={BATCH} progressByRun={{ "run-an": CURVE }} speakers={[AN, BINH]} />);

    const an = screen.getByRole("progressbar", { name: "Tiến trình An" });
    const binh = screen.getByRole("progressbar", { name: "Tiến trình Bình" });
    const overall = screen.getByRole("progressbar", { name: "Tiến trình training tổng" });
    expect(Number(an.getAttribute("aria-valuenow"))).toBeGreaterThan(50);
    expect(binh).toHaveAttribute("aria-valuenow", "0");
    expect(Number(overall.getAttribute("aria-valuenow"))).toBe(Math.round(Number(an.getAttribute("aria-valuenow")) / 2));
    expect(overall.children).toHaveLength(2);
    expect(screen.getByText("0/2 voice xong")).toBeInTheDocument();
  });

  it("shows the ticked targets waiting at zero before any run exists", () => {
    render(<TrainingJob speakers={[AN, BINH]} targetSpeakerIds={["speaker-an", "speaker-binh"]} />);

    expect(screen.getAllByText("Chưa chạy")).toHaveLength(2);
    expect(screen.getByRole("progressbar", { name: "Tiến trình training tổng" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText(/Chưa có dòng log nào/)).toBeInTheDocument();
  });

  it("draws the loss curve with dev loss as its own line", () => {
    render(<TrainingJob batch={BATCH} progressByRun={{ "run-an": [...CURVE, line({ at: "2026-09-04T01:00:04Z", devLoss: 3.9 })] }} speakers={[AN, BINH]} />);

    expect(screen.getByRole("img", { name: "Đường loss" })).toBeInTheDocument();
    const flow = screen.getByRole("region", { name: "Flow Voice Training" });
    expect(within(flow).getByText(/dev 3.9000/)).toBeInTheDocument();
    expect(within(flow).getByText(/2.00 step\/s · còn khoảng/)).toBeInTheDocument();
  });

  it("reports tokenizing in shards", () => {
    render(<TrainingJob batch={[run({ stepId: "tokenize", globalStep: 0 })]} progressByRun={{ "run-an": [line({ stepId: "tokenize", done: 12, total: 32 })] }} speakers={[AN]} />);

    expect(within(screen.getByRole("region", { name: "Flow Voice Training" })).getByText("12/32 shard")).toBeInTheDocument();
  });

  it("cancels the live voice, and offers nothing once the batch is done", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<TrainingJob batch={BATCH} onCancelRun={onCancel} speakers={[AN, BINH]} />);
    fireEvent.click(screen.getByRole("button", { name: /Huỷ/ }));
    expect(onCancel).toHaveBeenCalledWith("run-an");

    rerender(<TrainingJob batch={BATCH.map((item) => ({ ...item, status: "complete" as const }))} onCancelRun={onCancel} speakers={[AN, BINH]} />);
    expect(screen.queryByRole("button", { name: /Huỷ/ })).not.toBeInTheDocument();
    expect(screen.getByText("2/2 voice xong")).toBeInTheDocument();
  });

it("carries the rest of the app's own log, with a repeated line counted once", () => {
    const events = [
      { seq: 1, at: "2026-09-04T01:00:05Z", source: "stt", level: "info" as const, message: "Đang nhận dạng buổi họp", repeat: 1 },
      { seq: 2, at: "2026-09-04T01:00:06Z", source: "engine", level: "warning" as const, message: "UserWarning: DataLoader", repeat: 129 },
      { seq: 3, at: "2026-09-04T01:00:07Z", source: "training", level: "info" as const, message: "đã có trong journal", repeat: 1 },
    ];

    render(<TrainingJob activityEvents={events} batch={BATCH} speakers={[AN, BINH]} />);

    expect(screen.getByText("Đang nhận dạng buổi họp")).toBeInTheDocument();
    expect(screen.getByText("…129…")).toBeInTheDocument();
    expect(screen.getByText(/1 cảnh báo/)).toBeInTheDocument();
    // Training lines are already in the run's journal; showing them twice is worse than not at all.
    expect(screen.queryByText("đã có trong journal")).not.toBeInTheDocument();
  });

  it("shows the other jobs of the app under the flow", () => {
    render(<TrainingJob activityTasks={[{
      id: "t1", kind: "stt", label: "Speech to Text · buổi họp", detail: "40%", status: "running",
      fraction: 0.4, etaSeconds: null, startedAt: "2026-09-04T01:00:00Z", updatedAt: "2026-09-04T01:00:00Z",
      finishedAt: null, seconds: null,
    }]} batch={BATCH} speakers={[AN, BINH]} />);

    expect(screen.getByText("SPEECH TO TEXT")).toBeInTheDocument();
    expect(screen.getByText("Speech to Text · buổi họp")).toBeInTheDocument();
  });

  it("says how long the run has gone and how long is left, then how long it took", () => {
    const live = run({ status: "running", globalStep: 250, createdAt: new Date(Date.now() - 120_000).toISOString() });
    const progress = { "run-an": [line({ globalStep: 250, loss: 3, stepsPerSecond: 2 })] };
    const { rerender } = render(<TrainingJob batch={[live]} progressByRun={progress} speakers={[AN]} />);

    expect(screen.getByText(/Đã chạy 2m 00s/)).toBeInTheDocument();
    expect(screen.getByText(/còn khoảng/)).toBeInTheDocument();

    const done = { ...live, status: "complete" as const, stepId: "publish" as const };
    rerender(<TrainingJob batch={[done]} progressByRun={{ "run-an": [
      { ...line(), message: "Xong train sau 5 phút 31 giây." },
      { ...line(), message: "Hoàn tất sau 22 phút 28 giây." },
    ] }} speakers={[AN]} />);

    expect(screen.getByText(/tổng 22 phút 28 giây/)).toBeInTheDocument();
    expect(screen.getByText(/riêng train 5 phút 31 giây/)).toBeInTheDocument();
  });

  it("surfaces a failure and an interruption instead of a silent stop", () => {
    const { rerender } = render(<TrainingJob batch={[run({ status: "failed", error: "CUDA out of memory" })]} speakers={[AN]} />);
    expect(screen.getByText(/CUDA out of memory/)).toBeInTheDocument();

    rerender(<TrainingJob batch={[run({ status: "interrupted" })]} speakers={[AN]} />);
    expect(screen.getByText(/Checkpoint vẫn còn/)).toBeInTheDocument();
  });
});
