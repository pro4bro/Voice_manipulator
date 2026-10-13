import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Recorder } from "./Recorder";

describe("Recorder", () => {
  it("announces its footage slot before opening the microphone and retains a permission error", async () => {
    let rejectPermission!: (reason: Error) => void;
    const permission = new Promise<MediaStream>((_resolve, reject) => { rejectPermission = reject; });
    vi.stubGlobal("MediaRecorder", class {});
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(permission);
    const slot = vi.fn();
    render(<Recorder onRecordingReady={vi.fn()} onRecordingSlotChange={slot} projectName="Immediate audit" />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu thu" }));
    expect(slot).toHaveBeenCalledWith(expect.objectContaining({ status: "preparing", name: expect.stringContaining("Immediate-audit") }));
    const first = slot.mock.calls[0][0];
    rejectPermission(new Error("Microphone permission denied"));
    await waitFor(() => expect(slot).toHaveBeenLastCalledWith(expect.objectContaining({
      id: first.id, name: first.name, status: "error", detail: "Microphone permission denied",
    })));
  });
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "mic-1", groupId: "a", kind: "audioinput", label: "Rode NT1" },
          { deviceId: "out-1", groupId: "b", kind: "audiooutput", label: "Studio Monitor" },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getUserMedia: vi.fn(),
      },
    });
  });

  it("exposes microphone, output, and live monitoring controls", async () => {
    render(<Recorder onRecordingReady={() => undefined} />);

    expect(screen.getByRole("combobox", { name: "Nguồn thu âm" })).toHaveValue("microphone");
    expect(screen.getByRole("option", { name: /Tab trình duyệt/ })).toHaveValue("display");
    expect(await screen.findByRole("combobox", { name: "Micro thu âm" })).toHaveValue("mic-1");
    expect(screen.getByRole("combobox", { name: "Thiết bị phát monitor" })).toHaveValue("out-1");
    expect(screen.getByRole("checkbox", { name: "Nghe tiếng đang thu" })).not.toBeChecked();
  });

  const PACK = {
    packId: "vi-core-v1",
    language: "vi",
    languageName: "Tiếng Việt",
    title: "Bộ đọc chuẩn",
    version: 1,
    license: "pro4bro-original",
    passageCount: 2,
    cardCount: 20,
    wordCount: 400,
    estimatedSeconds: 160,
    emotions: ["normal", "angry"] as const,
  };

  const CARD = {
    cardId: "vi-angry-01-c01",
    passageId: "vi-angry-01",
    passageTitle: "Lần thứ ba",
    direction: "Bắt đầu kìm nén, siết chặt từng chữ.",
    emotion: "angry" as const,
    text: "Tôi đã nhắc chuyện đó ba lần rồi.",
    estimatedSeconds: 3.4,
  };

  function session(overrides = {}) {
    return {
      id: "session-1", revision: 3, speakerName: "Người đọc",
      packTitle: PACK.title,
      mode: "flow" as const,
      card: CARD,
      cardNumber: 4,
      cardTotal: 20,
      coverage: [
        { emotion: "angry" as const, targetSeconds: 270, recordedSeconds: 30, remainingSeconds: 240, cardsRecorded: 3, cardsTotal: 10, progress: 0.11 },
      ],
      secondsSinceBreak: 30,
      ...overrides,
    };
  }

  it("stays in ordinary recording until HQ is chosen", () => {
    render(<Recorder onRecordingReady={() => undefined} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} />);

    expect(screen.queryByRole("combobox", { name: "Bộ bài đọc" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu thu" })).toBeEnabled();
  });

  it("offers the pack, the reading style, and only the emotions that pack carries", () => {
    render(<Recorder onRecordingReady={() => undefined} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Bộ bài đọc" }), { target: { value: "vi-core-v1" } });

    expect(screen.getByRole("combobox", { name: "Cách đọc" })).toHaveValue("flow");
    expect(screen.getByRole("checkbox", { name: "Angry" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Sad" })).toBeDisabled();
  });

  it("requires an explicit Speaker Profile before opening a session", () => {
    const onStart = vi.fn();
    render(<Recorder onRecordingReady={() => undefined} onStartReadingSession={onStart} readingSpeakers={[{ id: "speaker-1", name: "Người đọc" }]} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByRole("button", { name: "Bắt đầu phiên đọc" })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Bộ bài đọc" }), { target: { value: "vi-core-v1" } });
    expect(screen.getByRole("button", { name: "Bắt đầu phiên đọc" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Speaker của phiên đọc" }), { target: { value: "speaker-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu phiên đọc" }));

    expect(onStart).toHaveBeenCalledWith("vi-core-v1", ["normal"], "flow", "speaker-1");
  });

  it("restores a session in HQ while leaving the microphone idle", () => {
    render(<Recorder onRecordingReady={() => undefined} readingSession={session()} />);
    expect(screen.getByRole("button", { name: "Thu thẻ 4" })).toBeEnabled();
    expect(screen.getByText("IDLE")).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("holds the current card until an uncertain upload can be retried", () => {
    const retry = vi.fn();
    render(<Recorder onRecordingReady={() => undefined} readingSession={session()} readingPending onRetryReadingTake={retry} />);
    expect(screen.getByRole("button", { name: "Thu thẻ 4" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bỏ thẻ này" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kết thúc phiên" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu lại bản thu" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("files a recording under the card frozen when Record was pressed", async () => {
    let pcmTap: { onaudioprocess?: (event: unknown) => void };
    const node = () => ({ connect: (other: unknown) => other, disconnect: vi.fn() });
    class PcmContext {
      sampleRate = 24000;
      destination = node();
      createGain() { return { ...node(), gain: { value: 1 } }; }
      createAnalyser() { return { ...node(), fftSize: 4096, smoothingTimeConstant: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(0) }; }
      createMediaStreamSource() { return node(); }
      createMediaStreamDestination() { return { ...node(), stream: {} }; }
      createScriptProcessor() { pcmTap = { ...node(), onaudioprocess: undefined }; return pcmTap; }
      close() { return Promise.resolve(); }
    }
    vi.stubGlobal("AudioContext", PcmContext);
    class BrowserRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", BrowserRecorder);
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:take"; } });
    const stopTrack = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
      getAudioTracks: () => [{ label: "Test mic", stop: stopTrack }],
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream);
    const onReady = vi.fn();
    const view = render(<Recorder onRecordingReady={onReady} readingSession={session()} />);
    fireEvent.click(screen.getByRole("button", { name: "Thu thẻ 4" }));
    await screen.findByRole("button", { name: "Dừng thu" });
    pcmTap!.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(2400).fill(0.1) } });
    view.rerender(<Recorder onRecordingReady={onReady} readingSession={session({ revision: 4, card: { ...CARD, cardId: "next-card" } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Dừng thu" }));
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(onReady.mock.calls[0][0]).toMatchObject({
      readingSessionId: "session-1", readingSessionRevision: 3, readingCardId: CARD.cardId, knownText: CARD.text,
      captureId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(stopTrack).toHaveBeenCalled();
    expect(onReady.mock.calls[0][0].file.name).toMatch(/\.wav$/);
    expect(onReady.mock.calls[0][0].duration).toBe(0.1);
  });

  it("does not open the microphone for HQ when lossless WAV capture is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    render(<Recorder onRecordingReady={vi.fn()} readingSession={session()} />);
    fireEvent.click(screen.getByRole("button", { name: "Thu thẻ 4" }));
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByText(/Phiên đọc cần trình duyệt hỗ trợ thu WAV/)).toBeInTheDocument();
  });

  it("shows the card, its direction, and what each emotion still owes", () => {
    render(<Recorder onRecordingReady={() => undefined} readingPacks={[{ ...PACK, emotions: [...PACK.emotions] }]} readingSession={session()} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByText(/THẺ 4\/20/)).toBeInTheDocument();
    expect(screen.getByText(CARD.direction)).toBeInTheDocument();
    expect(screen.getByText("còn 4m 00s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu thẻ 4" })).toBeEnabled();
  });

  it("warns once enough has been recorded that the voice starts drifting", () => {
    render(<Recorder onRecordingReady={() => undefined} readingSession={session({ secondsSinceBreak: 900 })} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByText(/Nghỉ một lát/)).toBeInTheDocument();
  });

  it("has nothing to record once the plan runs out of cards", () => {
    render(<Recorder onRecordingReady={() => undefined} readingSession={session({ card: null })} />);
    fireEvent.click(screen.getByRole("button", { name: "HQ" }));

    expect(screen.getByText(/Đã thu hết thẻ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu thu" })).toBeDisabled();
  });
});
