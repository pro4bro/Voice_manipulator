import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { VoiceScript } from "../script/VoiceScript";
import type { VoiceOutput } from "../../domain/types";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";

const output: VoiceOutput = { id: "out", name: "Dialogue", text: "one two", voiceId: "v", voiceName: "V", speakerProfileId: "s", engine: "omnivoice", generatorId: "g", parameters: {}, duration: 10, sampleRate: 24000, audioPath: "audio.wav", createdAt: "revision-1",
  words: [{ text: "one", start: 1, end: 2, segmentIndex: 0 }, { text: "two", start: 7, end: 8, segmentIndex: 1 }],
  segments: [{ rowId: "r1", text: "one", voiceId: "v", voiceName: "V", speakerProfileId: "s", engine: "omnivoice", generatorId: "g", start: 1, end: 2 }, { rowId: "r2", text: "two", voiceId: "v", voiceName: "V", speakerProfileId: "s", engine: "omnivoice", generatorId: "g", start: 7, end: 8 }] };

function Harness({ onReferenceContext }: { onReferenceContext?: Parameters<typeof Timeline>[0]["onReferenceContext"] } = {}) {
  const [selection, setSelection] = useState<WordSelection>(EMPTY_SELECTION);
  const voice = { id: "v", kind: "clone", speakerProfileId: "s", createdAt: "" } as const;
  return <><VoiceScript onReferenceContext={onReferenceContext} rows={[{ id: "r1", text: "one", voiceId: "v", speakerProfileId: "s" }, { id: "r2", text: "two", voiceId: "v", speakerProfileId: "s" }]} onRowsChange={vi.fn()} onRead={vi.fn()} category="clone" voices={[voice as never]} speakers={[]} output={output} playbackId="out" wordSelection={selection} onWordSelectionChange={setSelection} />
    <Timeline onReferenceContext={onReferenceContext} rangeSelectionEnabled gain={0} onGainChange={vi.fn()} take={{ id: output.id, name: output.name, duration: 10, url: "/out.wav", words: output.words }} wordSelection={selection} onWordSelectionChange={setSelection} />
    <output data-testid="selection">{JSON.stringify(selection)}</output></>;
}

it("uses one frozen multi-selection from Script, subtitles and waveform including keyboard context menus", () => {
  const context = vi.fn();
  const view = render(<Harness onReferenceContext={context} />);
  vi.spyOn(view.container.querySelector<HTMLElement>(".timeline-canvas")!, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  fireEvent.click(screen.getByRole("button", { name: "Chọn đoạn 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Chọn đoạn 2" }), { ctrlKey: true });
  fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn từ one" }));
  fireEvent.contextMenu(screen.getByRole("button", { name: "Subtitle word two" }));
  fireEvent.contextMenu(screen.getByLabelText("Waveform timeline"), { clientX: 150, clientY: 40 });
  fireEvent.keyDown(screen.getByRole("button", { name: "Subtitle word two" }), { key: "F10", shiftKey: true });
  expect(context.mock.calls.map(([request]) => request.origin)).toEqual(["script", "subtitle", "waveform", "subtitle"]);
  for (const [request] of context.mock.calls) expect(request.selection.ranges).toHaveLength(2);
  fireEvent.contextMenu(screen.getByLabelText("Waveform timeline"), { clientX: 450 });
  expect(context.mock.calls.at(-1)![0].selection.indexes).toEqual([]);
});

it("selects silence, adds a separated waveform range and synchronizes subtitle and Script highlights", () => {
  const view = render(<Harness />);
  const canvas = view.container.querySelector<HTMLElement>(".timeline-canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  const waveform = screen.getByLabelText("Waveform timeline");
  fireEvent.pointerDown(waveform, { button: 0, pointerId: 1, clientX: 20 });
  fireEvent.pointerMove(waveform, { button: 0, pointerId: 1, clientX: 70 });
  fireEvent.pointerUp(waveform, { button: 0, pointerId: 1, clientX: 70 });
  expect(screen.getByLabelText("Vùng chọn 0.200 đến 0.700 giây")).toHaveTextContent("DURATION 0.500s");
  fireEvent.pointerDown(waveform, { button: 0, pointerId: 2, clientX: 720, ctrlKey: true });
  fireEvent.pointerMove(waveform, { button: 0, pointerId: 2, clientX: 760, ctrlKey: true });
  fireEvent.pointerUp(waveform, { button: 0, pointerId: 2, clientX: 760, ctrlKey: true });
  expect(view.container.querySelectorAll(".production-selection-range")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Subtitle word two" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Chọn từ two" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Chọn từ one" })).toHaveAttribute("aria-pressed", "false");
});

it("mirrors Script row selection onto the waveform and preserves the source take", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Chọn đoạn 2" }));
  expect(screen.getByLabelText("Vùng chọn 7.000 đến 8.000 giây")).toHaveTextContent("START 7.000s");
  expect(screen.getByRole("button", { name: "Subtitle word two" })).toHaveAttribute("aria-pressed", "true");
  expect(output.audioPath).toBe("audio.wav");
});

it("does not scroll on separated multi-selection and cancels a waveform sweep back to its snapshot", () => {
  const view = render(<Harness />);
  const scroller = view.container.querySelector<HTMLElement>(".timeline-scroll")!;
  const canvas = view.container.querySelector<HTMLElement>(".timeline-canvas")!;
  Object.defineProperties(scroller, { clientWidth: { configurable: true, value: 100 }, scrollWidth: { configurable: true, value: 1000 } });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  fireEvent.click(screen.getByRole("button", { name: "Chọn đoạn 1" }));
  scroller.scrollLeft = 0;
  fireEvent.click(screen.getByRole("button", { name: "Chọn đoạn 2" }), { ctrlKey: true });
  expect(scroller.scrollLeft).toBe(0);
  expect(view.container.querySelectorAll(".production-selection-range")).toHaveLength(2);
  const before = screen.getByTestId("selection").textContent;
  const waveform = screen.getByLabelText("Waveform timeline");
  fireEvent.pointerDown(waveform, { button: 0, pointerId: 4, clientX: 30 });
  fireEvent.pointerMove(waveform, { button: 0, pointerId: 4, clientX: 60 });
  fireEvent.pointerCancel(waveform, { button: 0, pointerId: 4, clientX: 60 });
  expect(screen.getByTestId("selection").textContent).toBe(before);
});
