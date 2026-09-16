import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VoiceVault } from "./VoiceVault";
import type { ProjectVoice, SpeakerProfile, TrainingCatalog } from "../../domain/types";

function speaker(id: string, name: string): SpeakerProfile {
  return { id, name, language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#888", createdAt: "2026-09-04T00:00:00Z" };
}

function voice(id: string, name: string, speakerProfileId: string): ProjectVoice {
  return {
    id, name, speakerProfileId, engine: "omnivoice", kind: "lora", baseModel: "k2-fsa/OmniVoice",
    referenceAudio: "assets/voices/x/reference.wav", referenceText: "xin chào", referenceSeconds: 4,
    createdAt: "2026-09-16T00:00:00Z",
  } as unknown as ProjectVoice;
}

const CATALOG = {
  speakers: [speaker("speaker-an", "An")],
  environmentProfiles: [],
  settings: { targetSpeakerIds: [], maxSteps: 5000, checkpointEvery: 1000, batchSize: 8, learningRate: 1e-4, denoiseBeforeTraining: false, learnEnvironmentNoise: false, environmentProfileId: null },
  updatedAt: "2026-09-16T00:00:00Z",
} as unknown as TrainingCatalog;

function show(props: Partial<Parameters<typeof VoiceVault>[0]> = {}) {
  return render(
    <VoiceVault
      assets={[]}
      catalog={CATALOG}
      onCatalogChange={vi.fn()}
      onSelectVoice={vi.fn()}
      profileSchema={null}
      selectedVoice=""
      {...props}
    />,
  );
}

describe("Sound Library", () => {
  it("lists the voices a Speaker Profile has, each with a way to remove it", () => {
    const onDeleteVoice = vi.fn();
    show({ voices: [voice("voice-1", "An · LoRA", "speaker-an"), voice("voice-2", "An · nhái giọng", "speaker-an")], onDeleteVoice });

    const list = screen.getByLabelText("Voice của An");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(within(list).getByLabelText("Xoá voice An · LoRA"));

    expect(onDeleteVoice).toHaveBeenCalledWith(expect.objectContaining({ id: "voice-1" }));
  });

  it("leaves the voice list out for a profile that has none", () => {
    show({ voices: [voice("voice-1", "Bình · LoRA", "speaker-binh")] });

    expect(screen.queryByLabelText("Voice của An")).toBeNull();
    expect(screen.getByText(/0 voice/)).toBeTruthy();
  });

  it("offers deleting the profile itself from its properties", () => {
    const onDeleteSpeaker = vi.fn();
    show({ onDeleteSpeaker });

    fireEvent.doubleClick(screen.getByText("An"));
    fireEvent.click(screen.getByText("Xoá profile"));

    expect(onDeleteSpeaker).toHaveBeenCalledWith(expect.objectContaining({ id: "speaker-an" }));
  });

  it("shows no delete when the page did not pass one", () => {
    show({ voices: [voice("voice-1", "An · LoRA", "speaker-an")] });

    expect(screen.queryByLabelText("Xoá voice An · LoRA")).toBeNull();
  });
});
