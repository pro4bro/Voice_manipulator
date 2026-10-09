import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { Timeline } from "./Timeline";
import type { TimelineEditState } from "../../domain/timeline-editing";
import { promoteTimestampWord } from "../../domain/timestamp-promotion";

const words = [{ text: "xin", start: 1, end: 2, timingSource: "dtw", timingTrusted: true }, { text: "chào", start: 3, end: 4, timingSource: "dtw", timingTrusted: true }];
const take = { id: "editing", name: "editing.wav", url: "/audio.wav", duration: 10, text: "xin chào", words };
function Editable() {
  const [state, setState] = useState<TimelineEditState>({ removedRanges: [], workingRange: null, cutPoints: [] });
  return <Timeline {...state} gain={0} onGainChange={() => undefined} onEditStateChange={setState} take={take} />;
}
function geometry(container: HTMLElement) {
  const canvas = container.querySelector(".timeline-canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, right: 1000, width: 1000, top: 0, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
}
describe("time-aware timeline editing", () => {
  it("routes undo/redo from hovered Timeline and flushes an inline subtitle edit first", () => {
    const undo = vi.fn(), redo = vi.fn(), change = vi.fn();
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} onUndo={undo} onRedo={redo} take={take} />);
    fireEvent.pointerEnter(container.querySelector(".timeline-module")!);
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Subtitle word xin" }));
    const input = screen.getByLabelText("Sửa subtitle");
    fireEvent.change(input, { target: { value: "mới" } });
    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(change).toHaveBeenCalledTimes(1); expect(redo).toHaveBeenCalledTimes(1);
    expect(change.mock.invocationCallOrder[0]).toBeLessThan(redo.mock.invocationCallOrder[0]);
  });
  it("assigns a promoted interval atomically without changing an untouched next word", () => {
    const change = vi.fn();
    const adjacent = { ...take, words: [{ ...words[0], end: 3 }, { ...words[1], start: 3.1, end: 4.1 }] };
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={adjacent} />);
    geometry(container); act(() => promoteTimestampWord("editing", 0));
    const waveform = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(waveform, { button: 1, clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(waveform, { buttons: 4, clientX: 250, pointerId: 1 });
    expect(screen.getByRole("button", { name: "Subtitle word chào" })).not.toHaveClass("is-timing-collision");
    fireEvent.pointerUp(waveform, { button: 1, clientX: 250, pointerId: 1 });
    expect(change.mock.calls[0][0][1]).toEqual(adjacent.words[1]);
  });
  it("undo cancels an uncommitted timing drag so pointer release cannot save its stale preview", () => {
    const undo = vi.fn(), change = vi.fn();
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} onUndo={undo} take={take} />);
    geometry(container); act(() => promoteTimestampWord("editing", 0));
    fireEvent.pointerEnter(container.querySelector(".timeline-module")!);
    const waveform = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(waveform, { button: 1, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(waveform, { buttons: 4, clientX: 900, pointerId: 1 });
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    fireEvent.pointerUp(waveform, { button: 1, clientX: 900, pointerId: 1 });
    expect(undo).toHaveBeenCalledTimes(1); expect(change).not.toHaveBeenCalled();
    expect(container.querySelector(".is-timing-collision")).not.toBeInTheDocument();
  });
  it("blinks the encroached neighbour during a promoted drag and retains ten percent on release", () => {
    const change = vi.fn(); const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={take} />);
    geometry(container); act(() => promoteTimestampWord("editing", 0));
    const waveform = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(waveform, { button: 1, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(waveform, { buttons: 4, clientX: 900, pointerId: 1 });
    expect(screen.getByRole("button", { name: "Subtitle word chào" })).toHaveClass("is-timing-collision");
    fireEvent.pointerUp(waveform, { button: 1, clientX: 900, pointerId: 1 });
    expect(change.mock.calls[0][0][1]).toMatchObject({ start: 3.9, end: 4 });
  });
  it("shows the promotion guidance after two seconds as a portal tooltip above the word", () => {
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} take={take} />);
    act(() => promoteTimestampWord("editing", 0));
    vi.useFakeTimers();
    try {
      const word = screen.getByRole("button", { name: "Subtitle word xin" });
      fireEvent.pointerEnter(word);
      act(() => { vi.advanceTimersByTime(1999); });
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByRole("tooltip")).toHaveTextContent("IN → OUT");
      expect(container.contains(screen.getByRole("tooltip"))).toBe(false);
      expect(container.querySelector(".timeline-promotion-status")).not.toBeInTheDocument();
      fireEvent.pointerLeave(word);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("marks a work region, cuts at playhead and deletes/restores selected sections", () => {
    const { container } = render(<Editable />);
    const audio = container.querySelector("audio")!;
    audio.currentTime = 2; fireEvent.timeUpdate(audio); fireEvent.click(screen.getByText("MARK IN"));
    audio.currentTime = 8; fireEvent.timeUpdate(audio); fireEvent.click(screen.getByText("MARK OUT"));
    expect(screen.getByLabelText("Đoạn đã loại 0.00 đến 2.00 giây")).toBeInTheDocument();
    audio.currentTime = 5; fireEvent.timeUpdate(audio); fireEvent.click(screen.getByText("CUT"));
    fireEvent.click(screen.getByLabelText("Đoạn footage 0.00 đến 5.00"));
    fireEvent.click(screen.getByText("DELETE"));
    expect(screen.getByLabelText("Đoạn đã loại 0.00 đến 5.00 giây")).toBeInTheDocument();
    fireEvent.click(screen.getByText("UNCUT"));
    expect(screen.getByLabelText("Đoạn đã loại 0.00 đến 2.00 giây")).toBeInTheDocument();
  });
  it("doubleclicks a subtitle to edit without changing the module view", () => {
    const change = vi.fn(); render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={take} />);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Subtitle word xin" }));
    fireEvent.change(screen.getByLabelText("Sửa subtitle"), { target: { value: "xin mới" } });
    fireEvent.keyDown(screen.getByLabelText("Sửa subtitle"), { key: "Enter" });
    expect(change.mock.calls[0][1]).toBe("xin mới chào");
    expect(change.mock.calls[0][0].some((word: { timingSource?: string }) => word.timingSource === "user-interpolated")).toBe(true);
  });
  it("audibly previews a promoted word IN/OUT on middle drag and advances to the next word", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const change = vi.fn(); const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={take} />);
    geometry(container);
    act(() => promoteTimestampWord("editing", 0));
    const waveform = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(waveform, { button: 1, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(waveform, { buttons: 4, clientX: 250, pointerId: 1 });
    expect(play).toHaveBeenCalled();
    fireEvent.pointerUp(waveform, { button: 1, clientX: 250, pointerId: 1 });
    expect(change).toHaveBeenCalled();
    expect(change.mock.calls[0][0][0]).toMatchObject({ start: 1, end: 2.5, timingSource: "manual" });
    expect(screen.getByRole("button", { name: "Subtitle word chào" })).toHaveClass("is-promoted");
    fireEvent.pointerDown(waveform, { button: 0, clientX: 300, pointerId: 1 });
    expect(container.querySelector(".is-promoted")).not.toBeInTheDocument();
  });
  it("deletes selected subtitle text and its word interval together", () => {
    const change = vi.fn(); render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={take} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Subtitle word xin" }), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Xóa text đã chọn" }));
    expect(change.mock.calls[0][1].trim()).toBe("chào");
    expect(change.mock.calls[0][0]).toEqual([words[1]]);
  });
  it("deletes a bulk selection with bounded document work and one commit", () => {
    const longWords = Array.from({ length: 6000 }, (_, index) => ({ text: `word${index}`, start: index * .3, end: index * .3 + .28, timingTrusted: true }));
    const indexes = Array.from({ length: 20 }, (_, index) => index);
    const change = vi.fn();
    const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change}
      wordSelection={{ indexes, anchor: 0 }} take={{ ...take, text: longWords.map((word) => word.text).join(" "), words: longWords, duration: 1800 }} />);
    fireEvent.contextMenu(container.querySelector('[data-timeline-word-index="0"]')!, { clientX: 10, clientY: 10 });
    const normalize = String.prototype.normalize;
    let normalizedTokens = 0;
    String.prototype.normalize = function (form) { normalizedTokens += 1; return normalize.call(this, form); };
    const started = performance.now();
    try {
      fireEvent.click(screen.getByRole("menuitem", { name: "Xóa text đã chọn" }));
      const elapsed = performance.now() - started;
      console.info(`bulk subtitle deletion: ${elapsed.toFixed(1)}ms, ${normalizedTokens} normalized tokens`);
      expect(change).toHaveBeenCalledTimes(1);
      expect(change.mock.calls[0][0]).toHaveLength(longWords.length - indexes.length);
      expect(change.mock.calls[0][0][0]).toBe(longWords[20]);
      expect(change.mock.calls[0][1]).toBe(longWords.slice(20).map((word) => word.text).join(" "));
      expect(normalizedTokens).toBeLessThanOrEqual(longWords.length * 3);
    } finally { String.prototype.normalize = normalize; }
  });
  it("discards Escape edits and prevents a later blur from committing them", () => {
    const change = vi.fn(); render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={take} />);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Subtitle word xin" }));
    const input = screen.getByLabelText("Sửa subtitle");
    fireEvent.change(input, { target: { value: "discard me" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(change).not.toHaveBeenCalled();
  });
  it("inserts text at the Ctrl-click source time and leaves it promoted for alignment", () => {
    const change = vi.fn(); const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={take} />);
    geometry(container);
    fireEvent.pointerDown(container.querySelector(".word-track")!, { button: 0, ctrlKey: true, clientX: 250 });
    const input = screen.getByLabelText("Sửa subtitle");
    fireEvent.change(input, { target: { value: "mới" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][1]).toBe("xin mới chào");
    expect(change.mock.calls[0][0][1]).toMatchObject({ text: "mới", start: 2.5, timingTrusted: false });
    expect(container.querySelector(".timeline-promotion-status")).not.toBeInTheDocument();
  });
  it("Escape aborts promoted drag without assigning timestamps", () => {
    const change = vi.fn(); const { container } = render(<Timeline gain={0} onGainChange={() => undefined} onWordsChange={change} take={take} />);
    geometry(container); act(() => promoteTimestampWord("editing", 0));
    const waveform = screen.getByLabelText("Waveform timeline");
    fireEvent.pointerDown(waveform, { button: 1, clientX: 100, pointerId: 1 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerMove(waveform, { buttons: 4, clientX: 250, pointerId: 1 });
    fireEvent.pointerUp(waveform, { button: 1, clientX: 250, pointerId: 1 });
    expect(change).not.toHaveBeenCalled();
  });
});
