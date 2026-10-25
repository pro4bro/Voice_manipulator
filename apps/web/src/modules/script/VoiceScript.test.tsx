import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { VoiceScript } from "./VoiceScript";
import { readSelectedScriptText } from "./ScriptTextView";
import type { ProjectVoice, SpeakerProfile, VoiceOutput, VoiceScriptRow } from "../../domain/types";
import type { WordSelection } from "../../domain/word-selection";

const AN: SpeakerProfile = { id: "speaker-an", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#f00", createdAt: "" };
const KHOA: SpeakerProfile = { ...AN, id: "speaker-khoa", name: "Khoa Trịnh", color: "#0f0" };

function voice(id: string, speakerProfileId: string, kind: ProjectVoice["kind"] = "clone"): ProjectVoice {
  return {
    id, name: id, speakerProfileId, engine: "omnivoice", kind, modelId: null, baseModel: "k2-fsa/OmniVoice", referenceAudio: "", referenceText: "",
    referenceSeconds: 8.2, referenceSegmentId: null, adapterPath: null, language: "vi", sourceRunId: null, createdAt: "2026-09-14T00:00:00Z",
  };
}

const VOICES = [voice("an-clone", "speaker-an"), voice("khoa-clone", "speaker-khoa")];

function Harness({ initial, output = null, generatedScript = null, fullGeneratedScript = null, onRead = vi.fn(), onRows, onReferenceContext }: { initial: VoiceScriptRow[]; output?: VoiceOutput | null; generatedScript?: VoiceScriptRow[] | null; fullGeneratedScript?: VoiceScriptRow[] | null; onRead?: () => void; onRows?: (rows: VoiceScriptRow[]) => void; onReferenceContext?: (request: import("../../domain/reference-bindings").ReferenceContextRequest) => void }) {
  const [rows, setRows] = useState(initial);
  const [selection, setSelection] = useState<WordSelection>({ indexes: [], anchor: null });
  return <VoiceScript category="clone" generatedScript={generatedScript} fullGeneratedScript={fullGeneratedScript} onRead={onRead} onReferenceContext={onReferenceContext} onRowsChange={(next) => { setRows(next); onRows?.(next); }} onWordSelectionChange={setSelection} output={output} playbackId={output?.id ?? null} rows={rows} speakers={[AN, KHOA]} voices={VOICES} wordSelection={selection} />;
}

describe("VoiceScript", () => {
  it("shows grouped legacy lines with their original timed words and edits them with Alt+Enter", () => {
    const row: VoiceScriptRow = { id: "r1", text: "Xin\nchào", speakerProfileId: "speaker-an", voiceId: "an-clone", legacyRowIds: ["r1", "r2"] };
    const output = { id: "out", duration: 3, words: [
      { text: "Xin", start: .1, end: .6, segmentIndex: 0 }, { text: "chào", start: 1.2, end: 2, segmentIndex: 1 },
    ], segments: [
      { rowId: "r1", voiceId: "an-clone", text: "Xin", start: 0, end: .8 },
      { rowId: "r2", voiceId: "an-clone", text: "chào", start: 1, end: 2.2 },
    ] } as unknown as VoiceOutput;
    const onRows = vi.fn();
    render(<Harness initial={[row]} generatedScript={[row]} fullGeneratedScript={[row]} output={output} onRows={onRows} />);
    expect(screen.getAllByRole("combobox", { name: /Speaker Profile của đoạn/ })).toHaveLength(1);
    const words = document.querySelector(".voice-script__words") as HTMLElement;
    expect(within(words).getByRole("button", { name: "Chọn từ chào" })).toBeInTheDocument();
    expect(words.querySelectorAll("br")).toHaveLength(1);
    expect(document.querySelector(".is-script-pending")).not.toBeInTheDocument();
    expect(screen.getByText(/OUT.*00:02\.200/u)).toBeInTheDocument();
    fireEvent.doubleClick(words);
    const field = screen.getByRole("textbox", { name: "Lời thoại đoạn 1" }) as HTMLTextAreaElement;
    field.setSelectionRange(3, 3);
    fireEvent.keyDown(field, { key: "Enter", altKey: true });
    expect(field).toHaveValue("Xin\n\nchào");
    expect(screen.getAllByRole("combobox", { name: /Speaker Profile của đoạn/ })).toHaveLength(1);
    expect(onRows.mock.lastCall?.[0][0]).toMatchObject({ id: "r1", legacyRowIds: ["r1", "r2"], text: "Xin\n\nchào" });
    fireEvent.blur(field);
    expect(document.querySelector(".voice-script__words")?.querySelectorAll("br")).toHaveLength(2);
  });

  it("preserves editable Script text when muting a layer reveals different audible words", () => {
    const output = { id: "out", name: "Composition", duration: 1,
      words: [{ text: "Xin", start: 0, end: .4, segmentIndex: 0 }, { text: "chào", start: .4, end: 1, segmentIndex: 0 }],
      segments: [{ rowId: "r1", text: "Xin nhé", voiceId: "an-clone", start: 0, end: 1 }] } as unknown as VoiceOutput;
    render(<Harness initial={[{ id: "r1", voiceId: "an-clone", speakerProfileId: "speaker-an", text: "Xin nhé" }]} output={output} />);
    expect(screen.getByRole("textbox", { name: "Lời thoại đoạn 1" })).toHaveValue("Xin nhé");
    expect(screen.queryByRole("button", { name: "Chọn từ chào" })).not.toBeInTheDocument();
  });
  it("shows Note beside the explicit Script reference action without applying a reference early", () => {
    const onReferenceContext = vi.fn();
    const output = { id: "output-1", name: "Script", duration: 1, words: [{ text: "Xin", start: 0, end: 0.4, segmentIndex: 0 }], segments: [{ rowId: "r1", text: "Xin", voiceId: "an-clone", speakerProfileId: "speaker-an", start: 0, end: 0.4 }] } as unknown as VoiceOutput;
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin" }]} onReferenceContext={onReferenceContext} output={output} />);
    const word = screen.getByRole("button", { name: "Chọn từ Xin" });
    fireEvent.click(word, { detail: 0 });
    fireEvent.contextMenu(word, { clientX: 18, clientY: 22 });
    expect(screen.getByRole("menuitem", { name: "Note" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Gán reference…" })).toBeInTheDocument();
    expect(word).toHaveAttribute("aria-pressed", "true");
    expect(onReferenceContext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Gán reference…" }));
    expect(onReferenceContext).toHaveBeenCalledWith(expect.objectContaining({ origin: "script", selection: expect.objectContaining({ indexes: [0] }) }));
  });

  it("keeps the row reference action available before a Voice Output exists", () => {
    const onReferenceContext = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin" }]} onReferenceContext={onReferenceContext} />);
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: "Xin" }), { clientX: 18, clientY: 22 });
    expect(screen.getByRole("menuitem", { name: "Gán reference…" })).toBeInTheDocument();
    expect(onReferenceContext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Gán reference…" }));
    expect(onReferenceContext).toHaveBeenCalledWith(expect.objectContaining({ origin: "script" }));
  });

  it("offers WAV and Script-line SRT for an output even without word timing", () => {
    const onExport = vi.fn();
    const output: VoiceOutput = {
      id: "output-1", name: "Bài đọc", text: "Xin chào", voiceId: "an-clone", voiceName: "Anh Vũ",
      speakerProfileId: "speaker-an", engine: "omnivoice", generatorId: "omnivoice-generate",
      parameters: {}, duration: 0.8, sampleRate: 24000, audioPath: "assets/voice-output/output-1/audio.wav",
      words: [], segments: [{ rowId: "r1", voiceId: "an-clone", voiceName: "Anh Vũ", speakerProfileId: "speaker-an",
        engine: "omnivoice", generatorId: "omnivoice-generate", text: "Xin chào", start: 0, end: 0.8 }],
      createdAt: "2026-10-02T00:00:00Z",
    };
    render(<VoiceScript category="clone" onExport={onExport} onRead={vi.fn()} onRowsChange={vi.fn()} output={output} playbackId={output.id}
      rows={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} speakers={[AN]} voices={VOICES} />);

    fireEvent.click(screen.getByRole("button", { name: "EXPORT ▾" }));
    expect(screen.getByRole("menuitem", { name: /SRT từng từ/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("menuitem", { name: /SRT từng dòng/ }));
    expect(onExport).toHaveBeenCalledWith("line");
    fireEvent.click(screen.getByRole("button", { name: "EXPORT ▾" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Âm thanh WAV/ }));
    expect(onExport).toHaveBeenCalledWith("audio");
  });

  it("picks the voice of each row from the Speaker cell", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: null, voiceId: null, text: "Được không sao" }]} onRows={onRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Voice đọc đoạn 1" }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getAllByRole("menuitemradio")[1]);

    expect(onRows).toHaveBeenLastCalledWith([{ id: "r1", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Được không sao" }]);
    expect(screen.getByRole("combobox", { name: "Speaker Profile của đoạn 1" })).toHaveValue("speaker-khoa");
  });

  it("changes or clears one row's Speaker without selecting the row or flashing bulk actions", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Được không sao" }, { id: "r2", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Dòng hai" }]} onRows={onRows} />);
    const speaker = screen.getByRole("combobox", { name: "Speaker Profile của đoạn 1" });
    fireEvent.focus(speaker);
    expect(screen.queryByLabelText("Thao tác dòng đã chọn")).not.toBeInTheDocument();
    fireEvent.change(speaker, { target: { value: "speaker-khoa" } });
    expect(onRows).toHaveBeenLastCalledWith([
      { id: "r1", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Được không sao" },
      { id: "r2", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Dòng hai" },
    ]);
    fireEvent.change(speaker, { target: { value: "" } });
    expect(onRows).toHaveBeenLastCalledWith([
      { id: "r1", speakerProfileId: null, voiceId: null, text: "Được không sao" },
      { id: "r2", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Dòng hai" },
    ]);
    expect(screen.queryByLabelText("Thao tác dòng đã chọn")).not.toBeInTheDocument();
  });

  it("shows fixed and pending text separately, but no marks before a generation snapshot", () => {
    const row = { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Một câu tối mai" };
    const { rerender } = render(<Harness initial={[row]} />);
    expect(document.querySelector(".voice-script__highlight-overlay")).not.toBeInTheDocument();
    const generated = { ...row, text: "Một câu sáng mai" };
    const full = { ...row, text: "Một câu sáng sớm" };
    rerender(<Harness initial={[row]} generatedScript={[generated]} fullGeneratedScript={[full]} />);
    const overlay = document.querySelector(".voice-script__highlight-overlay") as HTMLElement;
    expect(overlay.querySelector(".is-pending")).toHaveTextContent("tối");
    expect(overlay.querySelector(".is-fixed")).toHaveTextContent("mai");
    rerender(<Harness initial={[row]} />);
    expect(document.querySelector(".voice-script__highlight-overlay")).not.toBeInTheDocument();
  });

  it("does not show bulk row actions when a user selects a timed word", () => {
    const output = { id: "out", name: "Script", duration: .5, words: [{ text: "Xin", start: 0, end: .5, segmentIndex: 0 }], segments: [{ rowId: "r1", text: "Xin", voiceId: "an-clone", speakerProfileId: "speaker-an", start: 0, end: .5 }] } as unknown as VoiceOutput;
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin" }]} output={output} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn từ Xin" }));
    expect(screen.queryByLabelText("Thao tác dòng đã chọn")).not.toBeInTheDocument();
  });

  it("keeps completed-fix marks visible on word-timed rows", () => {
    const row = { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Một câu sáng mai" };
    const output = { id: "out", name: "Script", duration: 1, words: [
      { text: "Một", start: 0, end: .2, segmentIndex: 0 }, { text: "câu", start: .2, end: .4, segmentIndex: 0 },
      { text: "sáng", start: .4, end: .7, segmentIndex: 0 }, { text: "mai", start: .7, end: 1, segmentIndex: 0 },
    ], segments: [{ rowId: "r1", text: row.text, voiceId: "an-clone", speakerProfileId: "speaker-an", start: 0, end: 1 }] } as unknown as VoiceOutput;
    render(<Harness initial={[row]} output={output} generatedScript={[row]} fullGeneratedScript={[{ ...row, text: "Một câu sáng sớm" }]} />);
    expect(screen.getByRole("button", { name: "Chọn từ mai" })).toHaveClass("is-script-fixed");
    expect(screen.getByRole("button", { name: "Chọn từ sáng" })).not.toHaveClass("is-script-fixed");
  });

  it("keeps Enter in the row, creates another row only with Add Row, and joins on Backspace", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào mọi người" }]} onRows={onRows} />);

    const field = screen.getByLabelText("Lời thoại đoạn 1") as HTMLTextAreaElement;
    field.setSelectionRange(8, 8);
    fireEvent.keyDown(field, { key: "Enter" });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => [row.voiceId, row.text])).toEqual([["an-clone", "Xin chào\n mọi người"]]);

    fireEvent.click(screen.getByRole("button", { name: /THÊM ĐOẠN/ }));
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[])).toHaveLength(2);

    const second = screen.getByLabelText("Lời thoại đoạn 2") as HTMLTextAreaElement;
    second.setSelectionRange(0, 0);
    fireEvent.keyDown(second, { key: "Backspace" });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => row.text)).toEqual(["Xin chào\n mọi người "]);
  });

  it("keeps Enter and multiline paste inside the current Script row", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} onRows={onRows} />);
    const field = screen.getByLabelText("Lời thoại đoạn 1") as HTMLTextAreaElement;
    field.setSelectionRange(3, 3);
    fireEvent.keyDown(field, { key: "Enter" });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map(({ id, text }) => [id, text])).toEqual([["r1", "Xin\n chào"]]);

    onRows.mockClear();
    fireEvent.paste(field, { clipboardData: { getData: (type: string) => type === "text/plain" ? "đoạn hai\nđoạn ba" : "" } });
    expect(onRows).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "Xin\n chàođoạn hai\nđoạn ba" } });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[])).toHaveLength(1);
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[])[0].text).toBe("Xin\n chàođoạn hai\nđoạn ba");
  });

  it("shows words and IN/OUT from the generated audio, and marks a row edited since", () => {
    const output = {
      id: "output-1", name: "Script", duration: 2, wordTimingQuality: "source", words: [
        { text: "Xin", start: 0, end: 0.4, segmentIndex: 0, timingTrusted: true }, { text: "chào", start: 0.4, end: 0.9, segmentIndex: 0, timingTrusted: true },
        { text: "Chào", start: 1.3, end: 1.9, segmentIndex: 1, timingTrusted: true },
      ],
      segments: [
        { rowId: "r1", voiceId: "an-clone", voiceName: "", speakerProfileId: "speaker-an", engine: "omnivoice", generatorId: "g", text: "Xin chào", start: 0, end: 0.9 },
        { rowId: "r2", voiceId: "khoa-clone", voiceName: "", speakerProfileId: "speaker-khoa", engine: "omnivoice", generatorId: "g", text: "Chào", start: 1.3, end: 1.9 },
      ],
    } as unknown as VoiceOutput;
    render(<Harness initial={[
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" },
      { id: "r2", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Chào" },
    ]} output={output} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[1]).toHaveTextContent("IN 00:01.300");
    expect(rows[1]).toHaveTextContent("OUT 00:01.900");
    fireEvent.click(screen.getByRole("button", { name: "Chọn từ chào" }));
    expect(screen.getByRole("button", { name: "Chọn từ chào" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.doubleClick(rows[0].querySelector(".voice-script__words") as Element);
    fireEvent.change(screen.getByLabelText("Lời thoại đoạn 1"), { target: { value: "Xin chào cả nhà" } });
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("ĐÃ SỬA · ĐỌC LẠI");
    expect(screen.getByRole("button", { name: "Tạo voice" })).toHaveTextContent("Tạo voice");
  });

  it("keeps Alt+Enter and copied sheet content inside the same row", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} onRows={onRows} />);

    const field = screen.getByLabelText("Lời thoại đoạn 1") as HTMLTextAreaElement;
    field.setSelectionRange(3, 3);
    fireEvent.keyDown(field, { key: "Enter", altKey: true });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => row.text)).toEqual(["Xin\n chào"]);

    const second = screen.getByLabelText("Lời thoại đoạn 1") as HTMLTextAreaElement;
    second.setSelectionRange(second.value.length, second.value.length);
    fireEvent.paste(second, { clipboardData: { getData: (type: string) => type === "text/plain" ? "Khoa Trịnh\tĐược không sao\nAnh Vũ\tVậy thì" : "" } });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[])).toHaveLength(1);
    expect(onRows).toHaveBeenCalledTimes(1);
    fireEvent.change(second, { target: { value: "Xin\n chào\nKhoa Trịnh\tĐược không sao\nAnh Vũ\tVậy thì" } });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => [row.voiceId, row.text])).toEqual([
      ["an-clone", "Xin\n chào\nKhoa Trịnh\tĐược không sao\nAnh Vũ\tVậy thì"],
    ]);
  });

  it("will not read before every row has a voice", () => {
    const onRead = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: null, voiceId: null, text: "Ai đọc?" }]} onRead={onRead} />);

    expect(screen.getByRole("button", { name: "Tạo voice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tạo voice" })).toHaveTextContent("Đoạn 1 chưa chọn voice");
  });

  it("selects Script rows with Shift and reassigns the selected rows to one speaker", () => {
    const onRows = vi.fn();
    render(<Harness initial={[
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Một" },
      { id: "r2", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Hai" },
      { id: "r3", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Ba" },
    ]} onRows={onRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Chọn đoạn 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn đoạn 3" }), { shiftKey: true });
    expect(screen.getByText("3 dòng đã chọn")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Gán speaker cho các dòng đã chọn" }), { target: { value: "speaker-khoa" } });

    expect(onRows).toHaveBeenLastCalledWith([
      { id: "r1", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Một" },
      { id: "r2", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Hai" },
      { id: "r3", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Ba" },
    ]);
  });

  it("selects every Script row with Ctrl+A from the table", () => {
    render(<Harness initial={[
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Một" },
      { id: "r2", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Hai" },
    ]} />);
    fireEvent.keyDown(screen.getByRole("grid", { name: "Bảng Script theo lượt nói" }), { key: "a", ctrlKey: true });
    expect(screen.getByText("2 dòng đã chọn")).toBeInTheDocument();
  });

  it("clears the whole Voice Script from the footer after confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} onRows={onRows} />);

    const clear = screen.getByRole("button", { name: "Clear Script" });
    const actions = clear.closest(".script-actions");
    expect(actions).not.toBeNull();
    expect(within(actions as HTMLElement).getByRole("button", { name: "Tạo voice" })).toBeInTheDocument();

    fireEvent.click(clear);

    expect(confirm).toHaveBeenCalledOnce();
    expect(onRows).toHaveBeenLastCalledWith([]);
    confirm.mockRestore();
  });

  it("keeps the Voice Script when clear is cancelled", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Giữ nội dung" }]} onRows={onRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear Script" }));

    expect(onRows).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

it("places real generation progress in the right settings host outside Script", () => {
    const now = new Date().toISOString();
    const tasks = [
      { id: "m1", kind: "model", label: "Nạp OmniVoice", detail: "Khởi động runtime", status: "running" as const, fraction: null, etaSeconds: null, startedAt: now, updatedAt: now, finishedAt: null, seconds: null },
      { id: "t1", kind: "tts", label: "Đọc Script · 12 đoạn", detail: "Đoạn 3/12", status: "running" as const, fraction: 0.25, etaSeconds: 40, startedAt: now, updatedAt: now, finishedAt: null, seconds: null },
      { id: "s1", kind: "stt", label: "Speech to Text", detail: "", status: "running" as const, fraction: 0.5, etaSeconds: null, startedAt: now, updatedAt: now, finishedAt: null, seconds: null },
    ];

    const host = document.createElement("aside");
    document.body.append(host);
    const { rerender, container, unmount } = render(
      <VoiceScript settingsHost={host} activityTasks={tasks} category="clone" onRead={vi.fn()} onRowsChange={vi.fn()} output={null} playbackId={null}
        rows={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} speakers={[AN, KHOA]} voices={VOICES} />,
    );

    const strip = screen.getByLabelText("Tiến trình tạo giọng");
    expect(host).toContainElement(strip);
    expect(container).not.toContainElement(strip);
    expect(within(strip).getByText("Đọc Script · 12 đoạn")).toBeInTheDocument();
    expect(within(strip).getByText("Nạp OmniVoice")).toBeInTheDocument();
    expect(within(strip).getByText(/Đoạn 3\/12/)).toBeInTheDocument();
    expect(within(strip).getByText("25%")).toBeInTheDocument();
    // Speech to Text is not audio this Script is making; the status bar has it.
    expect(within(strip).queryByText("Speech to Text")).not.toBeInTheDocument();

    rerender(
      <VoiceScript settingsHost={host} activityTasks={[]} category="clone" onRead={vi.fn()} onRowsChange={vi.fn()} output={null} playbackId={null}
        rows={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} speakers={[AN, KHOA]} voices={VOICES} />,
    );
    expect(screen.queryByLabelText("Tiến trình tạo giọng")).not.toBeInTheDocument();
    unmount(); host.remove();
  });

  it("preserves a multiline saved row when text includes pasted speaker labels", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào\nKhoa Trịnh: literal quote" }]} onRows={onRows} />);

    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    expect(screen.getByText("Anh Vũ:")).toBeInTheDocument();
    const text = document.querySelector<HTMLElement>('[data-script-text-dialogue][data-row-id="r1"]')!;
    expect(text.textContent).toBe("Xin chào\nKhoa Trịnh: literal quote");
    text.textContent = "Xin chào nhé\nKhoa Trịnh: literal quote\nKhoa Trịnh: pasted label is still dialogue";
    fireEvent.input(text);
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => [row.id, row.voiceId, row.text])).toEqual([
      ["r1", "an-clone", "Xin chào nhé\nKhoa Trịnh: literal quote\nKhoa Trịnh: pasted label is still dialogue"],
    ]);
  });

  it("advances Find from the current text row into the next row", () => {
    render(<Harness initial={[
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "same first same second" },
      { id: "r2", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "same in next row" },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    fireEvent.click(screen.getByRole("button", { name: "FIND / REPLACE" }));
    fireEvent.change(screen.getByLabelText("Tìm text"), { target: { value: "same" } });
    const next = screen.getByRole("button", { name: "↓" });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(readSelectedScriptText(screen.getByLabelText("Script dạng văn bản"))?.rowId).toBe("r2");
  });
});
