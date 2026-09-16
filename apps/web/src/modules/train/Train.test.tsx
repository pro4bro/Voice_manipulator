import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DatasetReadiness, TrainingCatalog, TrainingModelOption, TrainingParameterSpec } from "../../domain/types";
import { Train } from "./Train";

const catalog: TrainingCatalog = {
  speakers: [],
  environmentProfiles: [],
  settings: { targetSpeakerIds: [], maxSteps: 10000, checkpointEvery: 1000, batchSize: 4, learningRate: 0.00002, denoiseBeforeTraining: true, learnEnvironmentNoise: false, environmentProfileId: null, modelId: null, modelParameters: {} },
  updatedAt: "2026-08-23T00:00:00Z",
};

function spec(overrides: Partial<TrainingParameterSpec> & Pick<TrainingParameterSpec, "key" | "label" | "kind" | "default">): TrainingParameterSpec {
  return { group: "Huấn luyện", options: [], nullable: false, editable: true, advanced: false, ...overrides };
}

function model(overrides: Partial<TrainingModelOption> & Pick<TrainingModelOption, "id" | "label" | "family">): TrainingModelOption {
  return {
    engine: "demo", mode: "lora", description: "", order: 10, runnable: false,
    repository: { root: "demo", path: ".", entrypoint: "train.py" },
    notes: [], parameters: [], origin: "shipped", installed: false, available: false, status: "",
    ...overrides,
  };
}

const omnivoice = model({
  id: "omnivoice-lora", label: "OmniVoice · LoRA fine-tune", family: "OmniVoice", runnable: true, installed: true, available: true, status: "Sẵn sàng.",
  parameters: [
    spec({ key: "use_lora", label: "Dùng LoRA", group: "LoRA", kind: "bool", default: true, editable: false }),
    spec({ key: "lora_r", label: "LoRA rank", group: "LoRA", kind: "int", default: 16, min: 1, max: 512 }),
    spec({ key: "save_steps", label: "Backup checkpoint mỗi", group: "Checkpoint & log", kind: "int", default: 1000, recipe: 500, codeDefault: 10000, min: 1 }),
    spec({ key: "attn_implementation", label: "Attention", kind: "choice", default: "sdpa", options: [{ value: "sdpa", label: "SDPA" }, { value: "flex_attention", label: "Flex" }] }),
    spec({ key: "seed", label: "Seed", kind: "int", default: 42, advanced: true }),
  ],
});

const vibevoice = model({
  id: "vibevoice-1.5b-tts-lora", label: "VibeVoice 1.5B · TTS LoRA", family: "VibeVoice", order: 40, status: "Chưa thấy train_vibevoice.py.",
  parameters: [
    spec({ key: "ddpm_batch_mul", label: "DDPM batch multiplier", group: "Loss", kind: "int", default: 4, recipe: 4, codeDefault: 1 }),
    spec({ key: "learning_rate", label: "Learning rate", kind: "float", default: 2.5e-5, min: 1e-8 }),
    spec({ key: "lora_r", label: "VibeVoice LoRA rank", group: "LoRA", kind: "int", default: 8, recipe: null, codeDefault: 8 }),
  ],
});

const clone = model({
  id: "omnivoice-zero-shot-clone", label: "OmniVoice · Nhái giọng (không train)", family: "OmniVoice", mode: "zero-shot-clone", category: "clone", order: 5,
  runnable: true, installed: true, available: true, status: "Sẵn sàng.",
  parameters: [spec({ key: "reference_max_seconds", label: "Đoạn mẫu dài nhất", group: "Giọng mẫu", kind: "float", default: 10 })],
});

const models = [omnivoice, vibevoice];

const AN = { id: "speaker-an", name: "An", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#888", createdAt: "2026-08-23T00:00:00Z" };
const ticked: TrainingCatalog = { ...catalog, speakers: [AN], settings: { ...catalog.settings, targetSpeakerIds: ["speaker-an"] } };
const readiness = { selectedAssets: 1, readyAssets: 1, segments: 30, totalSeconds: 90, speakerProfileIds: ["speaker-an"], segmentsByTier: {}, secondsByEmotion: {}, secondsBySpeaker: { "speaker-an": 90 }, rejections: [], scriptValidations: [] } as DatasetReadiness;

describe("Train", () => {
  it("does not claim training is runnable before any model is known", () => {
    render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Bắt đầu training/ })).toBeDisabled();
    expect(screen.getByText("ADAPTER PENDING")).toBeInTheDocument();
  });

  it("offers every model in one Model Training list, grouped by family", () => {
    render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} trainingModels={models} />);

    const select = screen.getByLabelText("Model Training");
    expect(within(select).getByRole("group", { name: "OmniVoice" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: /VibeVoice 1.5B · TTS LoRA · chưa cài/ })).toBeEnabled();
    expect(select).toHaveValue("omnivoice-lora");
    expect(screen.queryByLabelText("Training engine")).not.toBeInTheDocument();
  });

  it("shows only the chosen model's own parameters", () => {
    const { rerender } = render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} trainingModels={models} />);

    expect(screen.getByLabelText("LoRA rank")).toHaveValue("16");
    expect(screen.getByLabelText("Backup checkpoint mỗi")).toHaveValue("1000");
    expect(screen.getByText("recipe 500 · code 10000")).toBeInTheDocument();
    expect(screen.queryByLabelText("DDPM batch multiplier")).not.toBeInTheDocument();

    rerender(<Train assets={[]} catalog={{ ...catalog, settings: { ...catalog.settings, modelId: "vibevoice-1.5b-tts-lora" } }} onCatalogChange={vi.fn()} trainingModels={models} />);

    expect(screen.getByLabelText("DDPM batch multiplier")).toHaveValue("4");
    expect(screen.getByText("code 1")).toBeInTheDocument();
    expect(screen.queryByText(/recipe —/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("LoRA rank")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chưa cài repo cho model này" })).toBeDisabled();
  });

  it("stores the chosen model and only the values that differ from its defaults", () => {
    const onCatalogChange = vi.fn();
    render(<Train assets={[]} catalog={catalog} onCatalogChange={onCatalogChange} trainingModels={models} />);

    fireEvent.change(screen.getByLabelText("Model Training"), { target: { value: "vibevoice-1.5b-tts-lora" } });
    expect(onCatalogChange).toHaveBeenLastCalledWith({ ...catalog, settings: { ...catalog.settings, modelId: "vibevoice-1.5b-tts-lora" } });

    fireEvent.change(screen.getByLabelText("LoRA rank"), { target: { value: "32" } });
    expect(onCatalogChange).toHaveBeenLastCalledWith({ ...catalog, settings: { ...catalog.settings, modelParameters: { "omnivoice-lora": { lora_r: 32 } } } });

    fireEvent.change(screen.getByLabelText("Attention"), { target: { value: "sdpa" } });
    expect(onCatalogChange).toHaveBeenLastCalledWith({ ...catalog, settings: { ...catalog.settings, modelParameters: {} } });
  });

  it("keeps a locked parameter locked and hides advanced ones until asked", () => {
    render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} trainingModels={models} />);

    expect(screen.getByLabelText("Dùng LoRA")).toBeDisabled();
    expect(screen.getByText("Nâng cao · 1").closest("details")).not.toHaveAttribute("open");
  });

  it("refuses to start with a value outside the descriptor's range", () => {
    const withOverride = { ...ticked, settings: { ...ticked.settings, modelParameters: { "omnivoice-lora": { lora_r: 0 } } } };
    render(<Train assets={[]} catalog={withOverride} onCatalogChange={vi.fn()} readiness={readiness} trainingModels={models} trainingRuntime={{ root: "runtime", ready: true } as never} />);

    expect(screen.getByText("Tối thiểu 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tham số chưa hợp lệ" })).toBeDisabled();
  });

  it("starts one voice per ticked target once each has data and the runtime is ready", () => {
    const onStart = vi.fn();
    render(<Train assets={[]} catalog={ticked} onCatalogChange={vi.fn()} onStart={onStart} readiness={readiness} trainingModels={models} trainingRuntime={{ root: "runtime", ready: true } as never} />);

    expect(screen.getByText("1m 30s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu train OmniVoice · LoRA fine-tune · 1 voice" }));
    expect(onStart).toHaveBeenCalled();
    expect(screen.getByText("ADAPTER READY")).toBeInTheDocument();
  });

  it("will not start without a target, or with a target the dataset has nothing for", () => {
    const runtime = { root: "runtime", ready: true } as never;
    const { rerender } = render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} readiness={readiness} trainingModels={models} trainingRuntime={runtime} />);
    expect(screen.getByRole("button", { name: "Tick ít nhất một voice target" })).toBeDisabled();

    rerender(<Train assets={[]} catalog={ticked} onCatalogChange={vi.fn()} readiness={{ ...readiness, secondsBySpeaker: {} }} trainingModels={models} trainingRuntime={runtime} />);
    expect(screen.getByRole("button", { name: "An chưa có đoạn nào trong dataset" })).toBeDisabled();
    expect(screen.getByText("chưa có đoạn")).toBeInTheDocument();
  });

  it("separates imitating a voice from training one, and lists only the chosen kind", () => {
    const onCatalogChange = vi.fn();
    const { container } = render(<Train assets={[]} catalog={{ ...catalog, settings: { ...catalog.settings, modelId: "omnivoice-lora" } }} onCatalogChange={onCatalogChange} trainingModels={[clone, ...models]} />);

    expect(screen.getByRole("radio", { name: /Train giọng/ })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByLabelText("Model Training")).queryByRole("option", { name: /Nhái giọng/ })).not.toBeInTheDocument();
    expect(container.querySelector(".train-module")).toHaveClass("is-train");

    fireEvent.click(screen.getByRole("radio", { name: /Nhái giọng/ }));
    expect(onCatalogChange).toHaveBeenLastCalledWith({ ...catalog, settings: { ...catalog.settings, modelId: "omnivoice-zero-shot-clone" } });
  });

  it("speaks of making cloned voices, not training, when the clone kind is chosen", () => {
    const chosen = { ...ticked, settings: { ...ticked.settings, modelId: "omnivoice-zero-shot-clone" } };
    const { container } = render(<Train assets={[]} catalog={chosen} onCatalogChange={vi.fn()} readiness={readiness} trainingModels={[clone, ...models]} trainingRuntime={{ root: "runtime", ready: true } as never} />);

    expect(container.querySelector(".train-module")).toHaveClass("is-clone");
    expect(screen.getByRole("button", { name: "Tạo 1 voice nhái giọng" })).toBeEnabled();
    expect(within(screen.getByLabelText("Model Training")).getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByText("Khử nhiễu trước khi train")).not.toBeInTheDocument();
  });

  it("lets a number be typed through states that do not parse yet", () => {
    const onCatalogChange = vi.fn();
    const vibe = { ...catalog, settings: { ...catalog.settings, modelId: "vibevoice-1.5b-tts-lora" } };
    render(<Train assets={[]} catalog={vibe} onCatalogChange={onCatalogChange} trainingModels={models} />);

    const input = screen.getByLabelText("Learning rate");
    fireEvent.change(input, { target: { value: "3e-" } });
    expect(input).toHaveValue("3e-");
    expect(onCatalogChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "3e-5" } });
    expect(onCatalogChange).toHaveBeenLastCalledWith({ ...vibe, settings: { ...vibe.settings, modelParameters: { "vibevoice-1.5b-tts-lora": { learning_rate: 3e-5 } } } });
  });

  it("says how to fix a target with nothing in the dataset", () => {
    render(<Train assets={[]} catalog={ticked} onCatalogChange={vi.fn()} readiness={{ ...readiness, secondsBySpeaker: {} }} trainingModels={models} trainingRuntime={{ root: "runtime", ready: true } as never} />);

    const note = screen.getByText(/Dataset chưa có đoạn nào của/).closest("p");
    expect(note?.textContent).toContain("An");
    expect(note?.textContent).toContain("NGƯỜI NÓI");
    expect(note?.textContent).toContain("không cần chạy Speaker Diarization");
  });
});
