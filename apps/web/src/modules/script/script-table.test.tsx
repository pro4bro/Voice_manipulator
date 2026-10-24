import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { assignProfileToTurn, buildSpeakerScriptRows, moveWordsToRow, ScriptSpeakerText } from "./script-table";
import { EMPTY_SELECTION } from "../../domain/word-selection";
import { contrastRatio } from "../../domain/accessible-color";
import type { SpeakerProfile, StudioWord } from "../../domain/types";

const AN: SpeakerProfile = { id: "speaker-an", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#f00", createdAt: "" };
const KHOA: SpeakerProfile = { ...AN, id: "speaker-khoa", name: "Khoa Trịnh", color: "#0f0" };

function word(overrides: Partial<StudioWord> = {}): StudioWord {
  return { text: "xin", start: 0, end: 0.2, ...overrides } as StudioWord;
}

describe("Script rows", () => {
  it("resolves custom diarization heading text against the current word surface", () => {
    document.documentElement.dataset.theme = "light";
    render(<ScriptSpeakerText words={[word({ speakerId: AN.id })]} speakers={[{ ...AN, color: "#eeeeee" }]} activeWordIndex={-1} selection={EMPTY_SELECTION} onSelectionChange={() => undefined} />);
    const label = screen.getByText("Anh Vũ");
    expect(contrastRatio(label.style.color, "#fffdf8")).toBeGreaterThanOrEqual(4.5);
    document.documentElement.removeAttribute("data-theme");
  });

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

  it("does not split rows on ASR speaker labels before diarization", () => {
    const rows = buildSpeakerScriptRows([
      word({ text: "Xin", asrSpeakerId: "speaker-1", start: 0, end: .2, timingTrusted: false }),
      word({ text: "chào", asrSpeakerId: "speaker-2", start: 2, end: 2.2, timingTrusted: false }),
    ], [AN]);
    expect(rows).toHaveLength(1);
    expect(rows[0].words.map(({ word: item }) => item.text)).toEqual(["Xin", "chào"]);
    expect(rows[0].profileId).toBeNull();
  });

  it("keeps a diarized speaker continuous across sentences and silence gaps", () => {
    const rows = buildSpeakerScriptRows([
      word({ text: "Xin", start: 0, end: .2, diarizationSpeakerId: "speaker-1" }),
      word({ text: "chào.", start: 1, end: 1.2, diarizationSpeakerId: "speaker-1" }),
      word({ text: "Bên kia", start: 5, end: 5.4, diarizationSpeakerId: "speaker-2" }),
    ], [AN]);
    expect(rows.map((row) => row.words.map(({ word: item }) => item.text))).toEqual([["Xin", "chào."], ["Bên kia"]]);
  });

  it("says Speaker 1 when no profile is assigned to the file either", () => {
    const rows = buildSpeakerScriptRows([word()], [AN], null);

    expect(rows[0].diarizationLabel).toBe("Speaker 1");
    expect(rows[0].profileId).toBeNull();
  });

  it("splits an interior selection into A, B, A while retaining source labels and timings", () => {
    const words = ["đầu", "giữa", "cuối", "B"].map((text, index) => word({ text, start: index, end: index + 0.4,
      diarizationSpeakerId: index === 3 ? "speaker-2" : "speaker-1" }));
    const target = buildSpeakerScriptRows(words, [])[1];
    const changed = moveWordsToRow(words, [1], target);
    const rows = buildSpeakerScriptRows(changed, []);
    expect(rows.map((row) => [row.diarizationLabel, row.words.map(({ word: item }) => item.text).join(" ")])).toEqual([
      ["Speaker 1", "đầu"], ["Speaker 2", "giữa"], ["Speaker 1", "cuối"], ["Speaker 2", "B"],
    ]);
    expect(changed[1]).toEqual({ ...words[1], speakerId: null, manualDiarizationSpeakerId: "speaker-2" });
    expect(changed[0]).toBe(words[0]);
    expect(changed[2]).toBe(words[2]);
  });

  it.each(["front", "end"] as const)("merges a reassigned %s edge into the adjacent B row", (edge) => {
    const labels = edge === "front" ? ["speaker-2", "speaker-1", "speaker-1"] : ["speaker-1", "speaker-1", "speaker-2"];
    const words = labels.map((diarizationSpeakerId, index) => word({ text: `w${index}`, start: index, end: index + 0.4, diarizationSpeakerId }));
    const target = buildSpeakerScriptRows(words, [])[edge === "front" ? 0 : 1];
    const changed = moveWordsToRow(words, [1], target);
    expect(buildSpeakerScriptRows(changed, []).map((row) => row.words.map(({ index }) => index))).toEqual(
      edge === "front" ? [[0, 1], [2]] : [[0], [1, 2]],
    );
    expect(changed.map((item) => [item.start, item.end])).toEqual(words.map((item) => [item.start, item.end]));
  });
});
