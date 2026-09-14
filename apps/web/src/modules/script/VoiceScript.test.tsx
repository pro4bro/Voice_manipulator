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
  it("picks the voice of each row from the Speaker cell", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: null, voiceId: null, text: "Được không sao" }]} onRows={onRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Voice đọc đoạn 1" }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getAllByRole("menuitemradio")[1]);

    expect(onRows).toHaveBeenLastCalledWith([{ id: "r1", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Được không sao" }]);
    expect(screen.getByRole("button", { name: "Voice đọc đoạn 1" })).toHaveTextContent("Khoa Trịnh");
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

  it("will not read before every row has a voice", () => {
    const onRead = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: null, voiceId: null, text: "Ai đọc?" }]} onRead={onRead} />);

    expect(screen.getByRole("button", { name: "Tạo voice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tạo voice" })).toHaveTextContent("Đoạn 1 chưa chọn voice");
  });

  it("edits the whole Script as “Tên: lời thoại” text", () => {
    const onRows = vi.fn();
    render(<Harness initial={[{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Xin chào" }]} onRows={onRows} />);

    fireEvent.click(screen.getByRole("button", { name: "BẢNG SCRIPT" }));
    const text = screen.getByLabelText("Script dạng văn bản");
    expect(text).toHaveValue("Anh Vũ: Xin chào");
    fireEvent.change(text, { target: { value: "Anh Vũ: Xin chào\nKhoa Trịnh: Chào anh" } });
    expect((onRows.mock.lastCall?.[0] as VoiceScriptRow[]).map((row) => [row.voiceId, row.text])).toEqual([["an-clone", "Xin chào"], ["khoa-clone", "Chào anh"]]);
  });
});
