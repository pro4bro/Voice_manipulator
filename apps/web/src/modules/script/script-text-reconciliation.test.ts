import { describe, expect, it } from "vitest";
import type { StudioWord } from "../../domain/types";
import { insertScriptTextAtWordBoundary, reconcileScriptTextEdit, replaceScriptWord, replaceScriptWordAtTime } from "./script-text-reconciliation";

describe("script text timing reconciliation", () => {
  it("preserves untouched word objects and timing while estimating inserted words between them", () => {
    const before: StudioWord[] = [
      { text: "Xin", start: 1, end: 1.2, timingSource: "faster-whisper-dtw", timingTrusted: true, speakerId: "lan", emotion: "good" },
      { text: "chào", start: 1.4, end: 1.65, timingSource: "faster-whisper-dtw", timingTrusted: true, speakerId: "lan" },
    ];

    const result = reconcileScriptTextEdit("Xin chào", "Xin bạn nhé chào", before);

    expect(result.words[0]).toBe(before[0]);
    expect(result.words[3]).toBe(before[1]);
    expect(result.words.slice(1, 3).map(({ text }) => text)).toEqual(["bạn", "nhé"]);
    expect(result.words[1].start).toBeLessThan(result.words[1].end);
    expect(result.words[1].end + 0.009).toBeLessThanOrEqual(result.words[2].start);
    expect(result.words[2].end).toBeLessThan(result.words[3].start);
    expect(result.words.slice(1, 3).every((word) => word.timingSource === "user-interpolated" && word.timingTrusted === false)).toBe(true);
    expect(result.words.slice(1, 3).every((word) => word.speakerId === undefined && word.emotion === undefined)).toBe(true);
    expect(result.changedWordIndexes).toEqual([1, 2]);
  });

  it("drops deleted words and their timing instead of shifting timing onto a different word", () => {
    const before: StudioWord[] = [
      { text: "Xin", start: 0, end: 0.2 },
      { text: "sai", start: 0.2, end: 0.5 },
      { text: "chào", start: 0.5, end: 0.8 },
    ];
    const result = reconcileScriptTextEdit("Xin sai chào", "Xin chào", before);
    expect(result.words).toEqual([before[0], before[2]]);
    expect(result.words.some((word) => word.start === 0.2)).toBe(false);
  });

  it("keeps corrected orthography attached to the original timed word", () => {
    const before: StudioWord[] = [{ text: "toi", start: 0.3, end: 0.7, speakerId: "vu" }];
    const result = reconcileScriptTextEdit("toi", "tôi", before);
    expect(result.words).toEqual([{ ...before[0], text: "tôi", reviewState: "manual", selectedVariant: "manual" }]);
    expect(result.words[0].start).toBe(0.3);
    expect(result.words[0].timingSource).toBeUndefined();
  });

  it("uses the explicit word index when replacing one of two identical words", () => {
    const before: StudioWord[] = [
      { text: "rồi", start: 0.1, end: 0.3 },
      { text: "rồi", start: 1.1, end: 1.3 },
      { text: "đi", start: 1.4, end: 1.6 },
    ];
    const result = replaceScriptWord("rồi rồi đi", 1, "về", before);
    expect(result.text).toBe("rồi về đi");
    expect(result.words[0]).toBe(before[0]);
    expect(result.words[1]).toMatchObject({ text: "về", timingSource: "user-interpolated", timingTrusted: false });
    expect(result.words[2]).toBe(before[2]);
  });

  it("inserts subtitle text at an explicit word boundary with a provisional chosen time", () => {
    const before: StudioWord[] = [{ text: "Xin", start: 1, end: 1.2 }, { text: "chào", start: 1.4, end: 1.6 }];
    const result = insertScriptTextAtWordBoundary("Xin chào", 1, "bạn nhé", before, 1.31);
    expect(result.text).toBe("Xin bạn nhé chào");
    expect(result.words[0]).toBe(before[0]);
    expect(result.words.slice(1, 3).map((word) => word.text)).toEqual(["bạn", "nhé"]);
    expect(result.words.slice(1, 3).every((word) => word.start === 1.31 && word.end === 1.31 && word.timingTrusted === false)).toBe(true);
    expect(result.words[3]).toBe(before[1]);
  });

  it("replaces a known word with a provisional zero-duration interval at the selected time", () => {
    const result = replaceScriptWordAtTime("rồi rồi đi", 1, "về", [
      { text: "rồi", start: 0.1, end: 0.3 },
      { text: "rồi", start: 1.1, end: 1.3 },
      { text: "đi", start: 1.4, end: 1.6 },
    ], 1.22);
    expect(result.words[1]).toMatchObject({ text: "về", start: 1.22, end: 1.22, timingSource: "user-interpolated", timingTrusted: false });
  });

  it("does not invent endpoint timing when inserted words lack two anchors", () => {
    const result = reconcileScriptTextEdit("Xin", "Thưa Xin", [{ text: "Xin", start: 3, end: 3.2 }]);
    expect(result.words[0]).toMatchObject({ text: "Thưa", start: 0, end: 0, timingSource: "user-interpolated", timingTrusted: false });
  });
});
