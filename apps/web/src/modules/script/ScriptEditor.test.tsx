import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { ScriptEditor, scriptWordRanges } from "./ScriptEditor";
import { moveWordToRow } from "./script-table";

/**
 * The workspace owns the selection so Script and Timeline agree on it, so a test
 * that renders the editor bare would be testing a component nothing is driving.
 */
function SelectableScriptEditor(props: Parameters<typeof ScriptEditor>[0]) {
  const [selection, setSelection] = useState<WordSelection>(EMPTY_SELECTION);
  return <ScriptEditor {...props} onWordSelectionChange={setSelection} wordSelection={selection} />;
}

describe("ScriptEditor", () => {
  it("commits pending plain text timing before requesting redo so a new edit clears the old redo branch", () => {
    const order: string[] = [];
    const onWordsChange = vi.fn(() => order.push("edit"));
    function Editor() {
      const [text, setText] = useState("one");
      return <ScriptEditor onChange={setText} onWordsChange={onWordsChange} onRedo={() => order.push("redo")} words={[{ text: "one", start: 0, end: 1 }]} value={text} workflow="speech-to-text" />;
    }
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    const input = screen.getByRole("textbox", { name: "Script transcript" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "two" } });
    fireEvent.keyDown(input, { key: "z", ctrlKey: true, shiftKey: true });
    expect(order).toEqual(["edit", "redo"]);
    expect(onWordsChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ text: "two" })]), "two");
  });
  it("selects every logical row and routes bounded history shortcuts while the pointer is in Script", () => {
    const onUndo = vi.fn(), onRedo = vi.fn();
    const view = render(<ScriptEditor onChange={vi.fn()} onUndo={onUndo} onRedo={onRedo} words={[
      { text: "one", start: 0, end: 1, diarizationSpeakerId: "speaker-1" },
      { text: "two", start: 1, end: 2, diarizationSpeakerId: "speaker-2" },
    ]} value="one two" workflow="speech-to-text" />);
    const scope = view.container.querySelector(".script-module")!;
    fireEvent.pointerEnter(scope);
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Chọn Script row Speaker 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Chọn Script row Speaker 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Row 1")).toHaveTextContent("1");
    expect(screen.getByLabelText("Row 2")).toHaveTextContent("2");
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, shiftKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
    fireEvent.pointerLeave(scope);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
  });
  it("only assigns checked rows when choosing a Speaker Profile", () => {
    const onWordsChange = vi.fn();
    const speakers = [{ id: "an", name: "An", color: "#ff8000" }, { id: "binh", name: "Bình", color: "#80ff00" }] as Parameters<typeof ScriptEditor>[0]["speakers"];
    const words = [{ text: "Xin", start: 0, end: 1, diarizationSpeakerId: "speaker-1", speakerId: "an" }, { text: "chào", start: 1, end: 2, diarizationSpeakerId: "speaker-2", speakerId: "binh" }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={speakers} value="Xin chào" words={words} workflow="speech-to-text" />);
    fireEvent.change(screen.getByRole("combobox", { name: "Speaker Profile của row 1" }), { target: { value: "binh" } });
    expect(onWordsChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chọn Script row An" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Speaker Profile của row 1" }), { target: { value: "binh" } });
    expect(onWordsChange).toHaveBeenCalledWith([{ ...words[0], speakerId: "binh" }, words[1]]);
    expect(screen.getByRole("combobox", { name: "Speaker Profile của row 2" })).toHaveValue("binh");
  });
it("requires checked rows for the toolbar speaker choice without changing the whole footage profile", () => {
    const onSpeakerProfileChange = vi.fn();
    const speakers = [
      { id: "speaker-an", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#f00", createdAt: "" },
      { id: "speaker-khoa", name: "Khoa Trịnh", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#0f0", createdAt: "" },
    ];

    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 1 }, { text: "chào", start: 1, end: 2 }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} onSpeakerProfileChange={onSpeakerProfileChange} speakerProfileId="speaker-an" speakers={speakers} value="Xin chào" words={words} workflow="speech-to-text" />);

    const pick = screen.getByLabelText("Gán speaker cho rows đã chọn") as HTMLSelectElement;
    expect(pick).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Chọn Script row Anh Vũ" }));
    expect(pick).toBeEnabled();
    fireEvent.change(pick, { target: { value: "speaker-khoa" } });
    expect(onWordsChange).toHaveBeenCalledWith(words.map((word) => ({ ...word, speakerId: "speaker-khoa" })));

    fireEvent.change(pick, { target: { value: "" } });
    expect(onSpeakerProfileChange).not.toHaveBeenCalled();
    expect(onWordsChange).toHaveBeenLastCalledWith(words.map((word) => ({ ...word, speakerId: undefined })));
  });

  it("offers no speaker picker when no take is open", () => {
    render(<ScriptEditor onChange={vi.fn()} value="" workflow="speech-to-text" />);

    expect(screen.queryByLabelText("Gán speaker cho rows đã chọn")).not.toBeInTheDocument();
  });

  it("lets the user edit transcript text after recognition", () => {
    const onChange = vi.fn();
    render(<ScriptEditor onChange={onChange} value="Bản nhận diện ban đầu" workflow="speech-to-text" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Script transcript" }), { target: { value: "Bản đã được người dùng sửa" } });
    expect(onChange).toHaveBeenCalledWith("Bản đã được người dùng sửa");
  });
  it("commits native text edits against the pre-edit timing snapshot when focus leaves the editor", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3 }, { text: "chào", start: 0.5, end: 0.8 }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} value="Xin chào" words={words} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    const editor = screen.getByRole("textbox", { name: "Script transcript" });
    fireEvent.focus(editor);
    fireEvent.change(editor, { target: { value: "Xin rất chào" } });
    fireEvent.blur(editor);
    expect(onWordsChange).toHaveBeenCalledWith([
      words[0],
      expect.objectContaining({ text: "rất", timingSource: "user-interpolated", timingTrusted: false }),
      words[1],
    ], "Xin rất chào");
  });
  it("shows a delayed estimated-timing note over plain prose without moving native selection", () => {
    vi.useFakeTimers();
    try {
      const words = [
        { text: "Xin", start: 0, end: 0, timingSource: "user-interpolated" as const, timingTrusted: false },
        { text: "chào", start: 0.2, end: 0.4 },
      ];
      const view = render(<ScriptEditor onChange={vi.fn()} value="Xin chào" words={words} workflow="speech-to-text" />);
      fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
      const editor = screen.getByRole("textbox", { name: "Script transcript" }) as HTMLTextAreaElement;
      editor.setSelectionRange(0, 3);
      const estimatedSpan = view.container.querySelector<HTMLElement>('[data-script-word-index="0"][data-time-estimated="true"]');
      expect(estimatedSpan).not.toBeNull();
      vi.spyOn(estimatedSpan!, "getClientRects").mockReturnValue([{ left: 0, right: 80, top: 0, bottom: 30 } as DOMRect] as unknown as DOMRectList);
      fireEvent.pointerMove(editor, { clientX: 12, clientY: 12 });
      act(() => { vi.advanceTimersByTime(1999); });
      expect(screen.queryByRole("status", { name: /Timestamp ước lượng/ })).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1); });
      expect(view.container.querySelector(".script-table__timing-status")).toHaveTextContent("Timestamp ước lượng · Xin · cần kiểm tra trên waveform");
      expect(editor.selectionStart).toBe(0);
      expect(editor.selectionEnd).toBe(3);
      fireEvent.pointerLeave(editor);
      expect(view.container.querySelector(".script-table__timing-status")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it("offers copy and paste for a selected Script text range", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("rất tốt");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText, readText } });
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3 }, { text: "chào", start: 0.5, end: 0.8 }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} value="Xin chào" words={words} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    const editor = screen.getByRole("textbox", { name: "Script transcript" }) as HTMLTextAreaElement;
    editor.setSelectionRange(4, 8);
    fireEvent.contextMenu(editor, { clientX: 12, clientY: 15 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("chào"));

    editor.setSelectionRange(4, 8);
    fireEvent.contextMenu(editor, { clientX: 12, clientY: 15 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste thay đoạn chọn" }));
    await waitFor(() => expect(readText).toHaveBeenCalledOnce());
    expect(onWordsChange).toHaveBeenLastCalledWith([
      words[0],
      expect.objectContaining({ text: "rất", timingSource: "user-interpolated", timingTrusted: false }),
      expect.objectContaining({ text: "tốt", timingSource: "user-interpolated", timingTrusted: false }),
    ], "Xin rất tốt");
  });

  it("clears transcript text and timed words together after confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChange = vi.fn();
    const onWordsChange = vi.fn();
    render(<ScriptEditor
      onChange={onChange}
      onWordsChange={onWordsChange}
      value="Xin chào"
      words={[{ text: "Xin", start: 0, end: 0.3 }, { text: "chào", start: 0.3, end: 0.7 }]}
      workflow="speech-to-text"
    />);

    const clearButton = screen.getByRole("button", { name: "Clear Text" });
    expect(clearButton.closest(".script-actions")).toContainElement(screen.getByRole("button", { name: /EXPORT/ }));
    fireEvent.click(clearButton);

    expect(confirm).toHaveBeenCalledOnce();
    expect(onWordsChange).toHaveBeenCalledWith([], "");
    expect(onChange).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("keeps the Script unchanged when clear is cancelled", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = vi.fn();
    render(<ScriptEditor onChange={onChange} value="Nội dung cần giữ" workflow="speech-to-text" />);

    fireEvent.click(screen.getByRole("button", { name: "Clear Text" }));

    expect(onChange).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("keeps the Input clear action out of Voice Manipulator", () => {
    render(<ScriptEditor
      onChange={vi.fn()}
      onWordsChange={vi.fn()}
      value="Lời thoại cần tạo"
      words={[{ text: "tham chiếu", start: 0, end: 0.5 }]}
      workflow="voice-manipulator"
    />);

    expect(screen.queryByRole("button", { name: "Clear Text" })).not.toBeInTheDocument();
  });

  it("does not expose voice generation in Speech to Text", () => {
    render(<ScriptEditor onChange={() => undefined} value="Nội dung" workflow="speech-to-text" />);
    expect(screen.queryByRole("button", { name: "Tạo voice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI fix" })).not.toBeInTheDocument();
  });

  it("warns when legacy word intervals have no trusted timing source", () => {
    render(<ScriptEditor onChange={() => undefined} value="Nội dung cũ" wordTimingQuality="unverified" words={[{ text: "Nội", start: 0, end: 0.4 }]} workflow="speech-to-text" />);
    expect(screen.getByRole("status")).toHaveTextContent(/chưa có nguồn căn chỉnh đáng tin/i);
  });

  it("highlights the word currently playing on the timeline", () => {
    render(<ScriptEditor activeWordIndex={1} onChange={() => undefined} value="Giọng đang phát" words={[{ text: "Giọng", start: 0, end: 0.4 }, { text: "đang", start: 0.4, end: 0.8 }, { text: "phát", start: 0.8, end: 1.2 }]} workflow="speech-to-text" />);
    expect(screen.getByText("đang")).toHaveClass("is-active");
  });

  it("maps a diarized Speaker row to a Speaker Profile", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-1" }];
    render(<SelectableScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={[{ id: "speaker-profile-1", name: "Anh Vũ", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "male", attributes: {}, color: "#ff6745", createdAt: "2026-08-23T00:00:00Z" }]} value="Xin chào" words={words} workflow="speech-to-text" />);
    const first = screen.getByRole("button", { name: "Chọn từ Xin" });
    const second = screen.getByRole("button", { name: "Chọn từ chào" });
    fireEvent.click(screen.getByRole("button", { name: "Chọn Script row Speaker 1" }));
    fireEvent.pointerDown(first, { pointerId: 1 });
    fireEvent.pointerEnter(second, { pointerId: 1 });
    fireEvent.pointerUp(second, { pointerId: 1 });
    fireEvent.contextMenu(second, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Anh Vũ" }));
    expect(onWordsChange).toHaveBeenCalledWith(words.map((word) => ({ ...word, speakerId: "speaker-profile-1" })));
  });

  it("selects diarized Script rows with Shift and bulk assigns their timed words", () => {
    const onWordsChange = vi.fn();
    const speakers = [
      { id: "speaker-profile-1", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male" as const, attributes: {}, color: "#ff6745", createdAt: "" },
      { id: "speaker-profile-2", name: "Chị Lan", language: "vi", languageId: "vi", region: null, age: null, gender: "female" as const, attributes: {}, color: "#86b5d8", createdAt: "" },
    ];
    const words = [
      { text: "Xin", start: 0, end: 0.3, speakerId: "speaker-profile-1" },
      { text: "chào", start: 0.3, end: 0.7, speakerId: "speaker-profile-1" },
      { text: "bạn", start: 0.7, end: 1, speakerId: "speaker-profile-2" },
    ];
    render(<SelectableScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={speakers} value="Xin chào bạn" words={words} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn Script row Anh Vũ" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn Script row Chị Lan" }), { shiftKey: true });
    expect(screen.getByText("2 row đã chọn")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Gán speaker cho transcript rows" }), { target: { value: "speaker-profile-2" } });
    expect(onWordsChange).toHaveBeenCalledWith(words.map((word) => ({ ...word, speakerId: "speaker-profile-2" })));
  });

  it("selects every transcript row with Ctrl+A and removes selected row text and timings together", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onWordsChange = vi.fn();
    const words = [
      { text: "Xin", start: 0, end: 0.3, speakerId: "speaker-profile-1" },
      { text: "chào", start: 0.3, end: 0.7, speakerId: "speaker-profile-1" },
      { text: "bạn", start: 0.7, end: 1, speakerId: "speaker-profile-2" },
    ];
    render(<SelectableScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={[
      { id: "speaker-profile-1", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#ff6745", createdAt: "" },
      { id: "speaker-profile-2", name: "Chị Lan", language: "vi", languageId: "vi", region: null, age: null, gender: "female", attributes: {}, color: "#86b5d8", createdAt: "" },
    ]} value="Xin chào bạn" words={words} workflow="speech-to-text" />);
    const grid = screen.getByRole("grid", { name: "Bảng Script theo người nói" });
    fireEvent.keyDown(grid, { key: "a", ctrlKey: true });
    expect(screen.getByText("2 row đã chọn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xoá rows đã chọn" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(onWordsChange).toHaveBeenLastCalledWith([], "");
    confirm.mockRestore();
  });

  it("assigns one word without changing its diarization provenance", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-2" }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} speakers={[{ id: "speaker-profile-2", name: "Chị Lan", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: null, gender: "female", attributes: {}, color: "#86b5d8", createdAt: "2026-08-23T00:00:00Z" }]} value="Xin chào" words={words} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn Script row Speaker 2" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn từ chào" }), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Chị Lan" }));
    expect(onWordsChange).toHaveBeenCalledWith([words[0], { ...words[1], speakerId: "speaker-profile-2" }]);
  });

  it("edits one selected word and keeps its profile and emotion while dropping replaced timing", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0.12, end: 0.34, diarizationSpeakerId: "speaker-1", speakerId: "lan", emotion: "good" as const }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} value="Xin" words={words} workflow="speech-to-text" />);
    // Editing is a deliberate second gesture: a single click only selects, so a
    // selected word stays free to be dragged into another row.
    fireEvent.doubleClick(screen.getByRole("button", { name: "Chọn từ Xin" }));
    const editor = screen.getByRole("textbox", { name: "Sửa từ Xin" });
    fireEvent.change(editor, { target: { value: "Chào" } });
    fireEvent.submit(screen.getByRole("form", { name: "Trình sửa từ Xin" }));
    expect(onWordsChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "Chào", timingSource: "user-interpolated", timingTrusted: false, diarizationSpeakerId: "speaker-1", speakerId: "lan", emotion: "good", reviewState: "manual", selectedVariant: "manual" }),
    ], "Chào");
    const edited = onWordsChange.mock.calls[0][0][0];
    expect(edited.start).toBeGreaterThanOrEqual(words[0].start);
    expect(edited.end).toBeGreaterThan(edited.start);
    expect(edited.end).toBeLessThanOrEqual(words[0].end);
  });
  it("commits an inline table word edit when the user clicks outside the editor", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3 }, { text: "chào", start: 0.5, end: 0.8 }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} value="Xin chào" words={words} workflow="speech-to-text" />);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Chọn từ Xin" }));
    const editor = screen.getByRole("textbox", { name: "Sửa từ Xin" });
    fireEvent.change(editor, { target: { value: "Thưa" } });
    fireEvent.blur(editor);
    expect(onWordsChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "Thưa", timingSource: "user-interpolated", timingTrusted: false }),
      words[1],
    ], "Thưa chào");
  });
  it("promotes the middle-clicked word and cancels promotion on a normal click", () => {
    const handler = vi.fn();
    window.addEventListener("pro4bro:timestamp-promotion", handler);
    render(<ScriptEditor onChange={vi.fn()} playbackAssetId="asset-17" value="Xin chào" words={[{ text: "Xin", start: 0, end: 0.3 }, { text: "chào", start: 0.4, end: 0.8 }]} workflow="speech-to-text" />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Chọn từ chào" }), { button: 1, pointerId: 2 });
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { assetId: "asset-17", index: 1 } }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Chọn từ chào" }), { button: 0, pointerId: 3 });
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { assetId: "asset-17", index: null } }));
    window.removeEventListener("pro4bro:timestamp-promotion", handler);
  });
  it("explains an estimated word timestamp only after the pointer pauses for two seconds", () => {
    vi.useFakeTimers();
    render(<ScriptEditor onChange={vi.fn()} value="Xin rất chào" words={[
      { text: "Xin", start: 0, end: 0.3 },
      { text: "rất", start: 0.4, end: 0.6, timingSource: "user-interpolated", timingTrusted: false },
      { text: "chào", start: 0.7, end: 1 },
    ]} workflow="speech-to-text" />);
    const estimated = screen.getByRole("button", { name: "Chọn từ rất" });
    fireEvent.pointerEnter(estimated, { clientX: 40, clientY: 50 });
    expect(screen.queryByText(/Timestamp ước lượng/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.queryByText(/Timestamp ước lượng/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(/Timestamp ước lượng/)).toHaveTextContent(/ước lượng · cần kiểm tra/i);
    vi.useRealTimers();
  });

  it("shows replaced Live Transcript text struck through and the STT alternative in pale yellow", () => {
    render(<ScriptEditor liveTranscriptText="toi" onChange={vi.fn()} value="tôi" words={[{ text: "tôi", start: 0, end: 0.4 }]} workflow="speech-to-text" />);
    expect(screen.getByLabelText("So sánh Live Transcript và STT")).toBeInTheDocument();
    expect(screen.getByText("toi", { selector: "s" })).toBeInTheDocument();
    expect(screen.getByText("tôi", { selector: "b" })).toBeInTheDocument();
  });

  it("keeps only the selected AI candidate as a final dark result", async () => {
    const onChange = vi.fn();
    render(<ScriptEditor aiReviewKey="review-1" aiReviewText="tôi" onChange={onChange} value="toi" workflow="speech-to-text" />);
    fireEvent.click(screen.getByTitle("Dùng phương án AI"));
    expect(onChange).toHaveBeenCalledWith("tôi");
    expect(await screen.findByText("tôi", { selector: ".script-review-choice" }, { timeout: 5000 })).toHaveClass("is-ai");
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
    fireEvent.click(screen.getByRole("menuitem", { name: "↓ Speaker 2 · 00:00.800" }));
    expect(onWordsChange).toHaveBeenCalledWith([words[0], { ...words[1], speakerId: undefined, manualDiarizationSpeakerId: "speaker-2" }, words[2]]);
  });

  it("offers no row to a word in the middle of its row, which would reorder the transcript", () => {
    const words = [
      { text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" },
      { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-1" },
      { text: "các", start: 0.7, end: 1.0, diarizationSpeakerId: "speaker-1" },
      { text: "bạn", start: 1.0, end: 1.3, diarizationSpeakerId: "speaker-2" },
    ];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={vi.fn()} value="Xin chào các bạn" words={words} workflow="speech-to-text" />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn từ chào" }), { clientX: 20, clientY: 20 });
    expect(screen.getByText("KHÔNG CHUYỂN ĐƯỢC ROW · chọn từ ở đầu hoặc cuối row")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^[↑↓]/ })).toBeNull();
  });

  it("a single click selects a word and leaves it draggable, without an editor over it", () => {
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }];
    render(<SelectableScriptEditor onChange={vi.fn()} onWordsChange={vi.fn()} value="Xin" words={words} workflow="speech-to-text" />);
    const word = screen.getByRole("button", { name: "Chọn từ Xin" });
    fireEvent.pointerDown(word, { pointerId: 1 });
    fireEvent.click(word);
    expect(word).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("form", { name: "Trình sửa từ Xin" })).toBeNull();
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
  it("find-and-replace updates timed words and marks inserted text as estimated", () => {
    const onWordsChange = vi.fn();
    const words = [{ text: "Xin", start: 0, end: 0.3 }, { text: "sai", start: 0.5, end: 0.8 }, { text: "chào", start: 1, end: 1.3 }];
    render(<ScriptEditor onChange={vi.fn()} onWordsChange={onWordsChange} value="Xin sai chào" words={words} workflow="speech-to-text" />);
    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    fireEvent.click(screen.getByRole("button", { name: "FIND / REPLACE" }));
    fireEvent.change(screen.getByLabelText("Tìm text"), { target: { value: "sai" } });
    fireEvent.change(screen.getByLabelText("Thay bằng text"), { target: { value: "rất tốt" } });
    fireEvent.click(screen.getByRole("button", { name: "ALL" }));
    expect(onWordsChange).toHaveBeenCalledWith([
      words[0],
      expect.objectContaining({ text: "rất", timingSource: "user-interpolated", timingTrusted: false }),
      expect.objectContaining({ text: "tốt", timingSource: "user-interpolated", timingTrusted: false }),
      words[2],
    ], "Xin rất tốt chào");
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

  it("switches between table and plain text only with DẠNG BẢNG", () => {
    const words = [{ text: "Xin", start: 0, end: 0.3, diarizationSpeakerId: "speaker-1" }, { text: "chào", start: 0.3, end: 0.7, diarizationSpeakerId: "speaker-1" }, { text: "bạn", start: 0.8, end: 1.1, diarizationSpeakerId: "speaker-2" }];
    render(<ScriptEditor onChange={() => undefined} value="Xin chào bạn" words={words} workflow="speech-to-text" />);
    expect(screen.getByRole("grid", { name: "Bảng Script theo người nói" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    expect(screen.getByRole("textbox", { name: "Script transcript" })).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByRole("textbox", { name: "Script transcript" }));
    expect(screen.getByRole("textbox", { name: "Script transcript" })).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: "Bảng Script theo người nói" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    expect(screen.getByRole("grid", { name: "Bảng Script theo người nói" })).toBeInTheDocument();
  });
});
