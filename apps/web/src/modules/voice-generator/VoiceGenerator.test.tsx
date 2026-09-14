import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VoiceGenerator, generatorForEngine } from "./VoiceGenerator";
import type { ProjectVoice, SpeakerProfile, TrainingModelOption, VoiceScriptRow } from "../../domain/types";

const AN: SpeakerProfile = { id: "speaker-an", name: "An", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#888", createdAt: "" };
const BINH: SpeakerProfile = { ...AN, id: "speaker-binh", name: "Bình", color: "#0a0" };

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

const ROWS: VoiceScriptRow[] = [
  { id: "r1", speakerProfileId: "speaker-an", voiceId: "voice-1", text: "Xin chào" },
  { id: "r2", speakerProfileId: "speaker-binh", voiceId: "voice-2", text: "Chào anh" },
  { id: "r3", speakerProfileId: "speaker-an", voiceId: "voice-1", text: "Tạm biệt" },
];

function props(overrides = {}) {
  return {
    projectId: "p1", generators: [GENERATOR], category: "clone" as const,
    voices: [voice(), voice({ id: "voice-2", name: "Bình · nhái giọng", speakerProfileId: "speaker-binh" })],
    rows: ROWS, speakers: [AN, BINH], parameters: {}, onParametersChange: vi.fn(), onGenerate: vi.fn(),
    ...overrides,
  };
}

describe("VoiceGenerator", () => {
  it("lists who reads the Script, how many rows each, and lets each reference be heard", () => {
    const onGenerate = vi.fn();
    render(<VoiceGenerator {...props({ onGenerate })} />);

    const cast = screen.getByRole("list", { name: "Voice trong Script" });
    expect(within(cast).getByText("An").closest("li")).toHaveTextContent("Nhái giọng · OmniVoice · 2 đoạn");
    expect(screen.getByLabelText("Nghe giọng mẫu Bình")).toHaveAttribute("src", "/api/projects/p1/voices/voice-2/reference");
    fireEvent.click(screen.getByRole("button", { name: /Đọc Script · 3 đoạn/ }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it("shows the kind of voice chosen in Voice Training", () => {
    const onOpenTraining = vi.fn();
    render(<VoiceGenerator {...props({ category: "train", voices: [], onOpenTraining })} />);

    expect(screen.getByText("Train giọng")).toBeInTheDocument();
    expect(screen.getByText("Chưa có voice dạng train giọng")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mở Voice Training" }));
    expect(onOpenTraining).toHaveBeenCalled();
  });

  it("shows each engine's parameters, keyed by generator, but leaves speed to Control Rack", () => {
    const onParametersChange = vi.fn();
    render(<VoiceGenerator {...props({ onParametersChange })} />);

    expect(screen.queryByLabelText("Tốc độ")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Số bước giải mã"), { target: { value: "16" } });
    expect(onParametersChange).toHaveBeenLastCalledWith("omnivoice-generate", { num_step: 16 });
  });

  it("will not read a Script with a row lacking a voice or with an out-of-range value", () => {
    const { rerender } = render(<VoiceGenerator {...props({ rows: [{ id: "x", speakerProfileId: null, voiceId: null, text: "chưa ai đọc" }] })} />);
    expect(screen.getByRole("button", { name: /Đoạn 1 chưa chọn voice/ })).toBeDisabled();

    rerender(<VoiceGenerator {...props({ parameters: { "omnivoice-generate": { num_step: 1 } } })} />);
    expect(screen.getByRole("button", { name: /Tham số chưa hợp lệ/ })).toBeDisabled();
  });

  it("reports a read in progress", () => {
    render(<VoiceGenerator {...props({ busy: true, job: { id: "j", projectId: "p1", status: "running", total: 3, done: 1, reused: 1, currentRowId: "r2", message: "Đoạn 2/3 · Bình", output: null, error: null, startedAt: "", finishedAt: null } })} />);

    expect(screen.getByRole("progressbar", { name: "Tiến trình đọc Script" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/Đoạn 2\/3 · Bình · 1 đoạn dùng lại/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Đang đọc 2\/3/ })).toBeDisabled();
  });

  it("picks a runnable generator for an engine", () => {
    const offline = { ...GENERATOR, id: "offline", available: false };
    expect(generatorForEngine([offline, GENERATOR], "omnivoice")?.id).toBe("omnivoice-generate");
    expect(generatorForEngine([GENERATOR], "vibevoice")).toBeNull();
  });
});
