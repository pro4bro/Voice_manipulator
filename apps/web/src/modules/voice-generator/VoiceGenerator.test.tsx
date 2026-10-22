import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    rows: ROWS, speakers: [AN, BINH], parameters: {}, onParametersChange: vi.fn(), onCategoryChange: vi.fn(), onGenerate: vi.fn(),
    ...overrides,
  };
}

describe("VoiceGenerator", () => {
  it("stops remaining Script rows first and confirms active generation cancellation", async () => {
    const onStop = vi.fn(); render(<VoiceGenerator {...props({ busy: true, onStop })} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(onStop).toHaveBeenCalledWith("queue"));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(onStop).toHaveBeenCalledWith("all"));
  });
  it("lists who reads the Script, how many rows each, and lets each reference be heard", () => {
    const onGenerate = vi.fn();
    render(<VoiceGenerator {...props({ onGenerate })} />);

    const cast = screen.getByRole("list", { name: "Voice trong Script" });
    expect(within(cast).getByText("An").closest("li")).toHaveTextContent("Nhái giọng · OmniVoice · 2 đoạn");
    expect(screen.getByLabelText("Nghe giọng mẫu Bình")).toHaveAttribute("src", "/api/projects/p1/voices/voice-2/reference");
    fireEvent.click(screen.getByRole("button", { name: /Đọc Script · 3 đoạn/ }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it("shows the empty category prompt and links to Voice Training", () => {
    const onOpenTraining = vi.fn();
    render(<VoiceGenerator {...props({ category: "train", voices: [], onOpenTraining })} />);

    expect(screen.getByText("Train giọng")).toBeInTheDocument();
    expect(screen.getByText("Chưa có voice dạng train giọng")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mở Voice Training" }));
    expect(onOpenTraining).toHaveBeenCalled();
  });

  it("lets Voice Manipulator choose its generation category independently", () => {
    const onCategoryChange = vi.fn();
    render(<VoiceGenerator {...props({ onCategoryChange })} />);
    const selector = screen.getByRole("combobox", { name: "Loại voice" });
    expect(selector).toHaveValue("clone");
    fireEvent.change(selector, { target: { value: "train" } });
    expect(onCategoryChange).toHaveBeenCalledWith("train");
  });

  it("shows each engine's parameters, keyed by generator, but leaves speed to Control Rack", () => {
    const onParametersChange = vi.fn();
    render(<VoiceGenerator {...props({ onParametersChange })} />);

    expect(screen.queryByLabelText("Tốc độ")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Số bước giải mã"), { target: { value: "16" } });
    expect(onParametersChange).toHaveBeenLastCalledWith("omnivoice-generate", { num_step: 16 });
  });

  it("filters voice choices by the selected engine and blocks dispatch while assigned rows mismatch", () => {
    const cosy = voice({ id: "cosy", engine: "cosyvoice3", name: "An · CosyVoice3" });
    const onGenerate = vi.fn();
    const { rerender } = render(<VoiceGenerator {...props({ generationEngine: "cosyvoice3", allVoices: [voice(), cosy], voices: [voice(), cosy], onGenerate })} />);
    expect(screen.getByRole("button", { name: /Script có voice OmniVoice/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Script có voice OmniVoice/ }));
    expect(onGenerate).not.toHaveBeenCalled();

    rerender(<VoiceGenerator {...props({ generationEngine: "cosyvoice3", allVoices: [voice(), cosy], voices: [voice(), cosy], rows: [{ id: "c", speakerProfileId: "speaker-an", voiceId: "cosy", text: "Xin chào" }] })} />);
    const cast = screen.getByRole("list", { name: "Voice trong Script" });
    expect(within(cast).getByText(/CosyVoice3/)).toBeInTheDocument();
    expect(within(cast).queryByText(/OmniVoice/)).not.toBeInTheDocument();
  });

  it("shows an unavailable selected engine's descriptor parameters without voices or changing Script assignments", () => {
    const fishVoice = voice({ id: "fish-voice", engine: "fish-s2-pro" });
    const fish: TrainingModelOption = {
      ...GENERATOR, id: "fish-s2-pro-generate", engine: "fish-s2-pro", family: "Fish S2 Pro", label: "Fish S2 Pro",
      available: false, status: "Chưa có model và runtime Fish S2 Pro.",
      notes: ["Chỉ hỗ trợ một số ngôn ngữ."],
      parameters: [{ key: "temperature", label: "Temperature", group: "Đọc", kind: "float", default: 0.7, min: 0, max: 1, options: [], nullable: false, editable: true, advanced: false }],
    };
    const onGenerate = vi.fn();
    const generators = [GENERATOR, fish];
    const fishParameters = { "fish-s2-pro-generate": { temperature: 0.85 } };
    const { rerender } = render(<VoiceGenerator {...props({ generators, generationEngine: "fish-s2-pro", voices: [], allVoices: [fishVoice], rows: [], parameters: fishParameters, onGenerate })} />);

    expect(screen.getByText("Chưa có model và runtime Fish S2 Pro.")).toBeInTheDocument();
    expect(screen.getByText("Chỉ hỗ trợ một số ngôn ngữ.")).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature")).toHaveValue("0.85");
    expect(screen.getByRole("button", { name: /Fish S2 Pro chưa sẵn sàng/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Fish S2 Pro chưa sẵn sàng/ }));
    expect(onGenerate).not.toHaveBeenCalled();

    rerender(<VoiceGenerator {...props({ generators, generationEngine: "omnivoice", allVoices: [voice(), fishVoice], voices: [voice()], rows: ROWS, parameters: fishParameters, onGenerate })} />);
    expect(screen.getByLabelText("Số bước giải mã")).toHaveValue("32");
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();
    rerender(<VoiceGenerator {...props({ generators, generationEngine: "fish-s2-pro", voices: [], allVoices: [fishVoice], rows: [], parameters: fishParameters, onGenerate })} />);
    expect(screen.getByLabelText("Temperature")).toHaveValue("0.85");
  });

  it("offers CosyVoice language and delivery instructions only in instruct mode", () => {
    const cosyVoice = voice({ engine: "cosyvoice3" });
    const cosy: TrainingModelOption = { ...GENERATOR, id: "cosyvoice3-generate", engine: "cosyvoice3", label: "CosyVoice3",
      parameters: [
        { key: "mode", label: "Chế độ", group: "Chung", kind: "choice", default: "cross-lingual", options: [{ value: "cross-lingual", label: "Cross-language" }, { value: "instruct", label: "Chỉ dẫn" }], nullable: false, editable: true, advanced: false },
        { key: "language", label: "Ngôn ngữ chỉ dẫn", group: "Chung", kind: "choice", default: "en", options: [{ value: "en", label: "English" }, { value: "ja", label: "Japanese" }], nullable: false, editable: true, advanced: false },
        { key: "instruction", label: "Chỉ dẫn cách đọc", group: "Chung", kind: "text", default: "", options: [], nullable: false, editable: true, advanced: false },
      ] };
    const onParametersChange = vi.fn();
    const base = props({ generators: [cosy], voices: [cosyVoice], rows: [ROWS[0]], onParametersChange });
    const { rerender } = render(<VoiceGenerator {...base} />);
    expect(screen.queryByLabelText("Ngôn ngữ chỉ dẫn")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chỉ dẫn cách đọc")).not.toBeInTheDocument();
    expect(screen.getByText(/Ngôn ngữ theo nội dung Script/)).toBeInTheDocument();

    rerender(<VoiceGenerator {...base} parameters={{ "cosyvoice3-generate": { mode: "instruct", language: "ja", instruction: "Speak softly" } }} />);
    expect(screen.getByLabelText("Ngôn ngữ chỉ dẫn")).toHaveValue("ja");
    fireEvent.change(screen.getByLabelText("Chế độ"), { target: { value: "cross-lingual" } });
    expect(onParametersChange).toHaveBeenLastCalledWith("cosyvoice3-generate", {});
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
