import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TrainingCatalog, TrainingEngineOption } from "../../domain/types";
import { Train } from "./Train";

const catalog: TrainingCatalog = {
  speakers: [],
  environmentProfiles: [],
  settings: { targetSpeakerIds: [], maxSteps: 10000, checkpointEvery: 1000, batchSize: 4, learningRate: 0.00002, denoiseBeforeTraining: true, learnEnvironmentNoise: false, environmentProfileId: null },
  updatedAt: "2026-08-23T00:00:00Z",
};

const engines: TrainingEngineOption[] = [
  { id: "omnivoice", label: "OmniVoice", description: "OmniVoice fine-tuning", installed: true, modes: [
    { id: "lora-finetune", label: "LoRA", description: "LoRA adapter", available: true },
    { id: "full-finetune", label: "Full", description: "Full fine-tune", available: false },
    { id: "from-scratch", label: "Scratch", description: "From scratch", available: false },
  ] },
  { id: "vibevoice", label: "VibeVoice", description: "VibeVoice family", installed: false, modes: [
    { id: "tts-single-speaker-lora", label: "TTS LoRA", description: "Single speaker", available: false },
    { id: "asr-lora", label: "ASR LoRA", description: "ASR adapter", available: false },
  ] },
];

describe("Train", () => {
  it("defaults checkpoint backups to every 1000 steps and persists changes", () => {
    const onCatalogChange = vi.fn();
    render(<Train assets={[]} catalog={catalog} onCatalogChange={onCatalogChange} />);

    expect(screen.getByLabelText("Checkpoint interval")).toHaveValue(1000);
    fireEvent.change(screen.getByLabelText("Checkpoint interval"), { target: { value: "2000" } });
    expect(onCatalogChange).toHaveBeenCalledWith({ ...catalog, settings: { ...catalog.settings, checkpointEvery: 2000 } });
  });

  it("does not claim training is runnable before its processor adapter exists", () => {
    render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Bắt đầu training/ })).toBeDisabled();
    expect(screen.getByText("ADAPTER PENDING")).toBeInTheDocument();
  });

  it("keeps engine and mode parameters in the Train module", () => {
    render(<Train assets={[]} catalog={catalog} onCatalogChange={vi.fn()} trainingEngines={engines} />);

    expect(screen.getByRole("option", { name: /VibeVoice/ })).toBeInTheDocument();
    expect(screen.getByLabelText("OmniVoice base model")).toHaveValue("k2-fsa/OmniVoice");
    expect(screen.getByLabelText("LoRA rank")).toHaveValue(16);
    fireEvent.change(screen.getByLabelText("Training engine"), { target: { value: "vibevoice" } });
    expect(screen.getByLabelText("VibeVoice model")).toHaveValue("vibevoice/VibeVoice-1.5B");
    expect(screen.getByRole("option", { name: /TTS LoRA/ })).toBeDisabled();
  });
});
