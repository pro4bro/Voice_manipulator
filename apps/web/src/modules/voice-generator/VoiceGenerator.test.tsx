import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VoiceGenerator } from "./VoiceGenerator";
import type { ProjectVoice, SpeakerProfile, TrainingModelOption } from "../../domain/types";

const AN: SpeakerProfile = { id: "speaker-an", name: "An", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#888", createdAt: "" };

const GENERATOR: TrainingModelOption = {
  id: "omnivoice-generate", label: "OmniVoice · Đọc bằng voice của project", family: "OmniVoice", engine: "omnivoice", mode: "generate",
  description: "", order: 10, runnable: true, repository: { root: "omnivoice", path: ".", entrypoint: "omnivoice/cli/infer.py" },
  notes: [], origin: "shipped", installed: true, available: true, status: "Sẵn sàng.",
  parameters: [
    { key: "speed", label: "Tốc độ", group: "Đọc", kind: "float", default: 1, options: [], nullable: false, editable: true, advanced: false },
    { key: "num_step", label: "Số bước giải mã", group: "Chất lượng", kind: "int", default: 32, min: 4, max: 128, options: [], nullable: false, editable: true, advanced: false },
    { key: "t_shift", label: "t_shift", group: "Nâng cao", kind: "float", default: 0.1, options: [], nullable: false, editable: true, advanced: true },
  ],
};

function voice(overrides: Partial<ProjectVoice> = {}): ProjectVoice {
  return {
    id: "voice-1", name: "An · nhái giọng", speakerProfileId: "speaker-an", engine: "omnivoice", kind: "clone", modelId: "omnivoice-zero-shot-clone",
    baseModel: "k2-fsa/OmniVoice", referenceAudio: "assets/voices/voice-1/reference.wav", referenceText: "Xin chào mọi người.", referenceSeconds: 8.2,
    referenceSegmentId: "seg-1", adapterPath: null, language: "vi", sourceRunId: "run-1", createdAt: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    projectId: "p1", generators: [GENERATOR], generatorId: null, onGeneratorChange: vi.fn(), voices: [voice()], speakers: [AN],
    voiceId: null, onVoiceChange: vi.fn(), parameters: {}, onParametersChange: vi.fn(), scriptLength: 20, onGenerate: vi.fn(),
    ...overrides,
  };
}

describe("VoiceGenerator", () => {
  it("speaks the Script with the chosen voice and lets its reference be heard", () => {
    const onGenerate = vi.fn();
    render(<VoiceGenerator {...props({ onGenerate })} />);

    expect(screen.getByText("Xin chào mọi người.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nghe giọng mẫu")).toHaveAttribute("src", "/api/projects/p1/voices/voice-1/reference");
    fireEvent.click(screen.getByRole("button", { name: /Đọc Script bằng An · nhái giọng/ }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it("groups voices by Speaker Profile and says which kind each is", () => {
    render(<VoiceGenerator {...props({ voices: [voice(), voice({ id: "voice-2", kind: "lora", referenceSeconds: 6 })] })} />);

    const group = within(screen.getByLabelText("Voice")).getByRole("group", { name: "An" });
    expect(within(group).getByRole("option", { name: /LoRA đã train · 6.0s/ })).toBeInTheDocument();
  });

  it("shows the generator's own parameters but leaves speed to Control Rack", () => {
    const onParametersChange = vi.fn();
    render(<VoiceGenerator {...props({ onParametersChange })} />);

    expect(screen.queryByLabelText("Tốc độ")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Số bước giải mã"), { target: { value: "16" } });
    expect(onParametersChange).toHaveBeenLastCalledWith({ num_step: 16 });
  });

  it("points to Voice Training when there is no voice yet", () => {
    const onOpenTraining = vi.fn();
    render(<VoiceGenerator {...props({ voices: [], onOpenTraining })} />);

    expect(screen.getByRole("button", { name: /Chưa có voice nào/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mở Voice Training" }));
    expect(onOpenTraining).toHaveBeenCalled();
  });

  it("will not speak an empty Script or with an out-of-range value", () => {
    const { rerender } = render(<VoiceGenerator {...props({ scriptLength: 0 })} />);
    expect(screen.getByRole("button", { name: /Nhập text vào Script trước/ })).toBeDisabled();

    rerender(<VoiceGenerator {...props({ parameters: { num_step: 1 } })} />);
    expect(screen.getByRole("button", { name: /Tham số chưa hợp lệ/ })).toBeDisabled();
  });
});
