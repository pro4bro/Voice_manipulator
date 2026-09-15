import { describe, expect, it } from "vitest";

import type { ProjectVoice, SpeakerProfile, VoiceOutput, VoiceScriptRow } from "./types";
import { clipboardToRows, lineBreakWords, parseDelimited, resolveRowVoice, rowTimings, rowsFromOutput, rowsToText, scriptReadiness, textToRows, voicesInCategory } from "./voiceScript";

const AN: SpeakerProfile = { id: "speaker-an", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#f00", createdAt: "" };
const KHOA: SpeakerProfile = { ...AN, id: "speaker-khoa", name: "Khoa Trịnh", color: "#0f0" };

function voice(id: string, speakerProfileId: string, kind: ProjectVoice["kind"], createdAt = "2026-09-14T00:00:00Z"): ProjectVoice {
  return {
    id, name: id, speakerProfileId, engine: "omnivoice", kind, modelId: null, baseModel: "k2-fsa/OmniVoice", referenceAudio: "", referenceText: "",
    referenceSeconds: 8, referenceSegmentId: null, adapterPath: null, language: "vi", sourceRunId: null, createdAt,
  };
}

const VOICES = [
  voice("an-clone", "speaker-an", "clone"),
  voice("an-lora", "speaker-an", "lora"),
  voice("an-lora-new", "speaker-an", "full", "2026-09-15T00:00:00Z"),
  voice("khoa-clone", "speaker-khoa", "clone"),
];

describe("voice script", () => {
  it("offers only the kind of voice chosen in Voice Training", () => {
    expect(voicesInCategory(VOICES, "clone").map((item) => item.id)).toEqual(["an-clone", "khoa-clone"]);
    expect(voicesInCategory(VOICES, "train").map((item) => item.id)).toEqual(["an-lora", "an-lora-new"]);
  });

  it("keeps who reads a row when the kind changes, taking that person's newest voice of the new kind", () => {
    const row: VoiceScriptRow = { id: "r", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "x" };
    expect(resolveRowVoice(row, voicesInCategory(VOICES, "clone"))?.id).toBe("an-clone");
    expect(resolveRowVoice(row, voicesInCategory(VOICES, "train"))?.id).toBe("an-lora-new");
    expect(resolveRowVoice({ ...row, speakerProfileId: "speaker-khoa", voiceId: null }, voicesInCategory(VOICES, "train"))).toBeNull();
  });

  it("round-trips rows through Text Edit, keeping row ids and a speaker for unprefixed lines", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const rows: VoiceScriptRow[] = [
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Thì trong lúc mà anh đang nói" },
      { id: "r2", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Được không sao" },
    ];
    const text = rowsToText(rows, [AN, KHOA]);
    expect(text).toBe("Anh Vũ: Thì trong lúc mà anh đang nói\nKhoa Trịnh: Được không sao");

    const parsed = textToRows(`${text}\nEm thì không sợ\nanh vu: Vậy thì anh hỏi xíu`, [AN, KHOA], offered, rows);
    expect(parsed.map((row) => [row.speakerProfileId, row.voiceId, row.text])).toEqual([
      ["speaker-an", "an-clone", "Thì trong lúc mà anh đang nói"],
      ["speaker-khoa", "khoa-clone", "Được không sao"],
      ["speaker-khoa", "khoa-clone", "Em thì không sợ"],
      ["speaker-an", "an-clone", "Vậy thì anh hỏi xíu"],
    ]);
    expect(parsed[0].id).toBe("r1");
    expect(parsed[1].id).toBe("r2");
  });

  it("reads cells the way Excel and Google Sheets copy them, quoted line breaks included", () => {
    const copied = 'Anh Vũ\tThì trong lúc mà\r\nKhoa Trịnh\t"Được không sao\nEm thì ""không"" sợ"\r\n';
    expect(parseDelimited(copied)).toEqual([["Anh Vũ", "Thì trong lúc mà"], ["Khoa Trịnh", 'Được không sao\nEm thì "không" sợ']]);
  });

  it("turns a copied sheet into turns, finding the speaker column by its names and skipping a header", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const sheet = "STT\tSPEAKER\tNỘI DUNG\tTIMESTAMP\n1\tanh vu\tXin chào\t00:01\n2\tKhoa Trịnh\t\"Chào anh\nkhỏe không\"\t00:03\n3\tAi đó\tTiếp tục\t00:05";
    const rows = clipboardToRows(sheet, "", [AN, KHOA], offered, null) ?? [];
    expect(rows.map((row) => [row.speakerProfileId, row.voiceId, row.text])).toEqual([
      ["speaker-an", "an-clone", "Xin chào"],
      ["speaker-khoa", "khoa-clone", "Chào anh\nkhỏe không"],
      ["speaker-khoa", "khoa-clone", "Tiếp tục"],
    ]);

    const headless = clipboardToRows("Khoa Trịnh\tMột câu dài hơn tên\nAnh Vũ\tCâu thứ hai", "", [AN, KHOA], offered, null) ?? [];
    expect(headless.map((row) => [row.speakerProfileId, row.text])).toEqual([["speaker-khoa", "Một câu dài hơn tên"], ["speaker-an", "Câu thứ hai"]]);
  });

  it("turns a Word table or paragraphs into turns, and leaves a single line alone", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const html = "<table><tr><td><p>Anh Vũ</p></td><td><p>Dòng một</p><p>dòng hai</p></td></tr><tr><td>Khoa Trịnh</td><td>Chào</td></tr></table>";
    const fromTable = clipboardToRows("Anh Vũ\nDòng một\ndòng hai\nKhoa Trịnh\nChào", html, [AN, KHOA], offered, null) ?? [];
    expect(fromTable.map((row) => [row.speakerProfileId, row.text])).toEqual([["speaker-an", "Dòng một\ndòng hai"], ["speaker-khoa", "Chào"]]);

    const context = { id: "r0", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "" };
    const paragraphs = clipboardToRows("Anh Vũ: Mở đầu\r\n\r\nNói tiếp đoạn hai\r\nKhoa Trịnh: Kết", "", [AN, KHOA], offered, context) ?? [];
    expect(paragraphs.map((row) => [row.speakerProfileId, row.text])).toEqual([["speaker-an", "Mở đầu"], ["speaker-an", "Nói tiếp đoạn hai"], ["speaker-khoa", "Kết"]]);
    expect(clipboardToRows("chỉ một dòng", "", [AN, KHOA], offered, context)).toBeNull();
  });

  it("keeps a line break inside a row through Text Edit and knows which word ends each line", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const rows: VoiceScriptRow[] = [{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Dòng một ,\ndòng hai" }];
    const text = rowsToText(rows, [AN]);
    expect(text).toBe("Anh Vũ: Dòng một , ↵ dòng hai");
    expect(textToRows(text, [AN], offered, rows)[0].text).toBe("Dòng một ,\ndòng hai");
    expect([...lineBreakWords("Dòng một ,\ndòng hai")]).toEqual([1]);
  });

  it("says which row stops the Script from being read", () => {
    const offered = voicesInCategory(VOICES, "clone");
    expect(scriptReadiness([{ id: "a", speakerProfileId: null, voiceId: null, text: "  " }], offered).problem).toBe("Nhập lời thoại vào Script trước");
    expect(scriptReadiness([
      { id: "a", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "một   hai" },
      { id: "b", speakerProfileId: null, voiceId: null, text: "ba" },
    ], offered).problem).toBe("Đoạn 2 chưa chọn voice");
    expect(scriptReadiness([{ id: "a", speakerProfileId: "speaker-an", voiceId: null, text: " một   hai " }], offered)).toEqual({ rows: [{ id: "a", voiceId: "an-clone", text: "một hai" }], problem: null });
  });

  it("places rows on the output's timeline and notices a row edited since it was read", () => {
    const output = {
      id: "o", duration: 3, words: [
        { text: "Xin", start: 0, end: 0.3, segmentIndex: 0 }, { text: "chào", start: 0.3, end: 0.6, segmentIndex: 0 },
        { text: "Chào", start: 1, end: 1.4, segmentIndex: 1 },
      ],
      segments: [
        { rowId: "r1", voiceId: "an-clone", voiceName: "", speakerProfileId: "speaker-an", engine: "omnivoice", generatorId: "g", text: "Xin chào", start: 0, end: 0.6 },
        { rowId: "r2", voiceId: "khoa-clone", voiceName: "", speakerProfileId: "speaker-khoa", engine: "omnivoice", generatorId: "g", text: "Chào", start: 1, end: 1.4 },
      ],
    } as unknown as VoiceOutput;
    const offered = voicesInCategory(VOICES, "clone");
    const rows = rowsFromOutput(output);
    const fresh = rowTimings(rows, output, offered);
    expect(fresh.get("r1")).toEqual({ start: 0, end: 0.6, firstWord: 0, lastWord: 2, fresh: true });
    expect(fresh.get("r2")).toMatchObject({ firstWord: 2, lastWord: 3, fresh: true });

    const edited = rowTimings([{ ...rows[0], text: "Xin chào nhé" }, { ...rows[1], voiceId: "an-clone", speakerProfileId: "speaker-an" }], output, offered);
    expect(edited.get("r1")?.fresh).toBe(false);
    expect(edited.get("r2")?.fresh).toBe(false);
  });
});
