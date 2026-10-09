import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VoiceVault } from "./VoiceVault";
import { api } from "../../api/client";
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
  it("opens profile properties with a dedicated button inside the profile slot", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Properties profile An" }));
    expect(screen.getByText("Speaker Profile Properties")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xác nhận & lưu profile" })).toBeInTheDocument();
  });
  it("toggles profile and voice checkboxes off without modifier keys", () => {
    show({ voices: [voice("voice-1", "An · LoRA", "speaker-an")] });
    const profileCheck = screen.getByRole("button", { name: "Chọn profile An" });
    fireEvent.click(profileCheck);
    expect(profileCheck).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(profileCheck);
    expect(profileCheck).toHaveAttribute("aria-pressed", "false");
    const voiceCheck = screen.getByRole("button", { name: "Chọn voice An · LoRA" });
    fireEvent.click(voiceCheck);
    expect(voiceCheck).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(voiceCheck);
    expect(voiceCheck).toHaveAttribute("aria-pressed", "false");
  });
  it("stores evidence with explicit upload consent and preserves it when saving the profile", async () => {
    const upload = vi.spyOn(api, "uploadConsentEvidence").mockResolvedValue({ path: "assets/consent-evidence/proof.pdf", name: "proof.pdf" });
    const save = vi.fn();
    show({ projectId: "project-test", onCatalogChange: save });
    fireEvent.doubleClick(screen.getByText("An"));
    expect(screen.queryByLabelText("Browse bằng chứng đồng ý")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Chủ giọng đã đồng ý cho dùng giọng này để đổi giọng trong project"));
    fireEvent.click(screen.getByLabelText("Chủ giọng đồng ý cho upload voice lên server"));
    const file = new File(["%PDF-1.7 proof"], "proof.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Browse bằng chứng đồng ý"), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: "Xác nhận & lưu profile" })).toBeDisabled();
    await screen.findByText("Bằng chứng: proof.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận & lưu profile" }));
    expect(upload).toHaveBeenCalledWith("project-test", file);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ speakers: [expect.objectContaining({ voiceConsent: expect.objectContaining({ uploadAllowed: true, evidence: { path: "assets/consent-evidence/proof.pdf", name: "proof.pdf" } }) })] }));
    upload.mockRestore();
  });

  it("does not attach a cancelled upload to a subsequently opened profile", async () => {
    let resolve!: (value: { path: string; name: string }) => void;
    const upload = vi.spyOn(api, "uploadConsentEvidence").mockImplementation(() => new Promise((resolver) => { resolve = resolver; }));
    show({ projectId: "project-test" });
    fireEvent.doubleClick(screen.getByText("An"));
    fireEvent.click(screen.getByLabelText("Chủ giọng đã đồng ý cho dùng giọng này để đổi giọng trong project"));
    fireEvent.change(screen.getByLabelText("Browse bằng chứng đồng ý"), { target: { files: [new File(["proof"], "proof.txt")] } });
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    fireEvent.doubleClick(screen.getByText("An"));
    resolve({ path: "assets/proof.txt", name: "proof.txt" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Xác nhận & lưu profile" })).toBeEnabled());
    expect(screen.queryByText("Bằng chứng: proof.txt")).not.toBeInTheDocument();
    upload.mockRestore();
  });
  it("clears profile selection from the blank side canvas", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Chọn profile An" }));
    expect(screen.getByText("1 profile đã chọn")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("region", { name: "Danh sách Sound Library" }));
    expect(screen.queryByText("1 profile đã chọn")).not.toBeInTheDocument();
  });
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

  it("selects profiles with Shift and applies a shared speaker color", () => {
    const second = speaker("speaker-binh", "Bình");
    const catalog = { ...CATALOG, speakers: [...CATALOG.speakers, second] };
    const onCatalogChange = vi.fn();
    show({ catalog, onCatalogChange });

    fireEvent.click(screen.getByRole("button", { name: "Chọn profile An" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn profile Bình" }), { shiftKey: true });
    fireEvent.change(screen.getByLabelText("Màu cho Speaker Profiles đã chọn"), { target: { value: "#112233" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng màu" }));

    expect(onCatalogChange).toHaveBeenLastCalledWith(expect.objectContaining({ speakers: [
      expect.objectContaining({ id: "speaker-an", color: "#112233" }),
      expect.objectContaining({ id: "speaker-binh", color: "#112233" }),
    ] }));
  });

  it("confirms one bulk profile deletion for the selected range", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const second = speaker("speaker-binh", "Bình");
    const catalog = { ...CATALOG, speakers: [...CATALOG.speakers, second] };
    const onDeleteSpeakers = vi.fn();
    show({ catalog, onDeleteSpeakers });

    fireEvent.click(screen.getByRole("button", { name: "Chọn profile An" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn profile Bình" }), { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Xoá profiles đã chọn" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(onDeleteSpeakers).toHaveBeenCalledWith([speaker("speaker-an", "An"), second]);
    confirm.mockRestore();
  });
});
