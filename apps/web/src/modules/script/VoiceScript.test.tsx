import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { VoiceScript } from "./VoiceScript";
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

function Harness({ initial, output = null, onRead = vi.fn(), onRows }: { initial: VoiceScriptRow[]; output?: VoiceOutput | null; onRead?: () => void; onRows?: (rows: VoiceScriptRow[]) => void }) {
  const [rows, setRows] = useState(initial);
  const [selection, setSelection] = useState<WordSelection>({ indexes: [], anchor: null });
  return <VoiceScript category="clone" onRead={onRead} onRowsChange={(next) => { setRows(next); onRows?.(next); }} onWordSelectionChange={setSelection} output={output} playbackId={output?.id ?? null} rows={rows} speakers={[AN, KHOA]} voices={VOICES} wordSelection={selection} />;
}

describe("VoiceScript", () => {
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

  it("starts a new turn with Enter, read by the same voice, and joins turns with Backspace", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào mọi người" }]} onRows={onRows} />);

    const field = screen.getByLabelText("Lời thoại đoạn 1") as HTMLTextAreaElement;
    field.setSelectionRange(8, 8);
    fireEvent.keyDown(field, { key: "Enter" });
    const split = onRows.mock.lastCall?.[0] as VoiceScriptRow[];
    expect(split.map((row) => [row.voiceId, row.text])).toEqual([["an-clone", "Xin chào"], ["an-clone", "mọi người"]]);

    const second = screen.getByLabelText("Lời thoại đoạn 2") as HTMLTextAreaElement;
    second.setSelectionRange(0, 0);
    fireEvent.keyDown(second, { key: "Backspace" });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => row.text)).toEqual(["Xin chào mọi người"]);
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

  it("breaks a line inside the row with Alt+Enter and pastes a copied sheet as turns", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} onRows={onRows} />);

    const field = screen.getByLabelText("Lời thoại đoạn 1") as HTMLTextAreaElement;
    field.setSelectionRange(3, 3);
    fireEvent.keyDown(field, { key: "Enter", altKey: true });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => row.text)).toEqual(["Xin\n chào"]);

    const second = screen.getByLabelText("Lời thoại đoạn 1") as HTMLTextAreaElement;
    second.setSelectionRange(second.value.length, second.value.length);
    fireEvent.paste(second, { clipboardData: { getData: (type: string) => type === "text/plain" ? "Khoa Trịnh\tĐược không sao\nAnh Vũ\tVậy thì" : "" } });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => [row.voiceId, row.text])).toEqual([
      ["an-clone", "Xin\n chào"], ["khoa-clone", "Được không sao"], ["an-clone", "Vậy thì"],
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

it("shows what the app is making under the Script, whatever started it", () => {
    const now = new Date().toISOString();
    const tasks = [
      { id: "m1", kind: "model", label: "Nạp OmniVoice", detail: "Khởi động runtime", status: "running" as const, fraction: null, etaSeconds: null, startedAt: now, updatedAt: now, finishedAt: null, seconds: null },
      { id: "t1", kind: "tts", label: "Đọc Script · 12 đoạn", detail: "Đoạn 3/12", status: "running" as const, fraction: 0.25, etaSeconds: 40, startedAt: now, updatedAt: now, finishedAt: null, seconds: null },
      { id: "s1", kind: "stt", label: "Speech to Text", detail: "", status: "running" as const, fraction: 0.5, etaSeconds: null, startedAt: now, updatedAt: now, finishedAt: null, seconds: null },
    ];

    const { rerender } = render(
      <VoiceScript activityTasks={tasks} category="clone" onRead={vi.fn()} onRowsChange={vi.fn()} output={null} playbackId={null}
        rows={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} speakers={[AN, KHOA]} voices={VOICES} />,
    );

    const strip = screen.getByLabelText("Tiến trình tạo giọng");
    expect(within(strip).getByText("Đọc Script · 12 đoạn")).toBeInTheDocument();
    expect(within(strip).getByText("Nạp OmniVoice")).toBeInTheDocument();
    expect(within(strip).getByText(/Đoạn 3\/12/)).toBeInTheDocument();
    expect(within(strip).getByText("25%")).toBeInTheDocument();
    // Speech to Text is not audio this Script is making; the status bar has it.
    expect(within(strip).queryByText("Speech to Text")).not.toBeInTheDocument();

    rerender(
      <VoiceScript activityTasks={[]} category="clone" onRead={vi.fn()} onRowsChange={vi.fn()} output={null} playbackId={null}
        rows={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} speakers={[AN, KHOA]} voices={VOICES} />,
    );
    expect(screen.queryByLabelText("Tiến trình tạo giọng")).not.toBeInTheDocument();
  });

  it("edits the whole Script as “Tên: lời thoại” text", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} onRows={onRows} />);

    fireEvent.click(screen.getByRole("button", { name: "DẠNG BẢNG" }));
    const text = screen.getByLabelText("Script dạng văn bản");
    expect(text).toHaveValue("Anh Vũ: Xin chào");
    fireEvent.change(text, { target: { value: "Anh Vũ: Xin chào\nKhoa Trịnh: Chào anh" } });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => [row.voiceId, row.text])).toEqual([["an-clone", "Xin chào"], ["khoa-clone", "Chào anh"]]);
  });
});
