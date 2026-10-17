import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Timeline, normalizeWordTimings } from "./Timeline";
import { ScriptEditor } from "../script/ScriptEditor";

import { useState } from "react";

import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { mapStretchTime, type VoiceEditController, type VoiceEditPacket, type StretchOperation } from "../../domain/voice-edits";

it("resumes the ordinary Script follow policy by dragging its Timeline", () => {
  const words = [{ text: "hello", start: 3, end: 4 }];
  const { container } = render(<><ScriptEditor playbackAssetId="file" value="hello" words={words} workflow="speech-to-text" onChange={vi.fn()} />
    <Timeline gain={0} onGainChange={vi.fn()} take={{ id: "file", name: "file.wav", url: "/audio.wav", duration: 10, words }} /></>);
  const view = container.querySelector<HTMLElement>(".script-table-scroll")!;
  Object.defineProperties(view, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 2000 } });
  vi.spyOn(view, "getBoundingClientRect").mockReturnValue({ top: 100, height: 200 } as DOMRect);
  const word = container.querySelector<HTMLElement>(".script-table__word")!;
  vi.spyOn(word, "getBoundingClientRect").mockImplementation(() => ({ top: 500 - view.scrollTop, height: 20 } as DOMRect));
  const waveform = screen.getByLabelText("Waveform timeline");
  vi.spyOn(container.querySelector<HTMLElement>(".timeline-canvas")!, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.wheel(view);
  fireEvent.pointerDown(waveform, { button: 0, pointerId: 1, clientX: 35 });
  fireEvent.pointerUp(waveform, { button: 0, pointerId: 1, clientX: 35 });
  expect(word).toHaveClass("is-active");
  expect(view.scrollTop).toBeGreaterThan(0);
  fireEvent.wheel(view);
  view.scrollTop = 0;
  fireEvent.pointerDown(waveform, { button: 0, pointerId: 2, clientX: 36 });
  fireEvent.pointerUp(waveform, { button: 0, pointerId: 2, clientX: 36 });
  expect(view.scrollTop).toBeGreaterThan(0);
});

/** The workspace owns the selection; render it here the way the app does. */
function SelectableTimeline(props: Parameters<typeof Timeline>[0]) {
  const [selection, setSelection] = useState<WordSelection>(EMPTY_SELECTION);
  return <Timeline {...props} onWordSelectionChange={setSelection} wordSelection={selection} />;
}

describe("Timeline", () => {
  it("keeps mapped seek until preview metadata arrives after commit completion", async () => {
    vi.useFakeTimers();
    const sourcePacket = { document: { revision: 0, cursor: 0, sampleRate: 24000, sourceFrames: 240000, operations: [], outputId: "o" }, duration: 10, audioUrl: "/source.wav", output: {} as never } as VoiceEditPacket;
    const previewPacket = { ...sourcePacket, audioUrl: "/preview.wav" };
    let usedOperation: StretchOperation | null = null;
    function Harness() {
      const [packet, updatePacket] = useState(sourcePacket);
      const controller: VoiceEditController = { packet, busy: false, error: null,
        preview: async (operation) => { usedOperation = operation; updatePacket(previewPacket); return true; }, commit: async () => true, cancel: vi.fn(), history: async () => true };
      return <Timeline gain={0} onGainChange={vi.fn()} voiceEdits={controller} rangeSelectionEnabled
        wordSelection={{ indexes: [0], anchor: 0, ranges: [{ id: "r", start: 2, end: 4 }] }}
        take={{ id: "o", name: "source.wav", url: packet.audioUrl, duration: 10 }} />;
    }
    let currentSrc = "/source.wav";
    const { container } = render(<Harness />);
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "currentSrc", { configurable: true, get: () => currentSrc });
    let currentTime = 3;
    Object.defineProperty(audio, "currentTime", { configurable: true, get: () => currentTime, set: (value: number) => { currentTime = value; } });
    const canvas = container.querySelector(".timeline-canvas") as HTMLElement;
    Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, width: 1000, top: 0, height: 100, right: 1000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) });
    const handle = screen.getByRole("button", { name: "Giãn vùng r từ cuối" });
    fireEvent.pointerDown(handle, { button: 0, ctrlKey: true, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 500 });
    await act(async () => { vi.advanceTimersByTime(180); await Promise.resolve(); });
    currentSrc = "/preview.wav";
    await act(async () => { fireEvent.pointerUp(window, { pointerId: 1 }); await Promise.resolve(); });
    expect(currentTime).toBe(3);
    fireEvent.loadedMetadata(audio);
    expect(usedOperation).not.toBeNull();
    expect(currentTime).toBe(mapStretchTime(3, usedOperation!, 24000));
    expect(currentTime).not.toBe(3);
    vi.useRealTimers();
  });

  it("keeps the previous readable subtitle rendered after the playhead enters its touching neighbour", () => {
    const onWordsChange = vi.fn();
    const take = { id: "touching", name: "touching.wav", url: "/audio.wav", duration: 1,
      words: [{ text: "Thì", start: 0, end: .01 }, { text: "trong", start: .01, end: .1 }, { text: "lúc", start: .1, end: .3 }] };
    const { container } = render(<SelectableTimeline gain={0} onGainChange={() => undefined} take={take} onWordsChange={onWordsChange} />);
    const audio = container.querySelector("audio")!;
    audio.currentTime = .05; fireEvent.timeUpdate(audio);
    expect(screen.getByRole("button", { name: "Subtitle word trong" })).toHaveClass("is-active");
    audio.currentTime = .15; fireEvent.timeUpdate(audio);
    expect(screen.getByRole("button", { name: "Subtitle word lúc" })).toHaveClass("is-active");
    expect(screen.getByRole("button", { name: "Subtitle word trong" })).not.toHaveClass("is-compact");
    expect(onWordsChange).not.toHaveBeenCalled();
  });

  it("keeps paused browsing at the end when zoom changes instead of following the idle playhead", () => {
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined}
      take={{ id: "archive", name: "archive.wav", url: "/audio.wav", duration: 300 }} />);
    const scroller = container.querySelector(".timeline-scroll") as HTMLDivElement;
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 1000 },
      scrollWidth: { configurable: true, value: 3000 },
    });
    scroller.scrollLeft = 2000;
    fireEvent.scroll(scroller);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "2" } });
    expect(scroller.scrollLeft).toBe(2000);
  });
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

  it("repaints the detailed PCM canvas using draft gain while the slider is held", async () => {
    const starts: number[] = [];
    const context = {
      beginPath: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), lineTo: vi.fn(),
      moveTo: vi.fn((_: number, y: number) => starts.push(y)),
    } as unknown as CanvasRenderingContext2D;
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() { this.callback([], this as unknown as ResizeObserver); }
      disconnect() {}
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      start: 0, end: 10, duration: 10, resolution: .001,
      points: Array.from({ length: 20 }, () => ({ min: -.25, max: .25 })),
    }) }));
    try {
      const { container } = render(<Timeline gain={0} onGainChange={() => undefined}
        take={{ id: "gain-canvas", name: "gain.wav", url: "/api/projects/p/media/gain-canvas/audio", duration: 10 }} />);
      const scroller = container.querySelector(".timeline-scroll") as HTMLDivElement;
      const canvas = container.querySelector(".timeline-canvas") as HTMLDivElement;
      Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 1000 });
      Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 2000, height: 100, right: 2000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) });
      fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "2" } });
      await waitFor(() => expect(screen.getByLabelText("PCM waveform at zoom")).toBeInTheDocument());
      const initialTop = starts[starts.length - 1];
      const gain = screen.getByRole("slider", { name: "Source gain" });
      fireEvent.pointerDown(gain);
      fireEvent.change(gain, { target: { value: "6" } });
      expect(starts[starts.length - 1]).toBeLessThan(initialTop);
    } finally {
      canvasContext.mockRestore();
      vi.unstubAllGlobals();
    }
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

  it("fits a newly opened footage after zooming into the previous one", () => {
    const { rerender } = render(<Timeline gain={0} onGainChange={() => undefined}
      take={{ id: "first", name: "first.wav", url: "/first.wav", duration: 120 }} />);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "1000" } });
    expect(screen.getByRole("slider", { name: "Zoom timeline" })).toHaveValue("1000");
    rerender(<Timeline gain={0} onGainChange={() => undefined}
      take={{ id: "second", name: "second.wav", url: "/second.wav", duration: 3600 }} />);
    expect(screen.getByRole("slider", { name: "Zoom timeline" })).toHaveValue("0");
  });

  it("keeps a settled PCM window when the server groups peaks below the requested point count", async () => {
    const fetchWaveform = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        start: 0,
        end: 10,
        resolution: 0.001,
        points: Array.from({ length: 650 }, () => ({ min: -0.25, max: 0.25 })),
      }),
    });
    vi.stubGlobal("fetch", fetchWaveform);
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    try {
      const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ id: "pcm", name: "pcm.wav", url: "/api/projects/p/media/pcm/audio", duration: 10 }} />);
      const scroller = container.querySelector(".timeline-scroll") as HTMLDivElement;
      const canvas = container.querySelector(".timeline-canvas") as HTMLDivElement;
      Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 1000 });
      Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 1000, height: 100, right: 1000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) });
      fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "2" } });
      await waitFor(() => expect(screen.getByLabelText("PCM waveform at zoom")).toBeInTheDocument());
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(fetchWaveform).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Đang đọc PCM waveform theo vùng nhìn…")).not.toBeInTheDocument();
    } finally {
      canvasContext.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("loads a new PCM window when the viewport moves beyond the cached range", async () => {
    const fetchWaveform = vi.fn().mockImplementation(async (input: string) => {
      const query = new URL(input, window.location.href).searchParams;
      return {
        ok: true,
        json: async () => ({
          start: Number(query.get("start")),
          end: Number(query.get("end")),
          resolution: 0.001,
          points: Array.from({ length: 650 }, () => ({ min: -0.25, max: 0.25 })),
        }),
      };
    });
    vi.stubGlobal("fetch", fetchWaveform);
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    try {
      const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ id: "pcm", name: "pcm.wav", url: "/api/projects/p/media/pcm/audio", duration: 10 }} />);
      const scroller = container.querySelector(".timeline-scroll") as HTMLDivElement;
      const canvas = container.querySelector(".timeline-canvas") as HTMLDivElement;
      Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 1000 });
      Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 2000, height: 100, right: 2000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) });
      fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "2" } });
      await waitFor(() => expect(screen.getByLabelText("PCM waveform at zoom")).toBeInTheDocument());
      expect(fetchWaveform).toHaveBeenCalledTimes(1);

      scroller.scrollLeft = 1000;
      fireEvent.scroll(scroller);
      await waitFor(() => expect(fetchWaveform).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(fetchWaveform).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("Đang đọc PCM waveform theo vùng nhìn…")).not.toBeInTheDocument();
    } finally {
      canvasContext.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("preserves each supplied word boundary without stretching it to the next word", () => {
    const timings = normalizeWordTimings([{ text: "một", start: 1, end: 1.01 }, { text: "câu", start: 1.01, end: 1.02 }, { text: "dài", start: 1.02, end: 1.03 }, { text: "tiếp", start: 2, end: 2.2 }], 3);
    expect(timings.map((word) => [word.start, word.end])).toEqual([[1, 1.01], [1.01, 1.02], [1.02, 1.03], [2, 2.2]]);
  });
  it("keeps unaligned words reviewable without promoting their timing", async () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "review.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "needs-alignment", words: [{ text: "vẫn", start: 1, end: 1.3, timingTrusted: false }, { text: "hiện", start: 1.3, end: 1.6, timingTrusted: false }] }} />);
    expect(screen.getByRole("button", { name: "Subtitle word vẫn" })).toHaveClass("timeline-word--untrusted");
  });

  it("shows unverified timing as an explicitly warned word instead of hiding it", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "legacy.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "unverified", words: [{ text: "cũ", start: 1, end: 1.3, timingTrusted: false }] }} />);
    expect(screen.getByRole("button", { name: "Subtitle word cũ" })).toHaveClass("timeline-word--untrusted");
  });

  it("keeps dense words in place and restores their labels when zoom provides room", () => {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains("timeline-canvas")
        ? 1_000 * Number(this.style.getPropertyValue("--zoom") || 1) : 1_000;
      return { left: 0, top: 0, width, height: 100, right: width, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "dense.wav", duration: 60,
        wordTimingQuality: "source", words: [{ text: "short", start: 0.1, end: 0.2 }] }} />);
      const word = screen.getByRole("button", { name: "Subtitle word short" });
      expect(word).toHaveClass("is-compact");
      const originalLeft = word.style.left;
      fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "1000" } });
      expect(word).not.toHaveClass("is-compact");
      expect(word.style.left).toBe(originalLeft);
    } finally {
      rectSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("renders bounded single-word stripes for a long transcript without changing source hit targets", () => {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains("timeline-canvas") ? 1_000 : this.classList.contains("timeline-scroll") ? 1_000 : 1_000;
      return { left: 0, top: 0, width, height: 100, right: width, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const words = Array.from({ length: 6_000 }, (_, index) => {
        const start = index * 0.15;
        return { text: `word${index}`, start, end: start + 0.12 };
      });
      const onWordSelectionChange = vi.fn();
      const { container } = render(<Timeline gain={0} onGainChange={() => undefined}
        wordSelection={EMPTY_SELECTION} onWordSelectionChange={onWordSelectionChange}
        take={{ name: "long-overview.wav", duration: 900, wordTimingQuality: "source", words }} />);
      const labels = [...container.querySelectorAll<HTMLButtonElement>(".word-track > .timeline-word")];
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.length).toBeLessThanOrEqual(250);
      expect(labels.every((label) => /^Subtitle word word\d+$/.test(label.getAttribute("aria-label") ?? ""))).toBe(true);
      const pixelSlots = labels.map((label) => ({
        left: Number.parseFloat(label.style.left) * 10,
        width: Number.parseFloat(label.style.width) * 10,
      }));
      expect(pixelSlots.every((slot) => slot.width >= 4)).toBe(true);
      expect(pixelSlots.every((slot, index) => index === 0 || slot.left >= pixelSlots[index - 1].left + pixelSlots[index - 1].width - 0.01)).toBe(true);
      const stripe = labels.find((label) => label.getAttribute("aria-label") === "Subtitle word word24")!;
      fireEvent.pointerDown(stripe, { button: 0, clientX: 8, clientY: 10, pointerId: 1 });
      expect(onWordSelectionChange).toHaveBeenCalledWith({ indexes: [24], anchor: 24 });
    } finally {
      rectSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("renders partial timing and marks only the untrusted word", () => {
    render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "partial.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "partial", words: [{ text: "đúng", start: 1, end: 1.3, timingTrusted: true }, { text: "cảnh-báo", start: 1.3, end: 1.31, timingTrusted: false }] }} />);
    expect(screen.getByRole("button", { name: "Subtitle word đúng" })).not.toHaveClass("timeline-word--untrusted");
    expect(screen.getByRole("button", { name: "Subtitle word cảnh-báo" })).toHaveClass("timeline-word--untrusted");
  });

  it("assigns one speaker profile to a swept selection of subtitle words", async () => {
    const onWordsChange = vi.fn();
    const { container } = render(<SelectableTimeline gain={0} onGainChange={() => undefined} onWordsChange={onWordsChange} speakers={[{ id: "lan", name: "Chị Lan", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "female", attributes: {}, color: "#d95", createdAt: "2026-08-28T00:00:00Z" }]} take={{ name: "dialogue.wav", url: "/audio.wav", duration: 4, wordTimingQuality: "source", words: [{ text: "xin", start: 0, end: 0.4 }, { text: "chào", start: 0.4, end: 0.8 }, { text: "bạn", start: 0.8, end: 1.2 }] }} />);
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
    fireEvent.contextMenu(second, { clientX: 60, clientY: 10 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Chưa gán Profile" }));
    expect(onWordsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ text: "xin", speakerId: null }),
      expect.objectContaining({ text: "chào", speakerId: null }),
      expect.objectContaining({ text: "bạn" }),
    ]);
    expect(onWordsChange.mock.calls.at(-1)?.[0][2]).not.toHaveProperty("speakerId");
  });

  it("seeks immediately when the user clicks or drags on the waveform", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={{ name: "scrub.wav", url: "/audio.wav", duration: 10 }} />);
    const canvas = container.querySelector(".timeline-canvas") as HTMLDivElement;
    const waveform = screen.getByLabelText("Waveform timeline");
    Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(waveform, { clientX: 100, pointerId: 1 });
    expect(await screen.findByText("00:00:05.000")).toBeInTheDocument();
    fireEvent.pointerMove(waveform, { clientX: 160, pointerId: 1 });
    expect(await screen.findByText("00:00:08.000")).toBeInTheDocument();
    expect(play).toHaveBeenCalled();
    const audio = container.querySelector("audio")!;
    audio.currentTime = 9;
    fireEvent.timeUpdate(audio);
    expect(screen.getByText("00:00:08.000")).toBeInTheDocument();
    fireEvent.pointerUp(waveform, { clientX: 160, pointerId: 1 });
    expect(audio.currentTime).toBe(8);
    expect(pause).toHaveBeenCalled();
  });
});


it("draws a midpoint PCM bucket at the same clock as its subtitle instead of stretching it to the end", async () => {
  const lineTo = vi.fn();
  const context = { lineTo, moveTo: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillRect: vi.fn() };
  const canvasSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ start: 0, end: 600,
    resolution: .001, points: [{ min: 0, max: 0 }, { min: 0, max: 0 }, { min: -.5, max: .5 }, { min: 0, max: 0 }] }) }));
  try {
    const { container } = render(<Timeline gain={0} onGainChange={vi.fn()} take={{ id: "pulse", name: "pulse.wav", duration: 600,
      url: "/api/pulse/audio", words: [{ text: "pulse", start: 300, end: 300.5 }] }} />);
    const scroller = container.querySelector(".timeline-scroll")!;
    const canvas = container.querySelector(".timeline-canvas")!;
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 1000 });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "2" } });
    await waitFor(() => expect(lineTo).toHaveBeenCalledWith(6000, 27));
    expect(screen.getByRole("button", { name: "Subtitle word pulse" })).toHaveStyle({ left: "50%" });
  } finally { canvasSpy.mockRestore(); vi.unstubAllGlobals(); }
});
