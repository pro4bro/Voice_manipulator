import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScriptEditor, scriptWordRanges } from "./ScriptEditor";
import { moveWordToRow } from "./script-table";

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
    const first = screen.getByRole("button", { name: "Chọn từ Xin" });
    const second = screen.getByRole("button", { name: "Chọn từ chào" });
    fireEvent.pointerDown(first, { pointerId: 1 });
    fireEvent.pointerEnter(second, { pointerId: 1 });
    fireEvent.pointerUp(second, { pointerId: 1 });
    fireEvent.contextMenu(second, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Anh Vũ" }));
    expect(onWordsChange).toHaveBeenCalledWith(words.map((word) => ({ ...word, speakerId: "speaker-profile-1" })));
  });

  it("assigns one word without changing its diarization provenance", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-2" }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={[{ id: "speaker-profile-2", name: "Chị Lan", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "female", attributes: {}, color: "#86b5d8", createdAt: "2026-08-23T00:00:00Z" }]} value="Xin chào" words={words} workflow="speech-to-text" />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn từ chào" }), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Chị Lan" }));
    expect(onWordsChange).toHaveBeenCalledWith([words[0], { ...words[1], speakerId: "speaker-profile-2" }]);
  });

  it("edits one selected word in a popup without changing its timestamp or annotations", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0.12, end: 0.34, diarizationSpeakerId: "speaker-1", speakerId: "lan", emotion: "good" as const }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} value="Xin" words={words} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn từ Xin" }));
    const editor = screen.getByRole("textbox", { name: "Sửa từ Xin" });
    fireEvent.change(editor, { target: { value: "Chào" } });
    fireEvent.submit(screen.getByLabelText("Sửa từ Xin"));
    expect(onWordsChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "Chào", start: 0.12, end: 0.34, diarizationSpeakerId: "speaker-1", speakerId: "lan", emotion: "good", reviewState: "manual", selectedVariant: "manual" }),
    ], "Chào");
  });

  it("shows replaced Live Transcript text struck through and the STT alternative in pale yellow", () => {
    render(<ScriptEditor liveTranscriptText="toi" onChange={vi.fn()} value="tôi" words={[{ text: "tôi", start: 0, end: 0.4 }]} workflow="speech-to-text" />);
    expect(screen.getByLabelText("So sánh Live Transcript và STT")).toBeInTheDocument();
    expect(screen.getByText("toi").tagName).toBe("S");
    expect(screen.getByText("tôi").tagName).toBe("B");
  });

  it("keeps only the selected AI candidate as a final dark result", () => {
    const onChange = vi.fn();
    render(<ScriptEditor aiReviewKey="review-1" aiReviewText="tôi" onChange={onChange} value="toi" workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "Dùng phương án AI" }));
    expect(onChange).toHaveBeenCalledWith("tôi");
    expect(screen.getByText("tôi")).toHaveClass("script-review-choice", "is-ai");
    expect(screen.queryByRole("button", { name: "Giữ kết quả Speech to Text" })).not.toBeInTheDocument();
  });

  it("moves a word to an unassigned diarized row with a manual row override", () => {
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-1" }, { text: "bạn", start: 0.8, end: 1.1, diarizationSpeakerId: "speaker-2" }];
    const moved = moveWordToRow(words, 1, { speakerKey: "speaker-2", profileId: null });
    expect(moved[1]).toEqual({ ...words[1], speakerId: undefined, manualDiarizationSpeakerId: "speaker-2" });
    expect(moved[1].diarizationSpeakerId).toBe("speaker-1");
  });

  it("moves selected words between visible Script rows from the right-click menu", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-1" }, { text: "bạn", start: 0.8, end: 1.1, diarizationSpeakerId: "speaker-2" }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} value="Xin chào bạn" words={words} workflow="speech-to-text" />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn từ chào" }), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "→ Speaker 2 · 00:00.800" }));
    expect(onWordsChange).toHaveBeenCalledWith([words[0], { ...words[1], speakerId: undefined, manualDiarizationSpeakerId: "speaker-2" }, words[2]]);
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
