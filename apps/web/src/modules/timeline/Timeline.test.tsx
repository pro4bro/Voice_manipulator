import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Timeline, normalizeWordTimings } from "./Timeline";

describe("Timeline", () => {
  it("previews source gain while dragging and commits it only when released", () => {
    const onGainChange = vi.fn();
    render(<Timeline gain={0} onGainChange={onGainChange} take={null} />);
    const slider = screen.getByRole("slider", { name: "Source gain" });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "6" } });
    expect(onGainChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider, { target: { value: "6" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Tốc độ phát" }), { target: { value: "8" } });
    expect(onGainChange).toHaveBeenCalledWith(6);
    expect(screen.getByRole("combobox", { name: "Tốc độ phát" })).toHaveValue("8");
  });

  it("exposes a fast timeline zoom slider", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "test.wav", url: "/audio.wav", duration: 10 }} />);
    const slider = screen.getByRole("slider", { name: "Zoom timeline" });
    expect(slider).toHaveAttribute("max", "1000");
    fireEvent.change(slider, { target: { value: "1000" } });
    expect(screen.getByTitle("Mật độ hiển thị timeline")).toHaveTextContent("0.01s / 10px");
  });

  it("moves the playhead from the audio clock", async () => {
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "test.wav", url: "/audio.wav", duration: 10 }} />);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 2.5 });
    fireEvent.timeUpdate(audio);
    expect(await screen.findByText("00:00:02.500")).toBeInTheDocument();
  });

  it("renders a detailed live waveform and visible playhead while recording", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} recordingPreview={{ active: true, duration: 1.2, samples: [{ min: -0.1, max: 0.2 }, { min: -0.4, max: 0.4 }, { min: -0.2, max: 0.7 }] }} take={null} />);
    expect(screen.getByLabelText("Natural audio waveform").tagName).toBe("CANVAS");
    expect(screen.getByLabelText("Playhead indicator")).toHaveClass("is-recording");
    expect(screen.getByText(/REC LIVE · waveform đang cập nhật/)).toBeInTheDocument();
  });

  it("preserves each supplied word boundary without stretching it to the next word", () => {
    const timings = normalizeWordTimings([{ text: "một", start: 1, end: 1.01 }, { text: "câu", start: 1.01, end: 1.02 }, { text: "dài", start: 1.02, end: 1.03 }, { text: "tiếp", start: 2, end: 2.2 }], 3);
    expect(timings.map((word) => [word.start, word.end])).toEqual([[1, 1.01], [1.01, 1.02], [1.02, 1.03], [2, 2.2]]);
  });
  it("hides unaligned recognizer subtitle boxes so they cannot be edited as source timing", async () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "review.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "needs-alignment", words: [{ text: "vẫn", start: 1, end: 1.3 }, { text: "hiện", start: 1.3, end: 1.6 }] }} />);
    expect(screen.queryByRole("button", { name: "Subtitle word vẫn" })).not.toBeInTheDocument();
    expect(screen.getByText(/chưa có nguồn căn chỉnh đáng tin/i)).toBeInTheDocument();
  });

  it("shows unverified timing as an explicitly warned word instead of hiding it", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "legacy.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "unverified", words: [{ text: "cũ", start: 1, end: 1.3, timingTrusted: false }] }} />);
    expect(screen.getByRole("button", { name: "Subtitle word cũ" })).toHaveClass("timeline-word--untrusted");
  });

  it("renders partial timing and marks only the untrusted word", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "partial.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "partial", words: [{ text: "đúng", start: 1, end: 1.3, timingTrusted: true }, { text: "cảnh-báo", start: 1.3, end: 1.31, timingTrusted: false }] }} />);
    expect(screen.getByRole("button", { name: "Subtitle word đúng" })).not.toHaveClass("timeline-word--untrusted");
    expect(screen.getByRole("button", { name: "Subtitle word cảnh-báo" })).toHaveClass("timeline-word--untrusted");
  });

  it("assigns one speaker profile to a swept selection of subtitle words", async () => {
    const onWordsChange = vi.fn();
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={onWordsChange} speakers={[{ id: "lan", name: "Chị Lan", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "female", attributes: {}, color: "#d95", createdAt: "2026-08-28T00:00:00Z" }]} take={{ name: "dialogue.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "source", words: [{ text: "xin", start: 0, end: 0.4 }, { text: "chào", start: 0.4, end: 0.8 }, { text: "bạn", start: 0.8, end: 1.2 }] }} />);
    const second = screen.getByRole("button", { name: "Subtitle word chào" });
    const track = container.querySelector(".word-track") as HTMLDivElement;
    const canvas = container.querySelector(".timeline-canvas") as HTMLDivElement;
    const rect = () => ({ left: 0, top: 0, width: 400, height: 40, right: 400, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(track, "getBoundingClientRect", { configurable: true, value: rect });
    Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: rect });
    fireEvent.pointerDown(track, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 60, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 60, clientY: 10, pointerId: 1 });
    await waitFor(() => expect(second).toHaveAttribute("aria-pressed", "true"));
    fireEvent.contextMenu(second, { clientX: 60, clientY: 10 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Chị Lan" }));
    expect(onWordsChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "xin", speakerId: "lan" }),
      expect.objectContaining({ text: "chào", speakerId: "lan" }),
      expect.objectContaining({ text: "bạn" }),
    ]);
  });

  it("seeks immediately when the user clicks or drags on the waveform", async () => {
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "scrub.wav", url: "/audio.wav", duration: 10 }} />);
    const canvas = container.querySelector(".timeline-canvas") as HTMLDivElement;
    const waveform = screen.getByLabelText("Waveform timeline");
    Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(waveform, { clientX: 100, pointerId: 1 });
    expect(await screen.findByText("00:00:05.000")).toBeInTheDocument();
    fireEvent.pointerMove(waveform, { clientX: 160, pointerId: 1 });
    expect(await screen.findByText("00:00:08.000")).toBeInTheDocument();
  });
});
