import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { ScriptEditor } from "./ScriptEditor";
import { Timeline } from "../timeline/Timeline";
import type { StudioWord } from "../../domain/types";
import type { WordSelection } from "../../domain/word-selection";
import { reconcileScriptTextEdit, replaceScriptWord } from "./script-text-reconciliation";

const words = [{ text: "one", start: 2, end: 2.4 }, { text: "two", start: 8, end: 8.4 }];
const speaker = { id: "s", name: "Lan", color: "#caed70", language: "vi", languageId: "vi", region: "", age: null, gender: "female" as const, attributes: {}, createdAt: "" };
function Editor({ mode, changed, reference = vi.fn() }: { mode: "script" | "subtitle"; changed: (words: StudioWord[], text?: string) => void; reference?: Parameters<typeof Timeline>[0]["onReferenceContext"] }) {
  const [selection, setSelection] = useState<WordSelection>({ indexes: [0], anchor: 0 });
  return mode === "script" ? <ScriptEditor value="one two" onChange={vi.fn()} workflow="speech-to-text" words={words} speakers={[speaker]}
    onWordsChange={changed} wordSelection={selection} onWordSelectionChange={setSelection} />
    : <Timeline gain={0} onGainChange={vi.fn()} take={{ id: "words", name: "words", duration: 10, text: "one two", words }} speakers={[speaker]}
      rangeSelectionEnabled onReferenceContext={reference} onWordsChange={changed} wordSelection={selection} onWordSelectionChange={setSelection} />;
}

it.each(["script", "subtitle"] as const)("offers Add/Edit/Delete and profile assignment from %s word context menu", (mode) => {
  render(<Editor mode={mode} changed={vi.fn()} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: mode === "script" ? "Chọn từ one" : "Subtitle word one" }));
  expect(screen.getByRole("menuitem", { name: "Add text" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Sửa text" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Xóa text/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Lan" })).toBeInTheDocument();
});

it.each(["script", "subtitle"] as const)("Delete removes the selected %s word with its timing in one commit", (mode) => {
  const changed = vi.fn(); render(<Editor mode={mode} changed={changed} />);
  fireEvent.keyDown(screen.getByRole("button", { name: mode === "script" ? "Chọn từ one" : "Subtitle word one" }), { key: "Delete" });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0]).toEqual([words[1]]);
  expect(changed.mock.calls[0][1].trim()).toBe("two");
});

it.each(["renamed", "first second"])("keeps an explicitly edited word's full IN/OUT while changing it to %s", (replacement) => {
  const edit = replaceScriptWord("one two", 0, replacement, words);
  const count = replacement.split(" ").length;
  expect(edit.words[0].start).toBe(2);
  expect(edit.words[count - 1].end).toBe(2.4);
  expect(edit.words[count]).toBe(words[1]);
});

it("keeps a one-word native Script replacement inside its original sparse interval", () => {
  const edit = reconcileScriptTextEdit("one two", "renamed two", words);
  expect(edit.words[0]).toMatchObject({ text: "renamed", start: 2, end: 2.4 });
  expect(edit.words[1]).toBe(words[1]);
});

it("adds text through the Script table menu and keeps Delete native inside its input", () => {
  const changed = vi.fn(); render(<Editor mode="script" changed={changed} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn từ one" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add text" }));
  const input = screen.getByRole("textbox", { name: "Thêm text" });
  fireEvent.change(input, { target: { value: "new" } });
  fireEvent.keyDown(input, { key: "Delete" });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole("form", { name: "Thêm text sau one" }));
  expect(changed).toHaveBeenCalledTimes(1);
  const result = changed.mock.calls[0][0] as StudioWord[];
  expect(result.map((word) => word.text)).toEqual(["one", "new", "two"]);
  expect(result[0]).toBe(words[0]); expect(result[2]).toBe(words[1]);
  expect(result[1].start).toBeGreaterThanOrEqual(2.4);
  expect(result[1].end).toBeLessThanOrEqual(8);
});

it("retains the Script table Add draft when no timing space exists", () => {
  const changed = vi.fn();
  render(<ScriptEditor value="one two" onChange={vi.fn()} workflow="speech-to-text"
    words={[words[0], { ...words[1], start: 2.4 }]} onWordsChange={changed} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn từ one" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add text" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Thêm text" }), { target: { value: "keep draft" } });
  fireEvent.submit(screen.getByRole("form", { name: "Thêm text sau one" }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Thêm text" })).toHaveValue("keep draft");
  expect(screen.getByText("Không còn khoảng trống timing để thêm text ở đây.")).toHaveAttribute("role", "status");
});

it.each(["script", "subtitle"] as const)("assigns a profile through the %s menu without changing IN/OUT", (mode) => {
  const changed = vi.fn(); render(<Editor mode={mode} changed={changed} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: mode === "script" ? "Chọn từ one" : "Subtitle word one" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Lan" }));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0][0]).toMatchObject({ ...words[0], speakerId: "s" });
  expect(changed.mock.calls[0][0][1]).toBe(words[1]);
});

it.each(["script", "subtitle"] as const)("dismisses the %s menu when same-source words are replaced", (mode) => {
  const changed = vi.fn();
  const element = (items: StudioWord[]) => mode === "script"
    ? <ScriptEditor value={items.map((word) => word.text).join(" ")} onChange={vi.fn()} workflow="speech-to-text" words={items} onWordsChange={changed} />
    : <Timeline gain={0} onGainChange={vi.fn()} take={{ id: "same", name: "same", duration: 10, words: items }} onWordsChange={changed} />;
  const view = render(element(words));
  fireEvent.contextMenu(screen.getByRole("button", { name: mode === "script" ? "Chọn từ one" : "Subtitle word one" }));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  view.rerender(element([words[1]]));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});

it("does not delete prior selected words while Timeline is recording", () => {
  const changed = vi.fn();
  const view = render(<Timeline gain={0} onGainChange={vi.fn()} take={{ id: "prior", name: "prior", duration: 10, words }}
    recordingPreview={{ active: true, duration: 1, samples: [] }} onWordsChange={changed}
    wordSelection={{ indexes: [0], anchor: 0 }} />);
  fireEvent.keyDown(view.container.querySelector(".timeline-module")!, { key: "Delete" });
  expect(changed).not.toHaveBeenCalled();
});
