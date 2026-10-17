import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
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
    fireEvent.pointerDown(playhead, { button: 0, pointerId: 1, clientX: 950 });
    const before = scroller.scrollLeft;
    act(() => { frames.at(-1)?.(0); }); act(() => { frames.at(-1)?.(1000); });
    expect(scroller.scrollLeft - before).toBeCloseTo(100);
    fireEvent.pointerUp(playhead, { button: 0, pointerId: 1, clientX: 950 });
    const stopped = scroller.scrollLeft; act(() => { frames.at(-1)?.(2000); });
    expect(scroller.scrollLeft).toBe(stopped);
    view.unmount();
  } finally { raf.mockRestore(); cancel.mockRestore(); }
});
