import { describe, expect, it } from "vitest";

import type { ProjectVoice, SpeakerProfile, VoiceOutput, VoiceScriptRow } from "./types";
import { lineBreakWords, parseDelimited, resolveRowVoice, rowTimings, rowsFromOutput, rowsToText, scriptReadiness, textToRows, voicesInCategory } from "./voiceScript";

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

  it("preserves saved row boundaries while keeping known speaker labels in edited dialogue as text", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const rows: VoiceScriptRow[] = [
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Thì trong lúc mà anh đang nói" },
      { id: "r2", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "Được không sao" },
    ];
    const text = rowsToText(rows, [AN, KHOA]);
    expect(text).toBe("Anh Vũ: Thì trong lúc mà anh đang nói\nKhoa Trịnh: Được không sao");

    const edited = `${text}\nEm thì không sợ\nanh vu: Vậy thì anh hỏi xíu`;
    const parsed = textToRows(edited, [AN, KHOA], offered, rows, text);
    expect(parsed.map((row) => [row.speakerProfileId, row.voiceId, row.text])).toEqual([
      ["speaker-an", "an-clone", "Thì trong lúc mà anh đang nói"],
      ["speaker-khoa", "khoa-clone", "Được không sao\nEm thì không sợ\nanh vu: Vậy thì anh hỏi xíu"],
    ]);
    expect(parsed[0].id).toBe("r1");
    expect(parsed[1].id).toBe("r2");
  });

  it("does not infer rows from pasted speaker labels when there is no diarized row boundary", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const pasted = "Anh Vũ: đầu\nKhoa Trịnh: câu sau";
    expect(textToRows(pasted, [AN, KHOA], offered, [], "").map(({ speakerProfileId, text }) => [speakerProfileId, text])).toEqual([
      [null, pasted],
    ]);
  });

  it("preserves a speaker-like prefix pasted into an empty Script on the next edit", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const pasted = "Chưa gán: hello";
    const initial = textToRows(pasted, [AN, KHOA], offered, [], "");
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ speakerProfileId: null, text: pasted });

    const edited = `${pasted}!`;
    expect(textToRows(edited, [AN, KHOA], offered, initial, pasted)).toEqual([
      { ...initial[0], text: edited },
    ]);
  });

  it("keeps a prefix inserted before the first projected speaker header across consecutive edits", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const previous: VoiceScriptRow[] = [
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "abc" },
      { id: "r2", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "def" },
    ];
    const baseline = rowsToText(previous, [AN, KHOA]);
    const prefixed = `X${baseline}`;
    const first = textToRows(prefixed, [AN, KHOA], offered, previous, baseline);
    expect(first.map(({ id, text }) => [id, text])).toEqual([["r1", "XAnh Vũ: abc"], ["r2", "def"]]);

    const nextEdit = `!${prefixed}`;
    expect(textToRows(nextEdit, [AN, KHOA], offered, first, prefixed).map(({ id, text }) => [id, text])).toEqual([
      ["r1", "!XAnh Vũ: abc"], ["r2", "def"],
    ]);
  });

  it("keeps a deleted projected header and trailing newline through a later edit", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const previous: VoiceScriptRow[] = [
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "abc" },
      { id: "r2", speakerProfileId: "speaker-khoa", voiceId: "khoa-clone", text: "def" },
    ];
    const baseline = rowsToText(previous, [AN, KHOA]);
    const headerDeleted = "abc\nKhoa Trịnh: def";
    const first = textToRows(headerDeleted, [AN, KHOA], offered, previous, baseline);
    expect(first.map(({ id, text }) => [id, text])).toEqual([["r1", "abc"], ["r2", "def"]]);

    const nextEdit = "abc!\nKhoa Trịnh: def";
    const second = textToRows(nextEdit, [AN, KHOA], offered, first, headerDeleted);
    expect(second.map(({ id, text }) => [id, text])).toEqual([["r1", "abc!"], ["r2", "def"]]);

    const trailingNewline = `${nextEdit}\n`;
    expect(textToRows(trailingNewline, [AN, KHOA], offered, second, nextEdit).map(({ id, text }) => [id, text])).toEqual([
      ["r1", "abc!"], ["r2", "def\n"],
    ]);
  });

  it("keeps row boundaries and raw newlines in Text Edit serialization", () => {
    const rows: VoiceScriptRow[] = [
      { id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Dòng một\ndòng tiếp" },
      { id: "r2", speakerProfileId: null, voiceId: null, text: "Chưa gán" },
    ];
    const text = rowsToText(rows, [AN]);
    expect(text).toBe("Anh Vũ: Dòng một\ndòng tiếp\nChưa gán: Chưa gán");
    expect(textToRows(text, [AN], voicesInCategory(VOICES, "clone"), rows, text).map((row) => [row.id, row.text])).toEqual([
      ["r1", "Dòng một\ndòng tiếp"], ["r2", "Chưa gán"],
    ]);
  });

  it("reads cells the way Excel and Google Sheets copy them, quoted line breaks included", () => {
    const copied = 'Anh Vũ\tThì trong lúc mà\r\nKhoa Trịnh\t"Được không sao\nEm thì ""không"" sợ"\r\n';
    expect(parseDelimited(copied)).toEqual([["Anh Vũ", "Thì trong lúc mà"], ["Khoa Trịnh", 'Được không sao\nEm thì "không" sợ']]);
  });


  it("keeps raw line breaks inside a row through Text Edit and knows which word ends each line", () => {
    const offered = voicesInCategory(VOICES, "clone");
    const rows: VoiceScriptRow[] = [{ id: "r1", speakerProfileId: "speaker-an", voiceId: "an-clone", text: "Dòng một ,\ndòng hai" }];
    const text = rowsToText(rows, [AN]);
    expect(text).toBe("Anh Vũ: Dòng một ,\ndòng hai");
    expect(textToRows(text, [AN], offered, rows, text)[0].text).toBe("Dòng một ,\ndòng hai");
    expect([...lineBreakWords("Dòng một ,\ndòng hai").keys()]).toEqual([1]);
    expect([...lineBreakWords("\nDòng một\n\ndòng hai\n")]).toEqual([[-1, 1], [1, 2], [3, 1]]);
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

  it("keeps exact timing and original word indexes across grouped legacy rows", () => {
    const output = { id: "o", duration: 6, words: [
      { text: "Xin", start: .2, end: .7, segmentIndex: 0 },
      { text: "chào", start: 1.4, end: 2.2, segmentIndex: 1 },
      { text: "vâng", start: 3, end: 3.5, segmentIndex: 2 },
    ], segments: [
      { rowId: "r1", voiceId: "an-clone", text: "Xin", start: .1, end: .8 },
      { rowId: "r2", voiceId: "an-clone", text: "chào", start: 1.3, end: 2.4 },
      { rowId: "r3", voiceId: "khoa-clone", text: "vâng", start: 2.8, end: 3.8 },
    ] } as unknown as VoiceOutput;
    const grouped: VoiceScriptRow = { id: "r1", voiceId: "an-clone", speakerProfileId: "speaker-an", text: "Xin\nchào", legacyRowIds: ["r1", "r2"] };
    const before = JSON.stringify(output);
    const timings = rowTimings([grouped], output, VOICES);
    expect(timings.get("r1")).toEqual({ start: .1, end: 2.4, firstWord: 0, lastWord: 2, fresh: true });
    expect(rowTimings([{ ...grouped, text: "Xin\nchào nhé" }], output, VOICES).get("r1")?.fresh).toBe(false);
    expect(JSON.stringify(output)).toBe(before);
    // A later Full already has one generated segment under the group's retained ID.
    const full = { ...output, segments: [{ ...output.segments![0], text: "Xin chào", end: 2.4 }], words: output.words!.slice(0, 2).map(word => ({ ...word, segmentIndex: 0 })) };
    expect(rowTimings([grouped], full, VOICES).get("r1")?.fresh).toBe(true);
    // Aliases must never collect nonadjacent source turns across another speaker.
    expect(rowTimings([{ ...grouped, legacyRowIds: ["r1", "r3"], text: "Xin\nvâng" }], output, VOICES).has("r1")).toBe(false);
  });
});
