import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectMediaAsset } from "../../domain/types";
import { ScriptSourceText } from "./ScriptSourceText";

const source = { id: "a", name: "Track a", text: "Xin chào", words: [{ text: "Xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }], revisions: [] } as unknown as ProjectMediaAsset;
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
