import { describe, expect, it } from "vitest";

import { assignProfileToTurn, buildSpeakerScriptRows } from "./script-table";
import type { SpeakerProfile, StudioWord } from "../../domain/types";

const AN: SpeakerProfile = { id: "speaker-an", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#f00", createdAt: "" };
const KHOA: SpeakerProfile = { ...AN, id: "speaker-khoa", name: "Khoa Trịnh", color: "#0f0" };

function word(overrides: Partial<StudioWord> = {}): StudioWord {
  return { text: "xin", start: 0, end: 0.2, ...overrides } as StudioWord;
}

describe("Script rows", () => {
  it("keeps explicit and inherited identities of the same speaker in one row", () => {
    const rows = buildSpeakerScriptRows([word(), word({ speakerId: "speaker-an" }), word()], [AN], "speaker-an");
    expect(rows).toHaveLength(1);
    expect(rows[0].words).toHaveLength(3);
  });
  it("reads a take nobody tagged as the profile the file is assigned to", () => {
    const rows = buildSpeakerScriptRows([word(), word({ text: "chào", start: 0.2, end: 0.4 })], [AN], "speaker-an");

    expect(rows).toHaveLength(1);
    expect(rows[0].diarizationLabel).toBe("Anh Vũ");
    expect(rows[0].profileId).toBe("speaker-an");
  });

  it("keeps an explicit unassignment distinct from words that inherit the take profile", () => {
    const cleared = buildSpeakerScriptRows([word({ speakerId: null })], [AN], "speaker-an");
    const inherited = buildSpeakerScriptRows([word()], [AN], "speaker-an");
    expect(cleared[0].profileId).toBeNull();
    expect(inherited[0].profileId).toBe("speaker-an");
    expect(assignProfileToTurn([word({ speakerId: "speaker-an" })], [0], null)[0].speakerId).toBeNull();
  });

  it("leaves words their own speaker, and keeps diarization turns apart", () => {
    const rows = buildSpeakerScriptRows([
      word({ speakerId: "speaker-khoa" }),
      word({ text: "chào", start: 0.2, end: 0.4, diarizationSpeakerId: "speaker-2" }),
    ], [AN, KHOA], "speaker-an");

    expect(rows.map((row) => row.diarizationLabel)).toEqual(["Khoa Trịnh", "Speaker 2"]);
  });

  it("says Speaker 1 when no profile is assigned to the file either", () => {
    const rows = buildSpeakerScriptRows([word()], [AN], null);

    expect(rows[0].diarizationLabel).toBe("Speaker 1");
    expect(rows[0].profileId).toBeNull();
  });
});
