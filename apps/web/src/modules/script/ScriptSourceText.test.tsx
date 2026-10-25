import { changeEditorText, editorSelection, editorText, selectEditorText } from "../../test/script-text";
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
  selectEditorText(editor, 0, 3);
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
  selectEditorText(editor, 1, 3);
  fireEvent.select(editor);
  expect(editorSelection(editor).start).toBe(1);
  expect(editorSelection(editor).end).toBe(3);
});
it("mirrors an in-scope selected word into native textarea text and ignores another asset scope", () => {
  const selection: WordSelection = { indexes: [1], anchor: 1,
    scope: { kind: "asset", id: "a", revision: "rev-a" } };
  const view = render(<ScriptSourceText source={{ ...source, updatedAt: "rev-a" }} wordSelection={selection} />);
  let editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  expect(editorSelection(editor).start).toBe(4);
  expect(editorSelection(editor).end).toBe(8);
  view.rerender(<ScriptSourceText source={{ ...source, id: "b", updatedAt: "rev-b" }} wordSelection={selection} />);
  editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  expect(editorSelection(editor).start).toBe(4);
  expect(editorSelection(editor).end).toBe(8);
});
it("preserves the focused textarea caret when an edit changes mapped word offsets", () => {
  const selection: WordSelection = { indexes: [1], anchor: 1,
    scope: { kind: "asset", id: "a", revision: "rev-a" } };
  render(<ScriptSourceText source={{ ...source, updatedAt: "rev-a" }} wordSelection={selection} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  editor.focus();
  selectEditorText(editor, 2, 2);
  changeEditorText(editor, "X Xin chào");
  expect(editorSelection(editor).start).toBe(editorSelection(editor).end);
  expect(editorSelection(editor).start).not.toBe(6);
});
it("does not mirror a disjoint word selection as one range across intervening text", () => {
  const multiword = { ...source, text: "Xin giữa chào", words: [
    { text: "Xin", start: 1, end: 2 }, { text: "giữa", start: 2.2, end: 2.8 }, { text: "chào", start: 3, end: 4 },
  ] } as unknown as ProjectMediaAsset;
  const selection: WordSelection = { indexes: [0, 2], anchor: 2,
    scope: { kind: "asset", id: "a", revision: "rev-a" } };
  render(<ScriptSourceText source={{ ...multiword, updatedAt: "rev-a" }} wordSelection={selection} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  expect(editorSelection(editor).start).toBe(0);
  expect(editorSelection(editor).end).toBe(0);
});
it("edits the native text without changing neighboring timestamp identities", () => {
  const change = vi.fn();
  render(<ScriptSourceText source={source} onChange={change} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" });
  fireEvent.focus(editor);
  changeEditorText(editor, "Chúc chào");
  expect(change).not.toHaveBeenCalled();
  fireEvent.blur(editor);
  expect(change).toHaveBeenCalledWith("a", [expect.objectContaining({ text: "Chúc", timingTrusted: false }), source.words[1]], "Chúc chào");
});
it("opens native-source word actions without hijacking ordinary textarea typing", () => {
  const change = vi.fn();
  render(<ScriptSourceText source={source} onChange={change} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" });
  selectEditorText(editor, 0, 3);
  fireEvent.contextMenu(editor, { clientX: 12, clientY: 16 });
  expect(screen.getByRole("menuitem", { name: "Add text" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Sửa text" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Xóa text" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Note" })).toBeInTheDocument();
  fireEvent.keyDown(editor, { key: "Delete" });
  expect(change).not.toHaveBeenCalled();
});
it("keeps the source word menu and Note open during an uncommitted edit and same-revision rerender", () => {
  const commit = vi.fn();
  function ControlledSourceText({ pulse }: { pulse: number }) {
    const [asset, setAsset] = useState({ ...source, updatedAt: "rev-a" });
    return <div data-render-pulse={pulse}><ScriptSourceText source={{ ...asset }} onChange={(id, words, text) => {
      commit(id, words, text);
      setAsset((current) => ({ ...current, words, text, updatedAt: "rev-b" }));
    }} /></div>;
  }
  const view = render(<ControlledSourceText pulse={0} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  editor.focus();
  changeEditorText(editor, "Xin bạn");
  selectEditorText(editor, 1, 1);
  fireEvent.contextMenu(editor, { clientX: 900, clientY: 700 });
  expect(screen.getByRole("menuitem", { name: "Note" })).toBeInTheDocument();
  view.rerender(<ControlledSourceText pulse={1} />);
  expect(screen.getByRole("menuitem", { name: "Note" })).toBeInTheDocument();
  fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "Note" }));
  expect(screen.getByRole("menu", { name: "Note — Script" })).toBeInTheDocument();
  expect(commit).not.toHaveBeenCalled();
  expect(editorText(screen.getByRole("textbox", { name: "Script transcript · Track a" }))).toBe("Xin bạn");
});
it("deletes the native source's selected word through Xóa text", () => {
  const change = vi.fn();
  render(<ScriptSourceText source={source} onChange={change} />);
  const editor = screen.getByRole("textbox", { name: "Script transcript · Track a" }) as HTMLTextAreaElement;
  selectEditorText(editor, 4, 8);
  fireEvent.contextMenu(editor, { clientX: 12, clientY: 16 });
  fireEvent.click(screen.getByRole("menuitem", { name: "Xóa text" }));
  expect(change).toHaveBeenCalledWith("a", [source.words[0]], "Xin");
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
