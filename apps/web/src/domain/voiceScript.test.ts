import { describe, expect, it } from "vitest";

import type { ProjectVoice, SpeakerProfile, VoiceOutput, VoiceScriptRow } from "./types";
import { resolveRowVoice, rowTimings, rowsFromOutput, rowsToText, scriptReadiness, textToRows, voicesInCategory } from "./voiceScript";

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
