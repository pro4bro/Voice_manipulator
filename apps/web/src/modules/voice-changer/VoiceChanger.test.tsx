import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChangerRecordControls } from "./ChangerRecordControls";
import { meterFraction } from "./SoundReactor";
import { VoiceInput, startProblem } from "./VoiceInput";
import type { ProjectVoice, SpeakerProfile, TrainingModelOption, VoiceChangerPreflight, VoiceChangerRecording, VoiceChangerSettings, VoiceChangerStatus } from "../../domain/types";

const KHOA: SpeakerProfile = { id: "speaker-khoa", name: "Khoa Trịnh", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#0f0", createdAt: "" };

const PASSTHROUGH: TrainingModelOption = {
  id: "passthrough-check", label: "Kiểm tra luồng · giữ nguyên giọng", family: "Pro4Bro", engine: "passthrough", mode: "live-convert", description: "Không đổi giọng.",
  order: 1, runnable: true, repository: { root: "pro4bro", path: "app", entrypoint: "workers/voice_changer_worker.py" }, notes: [], origin: "shipped",
  installed: true, available: true, status: "Sẵn sàng.",
  parameters: [{ key: "block_ms", label: "Độ dài mỗi khối", group: "Luồng", kind: "int", default: 40, min: 10, max: 200, options: [], nullable: false, editable: true, advanced: false }],
};
const RVC: TrainingModelOption = { ...PASSTHROUGH, id: "rvc-live", label: "RVC · đổi giọng đã train", engine: "rvc", available: false, installed: false, blockedReason: "Chưa tải RVC", status: "Chưa thấy repo" };

const PREFLIGHT: VoiceChangerPreflight = {
  runtimeReady: true, runtimePython: "python.exe", missing: [], deviceError: null, endpoints: [], virtualCable: "CABLE Input (VB-Audio Virtual Cable)", gpuHolder: null,
  devices: [
    { index: 1, name: "Microphone (SmallRig U50)", hostApi: "MME", maxInputChannels: 1, maxOutputChannels: 0, defaultSampleRate: 48000, virtualCable: false },
    { index: 4, name: "Headphones (SmallRig U50)", hostApi: "MME", maxInputChannels: 0, maxOutputChannels: 2, defaultSampleRate: 48000, virtualCable: false },
    { index: 7, name: "CABLE Input (VB-Audio Virtual Cable)", hostApi: "MME", maxInputChannels: 0, maxOutputChannels: 2, defaultSampleRate: 48000, virtualCable: true },
  ],
};

const SETTINGS: VoiceChangerSettings = { engineId: "passthrough-check", voiceId: null, inputDevice: 1, virtualDevice: 7, speakerDevice: null, monitor: false, parameters: {} };

const VOICE: ProjectVoice = {
  id: "voice-khoa", name: "Khoa · nhái giọng", speakerProfileId: "speaker-khoa", engine: "omnivoice", kind: "clone", modelId: null, baseModel: "k2-fsa/OmniVoice",
  referenceAudio: "", referenceText: "", referenceSeconds: 8.6, referenceSegmentId: null, adapterPath: null, language: "vi", sourceRunId: null, createdAt: "2026-09-15T00:00:00Z",
};

function props(overrides = {}) {
  return {
    engines: [PASSTHROUGH, RVC], preflight: PREFLIGHT, settings: SETTINGS, onSettingsChange: vi.fn(), speakers: [KHOA], voices: [VOICE],
    speakerId: "speaker-khoa", status: null, onStart: vi.fn(), onStop: vi.fn(), onRefresh: vi.fn(), ...overrides,
  };
}

describe("Voice Changer modules", () => {
  it("starts once a device, an output and a runnable engine are set", () => {
    const onStart = vi.fn();
    render(<VoiceInput {...props({ onStart })} />);

    expect(screen.getByText("Khoa Trịnh")).toBeInTheDocument();
    expect(screen.getByLabelText("Micro ảo")).toHaveValue("7");
    expect(screen.getByText(/chọn micro “CABLE Output”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bắt đầu đổi giọng/ }));
    expect(onStart).toHaveBeenCalled();
  });

  it("says what is missing before a start, runtime first", () => {
    expect(startProblem({ engines: [PASSTHROUGH], preflight: { ...PREFLIGHT, runtimeReady: false, missing: ["sounddevice"] }, settings: SETTINGS })).toBe("Chưa có runtime Voice Changer");
    expect(startProblem({ engines: [PASSTHROUGH, RVC], preflight: PREFLIGHT, settings: { ...SETTINGS, engineId: "rvc-live" } })).toBe("RVC · đổi giọng đã train chưa sẵn sàng");
    expect(startProblem({ engines: [PASSTHROUGH], preflight: PREFLIGHT, settings: { ...SETTINGS, virtualDevice: null } })).toBe("Chọn micro ảo hoặc bật nghe qua loa");
    expect(startProblem({ engines: [PASSTHROUGH], preflight: PREFLIGHT, settings: { ...SETTINGS, virtualDevice: null, monitor: true, speakerDevice: 4 } })).toBeNull();
    expect(startProblem({ engines: [PASSTHROUGH], preflight: PREFLIGHT, settings: { ...SETTINGS, parameters: { "passthrough-check": { block_ms: 5 } } } })).toBe("Tham số chưa hợp lệ");
  });

  it("explains a missing runtime and keeps monitoring off unless asked", () => {
    const onSettingsChange = vi.fn();
    render(<VoiceInput {...props({ preflight: { ...PREFLIGHT, runtimeReady: false, missing: ["numpy", "sounddevice"], devices: [] }, onSettingsChange })} />);

    expect(screen.getByText(/numpy, sounddevice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chưa có runtime Voice Changer/ })).toBeDisabled();
    const monitor = screen.getByRole("checkbox", { name: /Nghe giọng đã đổi qua loa/ });
    expect(monitor).not.toBeChecked();
    fireEvent.click(monitor);
    expect(onSettingsChange).toHaveBeenLastCalledWith({ ...SETTINGS, monitor: true });
  });

  it("offers recording only while running, and shows the delay a recording removed", () => {
    const running = { state: "running", recording: false, recordingSeconds: 0 } as VoiceChangerStatus;
    const recording: VoiceChangerRecording = { id: "changer-1", name: "Khoa · 10:00:00", engineId: "passthrough-check", voiceId: null, voiceName: null, speakerProfileId: null,
      duration: 12, sampleRate: 48000, channels: 2, delayMs: 40, refinedDelayMs: 12, audioPath: "", parameters: {}, createdAt: "" };
    const onRecord = vi.fn();
    const { rerender } = render(<ChangerRecordControls activeRecordingId={null} onDelete={vi.fn()} onOpen={vi.fn()} onRecord={onRecord} onStopRecording={vi.fn()} recordings={[]} status={null} />);
    expect(screen.getByRole("button", { name: "Ghi 2 kênh" })).toBeDisabled();

    rerender(<ChangerRecordControls activeRecordingId="changer-1" onDelete={vi.fn()} onOpen={vi.fn()} onRecord={onRecord} onStopRecording={vi.fn()} recordings={[recording]} status={running} />);
    fireEvent.click(screen.getByRole("button", { name: "Ghi 2 kênh" }));
    expect(onRecord).toHaveBeenCalled();
    expect(screen.getByText("L: micro · R: đã đổi · bù 52 ms")).toBeInTheDocument();
  });

  it("maps decibels onto the meter", () => {
    expect(meterFraction(-120)).toBe(0);
    expect(meterFraction(-30)).toBe(0.5);
    expect(meterFraction(3)).toBe(1);
  });
});
