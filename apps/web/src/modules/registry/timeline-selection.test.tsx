import { selectEditorText } from "../../test/script-text";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { ModuleRegistry, type StudioContext } from "./ModuleRegistry";

const words = [{ text: "một", start: 2, end: 2.5 }, { text: "hai", start: 4, end: 4.5 }];
function Harness() {
  const [selection, onWordSelectionChange] = useState<WordSelection>(EMPTY_SELECTION);
  const context = { workflow: "speech-to-text", selectedAssetId: "a", mediaAssets: [{ id: "a", name: "a.wav", words, duration: 10, text: "một hai" }],
    take: { id: "a", name: "a.wav", words, duration: 10, url: "/a/audio" }, script: "một hai", gain: 0,
    trainingCatalog: { speakers: [], environmentProfiles: [] }, wordSelection: selection, onWordSelectionChange,
    onScriptChange: vi.fn(), onWordsChange: vi.fn(), onGainChange: vi.fn(), onScriptUndo: vi.fn(), onScriptRedo: vi.fn() } as unknown as StudioContext;
  return <><ModuleRegistry id="script" context={context} /><ModuleRegistry id="timeline" context={context} /></>;
}

it("routes ordinary STT Script and subtitle selections to waveform timing overlays", () => {
  const view = render(<Harness />);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Subtitle word một" }), { button: 0 });
  fireEvent.pointerUp(view.container.querySelector(".word-track")!);
  expect(screen.getByLabelText("Vùng chọn 2.000 đến 2.500 giây")).toContainElement(screen.getByLabelText("Duration 0.500 seconds"));
  expect(screen.getByRole("button", { name: "Chọn từ một" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
  const text = screen.getByRole("textbox", { name: "Script transcript" }) as HTMLTextAreaElement;
  selectEditorText(text, 4, 7); fireEvent.select(text);
  expect(screen.getByLabelText("Vùng chọn 4.000 đến 4.500 giây")).toContainElement(screen.getByLabelText("IN 4.000 seconds"));
  expect(screen.getByRole("button", { name: "Subtitle word hai" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Subtitle word một" })).toHaveAttribute("aria-pressed", "false");
  selectEditorText(text, 7, 7); fireEvent.select(text);
  expect(screen.queryByLabelText("Vùng chọn 4.000 đến 4.500 giây")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Subtitle word hai" })).toHaveAttribute("aria-pressed", "false");
});

it("uses Ctrl-left drag on STT waveform and keeps plain drag as a seek", () => {
  const view = render(<Harness />);
  vi.spyOn(view.container.querySelector(".timeline-canvas")!, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  const wave = screen.getByLabelText("Waveform timeline");
  fireEvent.pointerDown(wave, { button: 0, pointerId: 1, clientX: 200, ctrlKey: true });
  fireEvent.pointerMove(wave, { pointerId: 1, clientX: 250, ctrlKey: true });
  fireEvent.pointerUp(wave, { pointerId: 1, clientX: 250, ctrlKey: true });
  expect(screen.getByLabelText("Vùng chọn 2.000 đến 2.500 giây")).toContainElement(screen.getByLabelText("OUT 2.500 seconds"));
  fireEvent.pointerDown(wave, { button: 0, pointerId: 2, clientX: 400 });
  fireEvent.pointerMove(wave, { pointerId: 2, clientX: 450 });
  fireEvent.pointerUp(wave, { pointerId: 2, clientX: 450 });
  expect(view.container.querySelector("audio")!.currentTime).toBe(4.5);
  expect(screen.queryByLabelText("Vùng chọn 2.000 đến 2.500 giây")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Vùng chọn 4.000 đến 4.500 giây")).not.toBeInTheDocument();
});

it("defers Ctrl subtitle insertion until click release, and selects a drag without editing", () => {
  const view = render(<Harness />);
  vi.spyOn(view.container.querySelector(".timeline-canvas")!, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  const track = view.container.querySelector(".word-track")!;
  fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: 200, ctrlKey: true });
  expect(screen.queryByRole("textbox", { name: "Sửa subtitle" })).not.toBeInTheDocument();
  fireEvent.pointerMove(track, { pointerId: 1, clientX: 250, ctrlKey: true });
  fireEvent.pointerUp(track, { pointerId: 1, clientX: 250, ctrlKey: true });
  expect(screen.getByLabelText("Vùng chọn 2.000 đến 2.500 giây")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Sửa subtitle" })).not.toBeInTheDocument();
  fireEvent.pointerDown(track, { button: 0, pointerId: 2, clientX: 600, ctrlKey: true });
  fireEvent.pointerUp(track, { pointerId: 2, clientX: 600, ctrlKey: true });
  expect(screen.getByRole("textbox", { name: "Sửa subtitle" })).toBeInTheDocument();
});
