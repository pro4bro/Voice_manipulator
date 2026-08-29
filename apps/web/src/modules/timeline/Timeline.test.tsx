import { fireEvent, render, screen } from "@testing-library/react";
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

  it("moves the playhead from the audio clock", () => {
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "test.wav", url: "/audio.wav", duration: 10 }} />);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 2.5 });
    fireEvent.timeUpdate(audio);
    expect(screen.getByText("00:02.500")).toBeInTheDocument();
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
  it("hides unaligned recognizer subtitle boxes so they cannot be edited as source timing", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "review.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "needs-alignment", words: [{ text: "vẫn", start: 1, end: 1.3 }, { text: "hiện", start: 1.3, end: 1.6 }] }} />);
    expect(screen.queryByRole("button", { name: "Subtitle word vẫn" })).not.toBeInTheDocument();
    expect(screen.getByText(/cần căn chỉnh/i)).toBeInTheDocument();
  });

  it("assigns one speaker profile to a swept selection of subtitle words", () => {
    const onWordsChange = vi.fn();
    render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={onWordsChange} speakers={[{ id: "lan", name: "Chị Lan", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "female", attributes: {}, color: "#d95", createdAt: "2026-08-28T00:00:00Z" }]} take={{ name: "dialogue.wav", url: "/audio.wav", duration: 4, words: [{ text: "xin", start: 0, end: 0.4 }, { text: "chào", start: 0.4, end: 0.8 }, { text: "bạn", start: 0.8, end: 1.2 }] }} />);
    const first = screen.getByRole("button", { name: "Subtitle word xin" });
    const second = screen.getByRole("button", { name: "Subtitle word chào" });
    fireEvent.pointerDown(first, { pointerId: 1 });
    fireEvent.pointerEnter(second, { pointerId: 1 });
    fireEvent.pointerUp(second, { pointerId: 1 });
    fireEvent.contextMenu(second, { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Chị Lan" }));
    expect(onWordsChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "xin", speakerId: "lan" }),
      expect.objectContaining({ text: "chào", speakerId: "lan" }),
      expect.objectContaining({ text: "bạn" }),
    ]);
  });

  it("seeks immediately when the user clicks or drags on the waveform", () => {
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "scrub.wav", url: "/audio.wav", duration: 10 }} />);
    const canvas = container.querySelector(".timeline-canvas") as HTMLDivElement;
    const waveform = screen.getByLabelText("Waveform timeline");
    Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(waveform, { clientX: 100, pointerId: 1 });
    expect(screen.getByText("00:05.000")).toBeInTheDocument();
    fireEvent.pointerMove(waveform, { clientX: 160, pointerId: 1 });
    expect(screen.getByText("00:08.000")).toBeInTheDocument();
  });
});
