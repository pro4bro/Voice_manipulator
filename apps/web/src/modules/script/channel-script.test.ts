import { expect, it } from "vitest";
import type { ProjectMediaAsset } from "../../domain/types";
import { channelScriptRows } from "./channel-script";

const track = (id: string, words: ProjectMediaAsset["words"], imported = true) =>
  ({ id, name: id, words, text: "", importSelected: imported }) as ProjectMediaAsset;

it("orders imported channel turns by time and splits when speaker labels change", () => {
  const rows = channelScriptRows([
    track("mic", [{ text: "Xin", start: 1, end: 1.3 }, { text: "chào", start: 1.4, end: 1.8 },
      { text: "Tôi", start: 5, end: 5.3, diarizationSpeakerId: "speaker-1" },
      { text: "đây", start: 5.4, end: 5.8, diarizationSpeakerId: "speaker-2" }]),
    track("desk", [{ text: "Vâng", start: 3, end: 3.5 }]),
    track("hidden", [{ text: "Bỏ", start: 2, end: 2.5 }], false),
  ]);
  expect(rows.map((row) => [row.trackId, row.text, row.speakerId])).toEqual([
    ["mic", "Xin chào", null], ["desk", "Vâng", null], ["mic", "Tôi", "speaker-1"], ["mic", "đây", "speaker-2"],
  ]);
});

it("keeps one channel row through silence, then starts a new row only after another channel speaks", () => {
  const rows = channelScriptRows([
    track("mic", [{ text: "Xin", start: 1, end: 1.2 }, { text: "chào", start: 30, end: 30.3 },
      { text: "tiếp", start: 50, end: 50.3 }]),
    track("desk", [{ text: "Vâng", start: 40, end: 40.4 }]),
  ]);
  expect(rows.map((row) => [row.trackId, row.text])).toEqual([
    ["mic", "Xin chào"], ["desk", "Vâng"], ["mic", "tiếp"],
  ]);
});

it("starts a new row when a different diarized speaker interrupts the same channel", () => {
  const rows = channelScriptRows([track("mic", [
    { text: "Một", start: 1, end: 1.3, diarizationSpeakerId: "speaker-1" },
    { text: "người", start: 20, end: 20.3, diarizationSpeakerId: "speaker-1" },
    { text: "Hai", start: 30, end: 30.3, diarizationSpeakerId: "speaker-2" },
    { text: "tiếp", start: 40, end: 40.3, diarizationSpeakerId: "speaker-1" },
  ])]);
  expect(rows.map((row) => [row.speakerId, row.text])).toEqual([
    ["speaker-1", "Một người"], ["speaker-2", "Hai"], ["speaker-1", "tiếp"],
  ]);
});

it("keeps a manually assigned speaker profile together across raw diarization labels", () => {
  const rows = channelScriptRows([track("mic", [
    { text: "Cùng", start: 1, end: 1.2, speakerId: "owner", diarizationSpeakerId: "speaker-1" },
    { text: "người", start: 20, end: 20.2, speakerId: "owner", diarizationSpeakerId: "speaker-2" },
  ])]);
  expect(rows.map((row) => row.text)).toEqual(["Cùng người"]);
});
