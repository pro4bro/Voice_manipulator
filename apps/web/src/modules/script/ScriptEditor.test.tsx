import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScriptEditor, scriptWordRanges } from "./ScriptEditor";

describe("ScriptEditor", () => {
  it("lets the user edit transcript text after recognition", () => {
    const onChange = vi.fn();
    render(<ScriptEditor onChange={onChange} value="Bản nhận diện ban đầu" workflow="speech-to-text" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Script transcript" }), { target: { value: "Bản đã được người dùng sửa" } });
    expect(onChange).toHaveBeenCalledWith("Bản đã được người dùng sửa");
  });

  it("does not expose voice generation in Speech to Text", () => {
    render(<ScriptEditor onChange={() => undefined} value="Nội dung" workflow="speech-to-text" />);
    expect(screen.queryByRole("button", { name: "Tạo voice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI fix" })).not.toBeInTheDocument();
  });

  it("highlights the word currently playing on the timeline", () => {
    render(<ScriptEditor activeWordIndex={1} onChange={() => undefined} value="Giọng đang phát" words={[{ text: "Giọng", start: 0, end: 0.4 }, { text: "đang", start: 0.4, end: 0.8 }, { text: "phát", start: 0.8, end: 1.2 }]} workflow="speech-to-text" />);
    expect(screen.getByText("đang")).toHaveClass("is-active");
  });

  it("maps a diarized Speaker row to a Speaker Profile", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-1" }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={[{ id: "speaker-profile-1", name: "Anh Vũ", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "male", attributes: {}, color: "#ff6745", createdAt: "2026-08-23T00:00:00Z" }]} value="Xin chào" words={words} workflow="speech-to-text" />);
    fireEvent.change(screen.getByLabelText("Gán Speaker 1 vào Speaker Profile"), { target: { value: "speaker-profile-1" } });
    expect(onWordsChange).toHaveBeenCalledWith(words.map((word) => ({ ...word, speakerId: "speaker-profile-1" })));
  });

  it("keeps timed words aligned after the user removes an STT intro", () => {
    const words = [{ text: "Hãy", start: 0, end: 0.2 }, { text: "Tôi", start: 0.2, end: 0.5 }, { text: "biết", start: 0.5, end: 0.9 }];
    expect(scriptWordRanges("Tôi biết", words).map((range) => range.index)).toEqual([1, 2]);
  });

  it("opens Word-style find and replace controls", () => {
    render(<ScriptEditor onChange={() => undefined} value="Nội dung" workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "FIND / REPLACE" }));
    expect(screen.getByLabelText("Tìm text")).toBeInTheDocument();
    expect(screen.getByLabelText("Thay bằng text")).toBeInTheDocument();
  });
  it("offers both SRT export modes after word timing is available", () => {
    const onDeferredAction = vi.fn();
    render(<ScriptEditor onChange={() => undefined} onDeferredAction={onDeferredAction} value="Xin chào" words={[{ text: "Xin", start: 0, end: 0.3 }, { text: "chào", start: 0.3, end: 0.7 }]} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: /EXPORT/ }));
    expect(screen.getByRole("menuitem", { name: /Theo câu/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Từng từ/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Bảng Script CSV/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Từng từ/ }));
    expect(onDeferredAction).toHaveBeenCalledWith("Export SRT từng từ");
  });
  it("moves the Script caret by one word with Ctrl+Arrow and extends selection with Ctrl+Shift+Arrow", () => {
    render(<ScriptEditor onChange={() => undefined} value="Xin chào bạn" workflow="speech-to-text" />);
    const editor = screen.getByRole("textbox", { name: "Script transcript" }) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 0);
    fireEvent.keyDown(editor, { ctrlKey: true, key: "ArrowRight" });
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([4, 4]);
    fireEvent.keyDown(editor, { ctrlKey: true, shiftKey: true, key: "ArrowRight" });
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([4, 9]);
  });

  it("switches from the table to compact speaker blocks and keeps Text Edit available", () => {
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-1" }, { text: "bạn", start: 0.8, end: 1.1, diarizationSpeakerId: "speaker-2" }];
    render(<ScriptEditor onChange={() => undefined} value="Xin chào bạn" words={words} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "BẢNG SCRIPT" }));
    expect(screen.getByLabelText("Transcript theo người nói")).toBeInTheDocument();
    expect(screen.getByText("Speaker 1")).toBeInTheDocument();
    expect(screen.getByText("Speaker 2")).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByLabelText("Transcript theo người nói"));
    expect(screen.getByRole("textbox", { name: "Script transcript" })).toBeInTheDocument();
  });
});
