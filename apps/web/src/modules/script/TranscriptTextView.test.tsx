import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { SpeakerProfile, StudioWord } from "../../domain/types";
import { editorSelection, editorText, selectEditorText } from "../../test/script-text";
import { selectScriptText } from "./ScriptTextView";
import { transcriptTextTurns, TranscriptTextView } from "./TranscriptTextView";

const speakers = [{ id: "a", name: "An" }, { id: "b", name: "Bình" }] as SpeakerProfile[];
const words: StudioWord[] = [
  { text: "Xin", speakerId: "a", start: 0, end: 1 },
  { text: "chào", speakerId: "a", start: 1, end: 2 },
  { text: "BẠN", speakerId: "b", start: 3, end: 4 },
  { text: "về", speakerId: "a", start: 5, end: 6 },
];
const value = "Xin\n chào BẠN\n\nvề";

it("projects exact transcript characters into A/B/A turns, and keeps unrecognized multiline input in one turn", () => {
  const turns = transcriptTextTurns(value, words, speakers, null);
  expect(turns.map((turn) => [turn.label, turn.text])).toEqual([["An", "Xin\n chào "], ["Bình", "BẠN\n\n"], ["An", "về"]]);
  expect(turns.map((turn) => turn.text).join("")).toBe(value);
  expect(transcriptTextTurns("one\ntwo\n\nthree", [], speakers, "a")).toMatchObject([{ text: "one\ntwo\n\nthree", label: "An" }]);
});

it("keeps turn identities and adjacent text through first-word replacement, Alt+Enter, and local Undo/Redo", () => {
  const changed = vi.fn();
  function Editor() {
    const [text, setText] = useState(value);
    return <TranscriptTextView value={text} words={words.map((word) => ({ ...word }))} speakers={speakers.map((speaker) => ({ ...speaker }))} onChange={(next) => { changed(next); setText(next); }} />;
  }
  render(<Editor />);
  const root = screen.getByRole("textbox", { name: "Script transcript" });
  const row = root.querySelector<HTMLElement>("[data-script-text-dialogue]")!;
  const id = row.dataset.rowId!;
  selectEditorText(root, 0, 3);
  fireEvent.paste(root, { clipboardData: { getData: () => "Chúc" } });
  expect(editorText(root)).toBe("Chúc\n chào BẠN\n\nvề");
  expect(root.querySelectorAll("[data-script-text-dialogue]")).toHaveLength(3);
  expect(root.querySelector("[data-script-text-dialogue]")).toBe(row);
  expect(row.dataset.rowId).toBe(id);
  fireEvent.keyDown(root, { key: "Enter", altKey: true });
  expect(editorText(root)).toBe("Chúc\n\n chào BẠN\n\nvề");
  fireEvent.keyDown(root, { key: "z", ctrlKey: true });
  expect(editorText(root)).toBe("Chúc\n chào BẠN\n\nvề");
  fireEvent.keyDown(root, { key: "z", ctrlKey: true });
  expect(editorText(root)).toBe(value);
  fireEvent.keyDown(root, { key: "z", ctrlKey: true, shiftKey: true });
  expect(changed).toHaveBeenLastCalledWith("Chúc\n chào BẠN\n\nvề");
});

it("uses the shared serializer for dialogue-only, speaker-only, and combined selections", () => {
  render(<TranscriptTextView value="Xin BẠN" words={[words[0], words[2]]} speakers={speakers} onChange={vi.fn()} />);
  const root = screen.getByRole("textbox", { name: "Script transcript" });
  const labels = [...root.querySelectorAll<HTMLElement>("[data-script-text-speaker]")];
  const cells = [...root.querySelectorAll<HTMLElement>("[data-script-text-dialogue]")];
  const setData = vi.fn();
  selectEditorText(root, 0, 7);
  fireEvent.copy(root, { clipboardData: { setData } });
  expect(setData).toHaveBeenLastCalledWith("text/plain", "Xin \nBẠN");
  const selection = window.getSelection()!;
  selection.setBaseAndExtent(labels[0].firstChild!, 0, labels[1].lastChild!, labels[1].lastChild!.textContent!.length);
  fireEvent.copy(root, { clipboardData: { setData } });
  expect(setData).toHaveBeenLastCalledWith("text/plain", "An:\nBình:");
  selection.setBaseAndExtent(labels[0].firstChild!, 0, cells[1].firstChild!, 3);
  fireEvent.copy(root, { clipboardData: { setData } });
  expect(setData).toHaveBeenLastCalledWith("text/plain", "An: Xin \nBình: BẠN");
});

it("paints the playback word without changing selection, focus, or publishing a Script selection", () => {
  const highlights = new Map<string, Set<Range>>();
  Object.defineProperty(CSS, "highlights", { configurable: true, value: highlights });
  vi.stubGlobal("Highlight", class extends Set<Range> { constructor(...ranges: Range[]) { super(ranges); } });
  try {
    const onRangeChange = vi.fn();
    const props = { value, words, speakers, onChange: vi.fn(), onRangeChange, assetId: "a" };
    const view = render(<TranscriptTextView {...props} activeWordIndex={0} />);
    const root = screen.getByRole("textbox", { name: "Script transcript" });
    selectEditorText(root, 1, 3);
    const focus = document.activeElement;
    onRangeChange.mockClear();
    view.rerender(<TranscriptTextView {...props} activeWordIndex={2} />);
    expect(editorSelection(root)).toEqual({ start: 1, end: 3 });
    expect(document.activeElement).toBe(focus);
    expect(onRangeChange).not.toHaveBeenCalled();
    expect([...highlights.values()].flatMap((ranges) => [...ranges]).map(String)).toEqual(["BẠN"]);
    expect(root.querySelector("[data-playback-active]")).toHaveTextContent("BẠN");
    act(() => selectScriptText(root, root.querySelector<HTMLElement>("[data-script-text-dialogue]")!.dataset.rowId!, 0, 0));
    view.unmount();
    expect(highlights.size).toBe(0);
  } finally { Reflect.deleteProperty(CSS, "highlights"); vi.unstubAllGlobals(); }
});
