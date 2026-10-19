import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { Timeline, type ActiveTake } from "./Timeline";
import type { WordSelection } from "../../domain/word-selection";
import { promoteTimestampWord } from "../../domain/timestamp-promotion";
import type { StudioWord } from "../../domain/types";

const initial: ActiveTake = { id: "feedback", name: "feedback", duration: 100, url: "/feedback.wav", text: "one two",
  words: [{ text: "one", start: 20, end: 21, speakerId: "s", diarizationSpeakerId: "speaker-2" }, { text: "two", start: 70, end: 71, speakerId: "s" }] };
const speaker = { id: "s", name: "Speaker", color: "#caed70", language: "Tiếng Việt", languageId: "vi", region: "", age: null, gender: "female" as const, attributes: {}, createdAt: "" };

it("keeps assigned/inherited speaker underlines on ordinary timing-edited words before, during and after playback", () => {
  const words: StudioWord[] = [{ text: "assigned", start: 1, end: 2, speakerId: "s", timingSource: "manual" },
    { text: "inherited", start: 3, end: 4 }, { text: "unassigned", start: 5, end: 6, speakerId: null }];
  const view = render(<Timeline gain={0} onGainChange={vi.fn()} defaultSpeakerId="s" speakers={[speaker]}
    take={{ id: "speaker-cue", name: "cue", url: "/cue.wav", duration: 10, words }} />);
  const audio = view.container.querySelector("audio")!;
  for (const time of [0, 1.5, 8]) {
    audio.currentTime = time; fireEvent.timeUpdate(audio);
    for (const word of ["assigned", "inherited"]) expect(screen.getByRole("button", { name: `Subtitle word ${word}` }).style.getPropertyValue("--subtitle-speaker-underline")).toBe(speaker.color);
    expect(screen.getByRole("button", { name: "Subtitle word unassigned" }).style.getPropertyValue("--subtitle-speaker-underline")).toBe("");
  }
});
function Harness({ changed = vi.fn() }: { changed?: (words: StudioWord[]) => void }) {
  const [take, setTake] = useState(initial);
  const [selection, setSelection] = useState<WordSelection>({ indexes: [0], anchor: 0, ranges: [{ id: "chosen", start: 20, end: 21 }] });
  return <Timeline rangeSelectionEnabled gain={0} onGainChange={vi.fn()} speakers={[speaker]} take={take} wordSelection={selection} onWordSelectionChange={setSelection}
    onWordsChange={(words, text) => { changed(words); setTake({ ...take, words, text: text ?? take.text }); }} />;
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

it.each(["commit", "cancel"])("moves the explicit selection highlight/readout with the subtitle draft: %s", (kind) => {
  const changed = vi.fn(); const view = render(<Harness changed={changed} />); geometry(view.container);
  fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
  const word = screen.getByRole("button", { name: "Subtitle word one" });
  fireEvent.pointerDown(word, { button: 1, pointerId: 1, clientX: 400 });
  fireEvent.pointerMove(word, { buttons: 4, pointerId: 1, clientX: 500 });
  expect(screen.getByLabelText("Vùng chọn 25.000 đến 26.000 giây")).toBeInTheDocument();
  expect(screen.getByLabelText("IN 25.000 seconds")).toBeInTheDocument();
  if (kind === "cancel") {
    fireEvent.pointerCancel(word, { button: 1, pointerId: 1, clientX: 500 });
    expect(screen.getByLabelText("Vùng chọn 20.000 đến 21.000 giây")).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  } else {
    fireEvent.pointerUp(word, { button: 1, pointerId: 1, clientX: 500 });
    expect(screen.getByLabelText("Vùng chọn 25.000 đến 26.000 giây")).toBeInTheDocument();
    expect(changed).toHaveBeenCalledTimes(1);
  }
});

it("inherits the insertion row's speaker identity as an underline on new manual subtitle text", () => {
  const changed = vi.fn(); const view = render(<Harness changed={changed} />); geometry(view.container);
  fireEvent.doubleClick(view.container.querySelector(".word-track")!, { clientX: 230 });
  const input = screen.getByLabelText("Sửa subtitle");
  fireEvent.change(input, { target: { value: "new" } }); fireEvent.keyDown(input, { key: "Enter" });
  expect(changed.mock.calls[0][0][1]).toMatchObject({ speakerId: "s", diarizationSpeakerId: "speaker-2", reviewState: "manual", timingTrusted: false });
  const added = screen.getByRole("button", { name: "Subtitle word new" });
  expect(added.style.backgroundColor).not.toBe("rgb(202, 237, 112)");
  expect(added.style.getPropertyValue("--subtitle-speaker-underline")).toBe("#caed70");
  expect(added).toHaveClass("timeline-word--manual");
});

it("uses the footage's default speaker underline when a new word inherits its row, respecting explicit unassignment", () => {
  const props = { gain: 0, onGainChange: vi.fn(), defaultSpeakerId: "s", speakers: [speaker] };
  const take: ActiveTake = { ...initial, words: [{ text: "new", start: 1, end: 2, reviewState: "manual", timingTrusted: false }] };
  const view = render(<Timeline {...props} take={take} />);
  const added = screen.getByRole("button", { name: "Subtitle word new" });
  expect(added.style.backgroundColor).not.toBe("rgb(202, 237, 112)");
  expect(added.style.getPropertyValue("--subtitle-speaker-underline")).toBe("#caed70");
  view.rerender(<Timeline {...props} take={{ ...take, words: [{ ...take.words![0], speakerId: null }] }} />);
  const unassigned = screen.getByRole("button", { name: "Subtitle word new" });
  expect(unassigned.style.getPropertyValue("--subtitle-speaker-underline")).toBe("");
  expect(unassigned.style.backgroundColor).not.toBe("rgb(202, 237, 112)");
});

it.each([{ direction: 0, zoom: 1 }, { direction: 1, zoom: 1 }, { direction: 0, zoom: 2 }, { direction: 1, zoom: 2 }])("edge-pans promoted timing outside the view at 40 percent viewport/s: %j", ({ direction, zoom }) => {
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => { frames.push(frame); return frames.length; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    const view = render(<Harness />); const { scroller } = geometry(view.container);
    for (let step = 0; step < zoom; step++) fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" }));
    scroller.scrollLeft = 500;
    act(() => promoteTimestampWord("feedback", 0));
    const wave = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(wave, { button: 1, pointerId: 5, clientX: 500 });
    const pointer = direction ? 1250 : -250;
    fireEvent.pointerMove(wave, { buttons: 4, pointerId: 5, clientX: pointer });
    expect(scroller.scrollLeft).toBe(500);
    act(() => frames.at(-1)?.(0)); act(() => frames.at(-1)?.(1000));
    expect(scroller.scrollLeft).toBe(direction ? 900 : 100);
    const playhead = screen.getByLabelText("Playhead indicator");
    expect(playhead.style.transform).toBe(`translate3d(${scroller.scrollLeft + (direction ? 900 : 100)}px, 0, 0)`);
    const releasedScroll = scroller.scrollLeft, releasedPlayhead = playhead.style.transform;
    fireEvent.pointerUp(wave, { button: 1, pointerId: 5, clientX: pointer });
    fireEvent.timeUpdate(view.container.querySelector("audio")!);
    expect(scroller.scrollLeft).toBe(releasedScroll);
    expect(playhead.style.transform).toBe(releasedPlayhead);
    act(() => frames.at(-1)?.(2000)); expect(scroller.scrollLeft).toBe(releasedScroll);
  } finally { raf.mockRestore(); cancel.mockRestore(); }
});

it.each(["pointercancel", "Escape", "blur"])("discards the promoted timing draft and stops edge panning on %s", (kind) => {
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => { frames.push(frame); return frames.length; });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    const changed = vi.fn(); const view = render(<Harness changed={changed} />); const { scroller } = geometry(view.container);
    fireEvent.click(screen.getByRole("button", { name: "Phóng to timeline" })); scroller.scrollLeft = 500;
    act(() => promoteTimestampWord("feedback", 0));
    const wave = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(wave, { button: 1, pointerId: 8, clientX: 500 });
    fireEvent.pointerMove(wave, { buttons: 4, pointerId: 8, clientX: 950 });
    act(() => frames.at(-1)?.(0)); act(() => frames.at(-1)?.(1000));
    if (kind === "pointercancel") fireEvent.pointerCancel(wave, { pointerId: 8, clientX: 950 });
    else if (kind === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else fireEvent.blur(window);
    const stopped = scroller.scrollLeft;
    act(() => frames.at(-1)?.(2000));
    fireEvent.pointerUp(wave, { button: 1, pointerId: 8, clientX: 950 });
    expect(changed).not.toHaveBeenCalled(); expect(scroller.scrollLeft).toBe(stopped);
    expect(screen.getByLabelText("Vùng chọn 20.000 đến 21.000 giây")).toBeInTheDocument();
  } finally { raf.mockRestore(); cancel.mockRestore(); }
});
