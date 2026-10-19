import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { ScriptEditor } from "../script/ScriptEditor";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";

function Harness() {
  const [selection, setSelection] = useState<WordSelection>({ indexes: [0], anchor: 0 });
  return <Timeline rangeSelectionEnabled gain={0} onGainChange={vi.fn()} wordSelection={selection} onWordSelectionChange={setSelection}
    take={{ id: "a", name: "a.wav", duration: 100, url: "/a.wav", words: [{ text: "one", start: 20, end: 21 }] }} />;
}
function geometry(container: HTMLElement) {
  const scroller = container.querySelector<HTMLElement>(".timeline-scroll")!;
  const canvas = container.querySelector<HTMLElement>(".timeline-canvas")!;
  const width = () => 1000 * Number(canvas.style.getPropertyValue("--zoom"));
  Object.defineProperties(scroller, { clientWidth: { configurable: true, value: 1000 }, scrollWidth: { configurable: true, get: width } });
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => ({ left: -scroller.scrollLeft, width: width() } as DOMRect));
  return { scroller, canvas, width };
}

it("repaints the current endpoint after a delayed canvas resize instead of the position captured at zoom", () => {
  let resize = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) { if (target.classList.contains("timeline-canvas")) resize = () => this.callback([], this as unknown as ResizeObserver); }
    disconnect() {}
  });
  try {
    const view = render(<Harness />); const { scroller, width } = geometry(view.container);
    const audio = view.container.querySelector("audio")!;
    audio.currentTime = 50; fireEvent.timeUpdate(audio);
    fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
    const playhead = screen.getByLabelText("Playhead indicator");
    for (const end of [true, false]) {
      scroller.scrollLeft = end ? width() - 1000 : 0;
      const x = end ? 1001 : -1;
      fireEvent.pointerDown(playhead, { button: 0, pointerId: 61, clientX: x });
      fireEvent.pointerUp(playhead, { pointerId: 61, clientX: x });
      const releasedLeft = scroller.scrollLeft;
      act(() => resize());
      expect(Number.parseFloat(playhead.style.transform.slice("translate3d(".length))).toBe(end ? width() : 0);
      expect(scroller.scrollLeft).toBe(releasedLeft);
    }
    view.unmount();
  } finally { vi.unstubAllGlobals(); }
});

it.each([
  { gesture: "playhead", rounding: -.4 }, { gesture: "playhead", rounding: .4 },
  { gesture: "waveform", rounding: -.4 }, { gesture: "waveform", rounding: .4 },
])("reaches and retains source endpoints with $gesture drags (fractional width $rounding)", ({ gesture, rounding }) => {
  const view = render(<Harness />);
  const { scroller, canvas, width } = geometry(view.container);
  let actualLeft = 0;
  const realWidth = () => width() + rounding;
  Object.defineProperties(scroller, {
    scrollWidth: { configurable: true, get: () => Math.round(realWidth()) },
    scrollLeft: { configurable: true, get: () => actualLeft,
      set: (value: number) => { actualLeft = Math.max(0, Math.min(realWidth() - 1000, value)); } },
  });
  vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => ({ left: -actualLeft, width: realWidth() } as DOMRect));
  const playhead = screen.getByLabelText("Playhead indicator");
  const surface = gesture === "playhead" ? playhead : screen.getByLabelText("Waveform timeline");
  const audio = view.container.querySelector("audio")!;
  for (const slider of [100, 500, 1000]) {
    fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: String(slider) } });
    for (const end of [true, false]) {
      scroller.scrollLeft = end ? realWidth() - 1000 : 0;
      const releasedLeft = scroller.scrollLeft;
      const x = end ? 1001 : -1;
      fireEvent.pointerDown(surface, { button: 0, pointerId: 60, clientX: end ? 950 : 50 });
      fireEvent.pointerMove(surface, { pointerId: 60, clientX: x });
      const expected = end ? realWidth() : 0;
      expect(Number.parseFloat(playhead.style.transform.slice("translate3d(".length))).toBeCloseTo(expected, 6);
      expect(screen.getAllByText(end ? "00:01:40.000" : "00:00:00.000").length).toBeGreaterThan(0);
      fireEvent.pointerUp(surface, { pointerId: 60, clientX: x });
      fireEvent.timeUpdate(audio); fireEvent.seeked(audio);
      expect(Number.parseFloat(playhead.style.transform.slice("translate3d(".length))).toBeCloseTo(expected, 6);
      expect(scroller.scrollLeft).toBe(releasedLeft);
    }
  }
});

it("clears selection on plain empty waveform/subtitle clicks without inventing a nearest word", () => {
  const view = render(<Harness />); geometry(view.container);
  const wave = screen.getByLabelText("Waveform timeline");
  fireEvent.pointerDown(wave, { button: 0, pointerId: 1, clientX: 100 });
  fireEvent.pointerUp(wave, { button: 0, pointerId: 1, clientX: 100 });
  expect(screen.getByRole("button", { name: "Subtitle word one" })).toHaveAttribute("aria-pressed", "false");
  const word = screen.getByRole("button", { name: "Subtitle word one" });
  fireEvent.pointerDown(word, { button: 0 }); fireEvent.pointerUp(view.container.querySelector(".word-track")!);
  expect(word).toHaveAttribute("aria-pressed", "true");
  fireEvent.pointerDown(view.container.querySelector(".word-track")!, { button: 0, clientX: 500, clientY: 10 });
  expect(word).toHaveAttribute("aria-pressed", "false");
  expect(view.container.querySelector(".production-selection-range")).not.toBeInTheDocument();
});

it("focuses button and slider zoom on the current playhead, including zooming back out", () => {
  const view = render(<Harness />); const { scroller, width } = geometry(view.container);
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 60; fireEvent.timeUpdate(audio);
  fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
  expect(scroller.scrollLeft).toBe(700);
  fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "500" } });
  expect(scroller.scrollLeft).toBeCloseTo(Math.max(0, Math.min(width() - 1000, .6 * width() - 500)));
  fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "0" } });
  expect(scroller.scrollLeft).toBe(0);
});

it("auto-pans a held edge drag by 100px per second in a 1000px viewport and stops after release", () => {
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frames.push(cb); return frames.length; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    const view = render(<Harness />); const { scroller } = geometry(view.container);
    const audio = view.container.querySelector("audio")!;
    audio.currentTime = 50; fireEvent.timeUpdate(audio);
    fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
    scroller.scrollLeft = 500;
    const playhead = screen.getByLabelText("Playhead indicator");
    fireEvent.pointerDown(playhead, { button: 0, pointerId: 1, clientX: 925 });
    const before = scroller.scrollLeft;
    act(() => { frames.at(-1)?.(0); }); act(() => { frames.at(-1)?.(1000); });
    expect(scroller.scrollLeft - before).toBeCloseTo(100);
    expect(playhead.style.transform).toBe(`translate3d(${scroller.scrollLeft + 900}px, 0, 0)`);
    fireEvent.pointerUp(playhead, { button: 0, pointerId: 1, clientX: 925 });
    const stopped = scroller.scrollLeft; act(() => { frames.at(-1)?.(2000); });
    expect(scroller.scrollLeft).toBe(stopped);
    view.unmount();
  } finally { raf.mockRestore(); cancel.mockRestore(); }
});

it.each(["playhead", "waveform", "transport"])("paints the %s drag position before release, without waiting for media seek events", (gesture) => {
  const view = render(<Harness />); geometry(view.container);
  const playhead = screen.getByLabelText("Playhead indicator");
  const surface = gesture === "playhead" ? playhead : gesture === "waveform"
    ? screen.getByLabelText("Waveform timeline") : screen.getByLabelText("Thanh tiến trình Timeline — bấm hoặc kéo để tua");
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  fireEvent.pointerDown(surface, { button: 0, pointerId: 4, clientX: 200 });
  expect(playhead.style.transform).toBe("translate3d(200px, 0, 0)");
  fireEvent.pointerMove(surface, { button: 0, pointerId: 4, clientX: 450 });
  expect(playhead.style.transform).toBe("translate3d(450px, 0, 0)");
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 0;
  fireEvent.timeUpdate(audio);
  fireEvent.durationChange(audio);
  expect(playhead.style.transform).toBe("translate3d(450px, 0, 0)");
  expect(screen.getByText("00:00:45.000")).toBeInTheDocument();
  fireEvent.pointerUp(surface, { button: 0, pointerId: 4, clientX: 450 });
});

it.each([false, true])("keeps the zoomed waveform focused during overview transport drags (disjoint selection=%s)", (multiple) => {
  const selection = multiple ? { indexes: [], anchor: null, ranges: [{ id: "a", start: 10, end: 11 }, { id: "b", start: 80, end: 81 }] } : EMPTY_SELECTION;
  const change = vi.fn();
  const words = [{ text: "early", start: 20, end: 21 }, { text: "late", start: 85, end: 86 }];
  const view = render(<><ScriptEditor playbackAssetId="overview" value="early late" words={words} workflow="speech-to-text" onChange={vi.fn()} />
    <Timeline rangeSelectionEnabled gain={0} onGainChange={vi.fn()} wordSelection={selection} onWordSelectionChange={change}
      take={{ id: "overview", name: "overview.wav", duration: 100, url: "/audio.wav", words }} /></>);
  const { scroller } = geometry(view.container);
  fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
  const progress = screen.getByLabelText("Thanh tiến trình Timeline — bấm hoặc kéo để tua");
  vi.spyOn(progress, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  const playhead = screen.getByLabelText("Playhead indicator");
  fireEvent.pointerDown(progress, { button: 0, pointerId: 56, clientX: 850 });
  expect(screen.getByText("00:01:25.000")).toBeInTheDocument();
  expect(playhead.style.transform).toBe("translate3d(1700px, 0, 0)");
  expect(scroller.scrollLeft).toBe(1000);
  expect(screen.getByRole("button", { name: "Chọn từ late" })).toHaveClass("is-active");
  fireEvent.pointerMove(progress, { pointerId: 56, clientX: 200 });
  expect(playhead.style.transform).toBe("translate3d(400px, 0, 0)");
  expect(scroller.scrollLeft).toBe(300);
  expect(screen.getByRole("button", { name: "Chọn từ early" })).toHaveClass("is-active");
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 0; fireEvent.timeUpdate(audio);
  expect(scroller.scrollLeft).toBe(300);
  fireEvent.pointerUp(progress, { pointerId: 56, clientX: 200 });
  expect(scroller.scrollLeft).toBe(300);
  expect(change).not.toHaveBeenCalled();
});


it("resolves arbitrary speaker text against the word surface and responds to theme changes", async () => {
  document.documentElement.dataset.theme = "light";
  const speaker = { id: "s", name: "Pale speaker", color: "#caed70", language: "Tiếng Việt", languageId: "vi", region: "", age: null, gender: "female" as const, attributes: {}, createdAt: "" };
  try {
    render(<Timeline gain={0} onGainChange={vi.fn()} speakers={[speaker]} take={{ id: "color", name: "color", duration: 10, url: "/audio", words: [{ text: "readable", start: 1, end: 2, speakerId: "s" }] }} />);
    const word = screen.getByRole("button", { name: "Subtitle word readable" });
    expect(word.style.color).not.toBe("rgb(202, 237, 112)");
    await act(async () => { document.documentElement.dataset.theme = "dark"; });
    await waitFor(() => expect(word.style.color).toBe("rgb(202, 237, 112)"));
  } finally { delete document.documentElement.dataset.theme; }
});


it.each(["playhead", "waveform"]) ("locks the %s at 10/90 percent during edge panning and keeps the released viewport", (gesture) => {
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frames.push(cb); return frames.length; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    const view = render(<Harness />); const { scroller } = geometry(view.container);
    const audio = view.container.querySelector("audio")!;
    audio.currentTime = 50; fireEvent.timeUpdate(audio);
    fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
    const playhead = screen.getByLabelText("Playhead indicator");
    const surface = gesture === "playhead" ? playhead : screen.getByLabelText("Waveform timeline");
    for (const [pointer, safe, direction] of [[1250, 900, 1], [-250, 100, -1]]) {
      scroller.scrollLeft = 500;
      fireEvent.pointerDown(surface, { button: 0, pointerId: 9, clientX: 500 });
      fireEvent.pointerMove(surface, { button: 0, pointerId: 9, clientX: pointer });
      expect(playhead.style.transform).toBe(`translate3d(${500 + safe}px, 0, 0)`);
      act(() => { frames.at(-1)?.(0); }); act(() => { frames.at(-1)?.(1000); });
      expect(scroller.scrollLeft).toBe(500 + direction * 400);
      expect(playhead.style.transform).toBe(`translate3d(${scroller.scrollLeft + safe}px, 0, 0)`);
      const releasedScroll = scroller.scrollLeft, releasedTransform = playhead.style.transform;
      fireEvent.pointerUp(surface, { button: 0, pointerId: 9, clientX: pointer });
      fireEvent.timeUpdate(audio); fireEvent.seeked(audio);
      expect(scroller.scrollLeft).toBe(releasedScroll);
      expect(playhead.style.transform).toBe(releasedTransform);
      act(() => { frames.at(-1)?.(2000); });
      expect(scroller.scrollLeft).toBe(releasedScroll);
    }
    view.unmount();
  } finally { raf.mockRestore(); cancel.mockRestore(); }
});
