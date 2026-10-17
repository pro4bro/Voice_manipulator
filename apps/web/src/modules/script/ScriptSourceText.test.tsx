import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { ProjectMediaAsset } from "../../domain/types";
import type { WordSelection } from "../../domain/word-selection";
import { ScriptSourceText } from "./ScriptSourceText";

const source = { id: "a", name: "Track a", text: "Xin chào", words: [{ text: "Xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }], revisions: [] } as unknown as ProjectMediaAsset;
it("publishes selected native text words with the source asset revision", () => {
  const onWordSelectionChange = vi.fn();
  render(<ScriptSourceText source={{ ...source, updatedAt: "rev-a" }} onWordSelectionChange={onWordSelectionChange} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  editor.setSelectionRange(0, 3);
  fireEvent.select(editor);
  expect(onWordSelectionChange).toHaveBeenLastCalledWith({ indexes: [0], anchor: 0,
    scope: { kind: "asset", id: "a", revision: "rev-a" }, textRanges: [{ rowId: "a", start: 0, end: 3 }] });
});
it("retains the exact partial text range after the parent mirrors that selection", () => {
  function ControlledSourceText() {
    const [selection, setSelection] = useState<WordSelection>({ indexes: [], anchor: null });
    return <ScriptSourceText source={{ ...source, updatedAt: "rev-a" }} wordSelection={selection} onWordSelectionChange={setSelection} />;
  }
  render(<ControlledSourceText />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  editor.focus();
  editor.setSelectionRange(1, 3);
  fireEvent.select(editor);
  expect(editor.selectionStart).toBe(1);
  expect(editor.selectionEnd).toBe(3);
});
it("mirrors an in-scope selected word into native textarea text and ignores another asset scope", () => {
  const selection: WordSelection = { indexes: [1], anchor: 1,
    scope: { kind: "asset", id: "a", revision: "rev-a" } };
  const view = render(<ScriptSourceText source={{ ...source, updatedAt: "rev-a" }} wordSelection={selection} />);
  let editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  expect(editor.selectionStart).toBe(4);
  expect(editor.selectionEnd).toBe(8);
  view.rerender(<ScriptSourceText source={{ ...source, id: "b", updatedAt: "rev-b" }} wordSelection={selection} />);
  editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  expect(editor.selectionStart).toBe(4);
  expect(editor.selectionEnd).toBe(8);
});
it("preserves the focused textarea caret when an edit changes mapped word offsets", () => {
  const selection: WordSelection = { indexes: [1], anchor: 1,
    scope: { kind: "asset", id: "a", revision: "rev-a" } };
  render(<ScriptSourceText source={{ ...source, updatedAt: "rev-a" }} wordSelection={selection} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  editor.focus();
  editor.setSelectionRange(2, 2);
  fireEvent.change(editor, { target: { value: "X Xin chào" } });
  expect(editor.selectionStart).toBe(editor.selectionEnd);
  expect(editor.selectionStart).not.toBe(6);
});
it("does not mirror a disjoint word selection as one range across intervening text", () => {
  const multiword = { ...source, text: "Xin giữa chào", words: [
    { text: "Xin", start: 1, end: 2 }, { text: "giữa", start: 2.2, end: 2.8 }, { text: "chào", start: 3, end: 4 },
  ] } as unknown as ProjectMediaAsset;
  const selection: WordSelection = { indexes: [0, 2], anchor: 2,
    scope: { kind: "asset", id: "a", revision: "rev-a" } };
  render(<ScriptSourceText source={{ ...multiword, updatedAt: "rev-a" }} wordSelection={selection} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  expect(editor.selectionStart).toBe(0);
  expect(editor.selectionEnd).toBe(0);
});
it("edits the native text without changing neighboring timestamp identities", () => {
  const change = vi.fn();
  render(<ScriptSourceText source={source} onChange={change} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" });
  fireEvent.focus(editor);
  fireEvent.change(editor, { target: { value: "Chúc chào" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.blur(editor);
  expect(change).toHaveBeenCalledWith("a", [expect.objectContaining({ text: "Chúc", timingTrusted: false }), source.words[1]], "Chúc chào");
});
it("exposes AI candidates without applying them until the owner chooses a correction", () => {
  const change = vi.fn();
  render(<ScriptSourceText source={{ ...source, revisions: [{ id: "review", source: "ai", text: "Xin bạn", createdAt: "now" }] }} onChange={change} />);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTitle("Dùng phương án AI"));
  expect(change).toHaveBeenCalledWith("a", expect.arrayContaining([source.words[0], expect.objectContaining({ text: "bạn", timingTrusted: false })]), "Xin bạn");
});
it("keeping STT resolves a candidate without writing a replacement", () => {
  const change = vi.fn();
  render(<ScriptSourceText source={{ ...source, revisions: [{ id: "review", source: "ai", text: "Xin bạn", createdAt: "now" }] }} onChange={change} />);
  fireEvent.click(screen.getByTitle("Giữ kết quả Speech to Text"));
  expect(screen.queryByTitle("Dùng phương án AI")).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
