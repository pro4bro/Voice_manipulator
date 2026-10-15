import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StretchHandles } from "./StretchHandles";
import type { VoiceEditController } from "../../domain/voice-edits";

afterEach(() => vi.useRealTimers());
function setup() {
  const controller: VoiceEditController = { packet: { document: { revision: 0, cursor: 0, sampleRate: 24000, sourceFrames: 240000, operations: [], outputId: "o" }, duration: 10, audioUrl: "/audio", output: {} as never },
    busy: false, error: null, preview: vi.fn(async () => true), commit: vi.fn(async () => true), cancel: vi.fn(), history: vi.fn(async () => true) };
  const selection = { indexes: [0], anchor: 0, ranges: [{ id: "a", start: 2, end: 4 }, { id: "b", start: 7, end: 8 }] };
  const onSelectionChange = vi.fn(), onSuspend = vi.fn(), onRevert = vi.fn();
  render(<StretchHandles controller={controller} ranges={selection.ranges} selection={selection} onSelectionChange={onSelectionChange} duration={10} canvasWidth={1000} onSuspend={onSuspend} onRevert={onRevert} />);
  return { controller, onSelectionChange, onSuspend, onRevert };
}

it("requires Ctrl, commits active block once and maps disjoint downstream selection", async () => {
  const { controller, onSelectionChange } = setup();
  const handle = screen.getByRole("button", { name: "Giãn vùng a từ cuối" });
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  expect(controller.commit).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { button: 0, ctrlKey: true, pointerId: 2, clientX: 400 });
  fireEvent.pointerMove(window, { pointerId: 2, clientX: 500 });
  await act(async () => { fireEvent.pointerUp(window, { pointerId: 2 }); });
  expect(controller.commit).toHaveBeenCalledTimes(1);
  expect(controller.commit).toHaveBeenCalledWith({ startFrame: 48000, endFrame: 96000, targetFrames: 72000, edge: "right" });
  expect(onSelectionChange.mock.calls.at(-1)?.[0].ranges).toEqual([{ id: "a", start: 2, end: 5 }, { id: "b", start: 8, end: 9 }]);
});

it("Escape cancels preview without committing a history transaction", () => {
  vi.useFakeTimers();
  const { controller, onSuspend, onRevert } = setup();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Giãn vùng a từ đầu" }), { button: 0, ctrlKey: true, pointerId: 1, clientX: 200 });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 100 });
  fireEvent.keyDown(window, { key: "Escape" });
  act(() => vi.runAllTimers());
  expect(onSuspend).toHaveBeenCalledOnce();
  expect(controller.cancel).toHaveBeenCalled();
  expect(onRevert).toHaveBeenCalledOnce();
  expect(controller.preview).not.toHaveBeenCalled();
  expect(controller.commit).not.toHaveBeenCalled();
});
