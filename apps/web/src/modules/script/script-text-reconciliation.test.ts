import { describe, expect, it } from "vitest";
import type { StudioWord } from "../../domain/types";
import { deleteScriptWords, insertScriptTextAtWordBoundary, reconcileScriptTextEdit, replaceScriptWord, replaceScriptWordAtTime } from "./script-text-reconciliation";

describe("script text timing reconciliation", () => {
  it("bulk deletes repeated and noncontiguous words without changing surviving punctuation or timing", () => {
    const before = [{ text: "xin", start: 1, end: 2 }, { text: "xin", start: 3, end: 4 }, { text: "chào", start: 5, end: 6 }, { text: "bạn", start: 7, end: 8 }];
    const result = deleteScriptWords('“xin,” xin\nchào! bạn.', [2, 0, 2], before)!;
    expect(result.text).toBe("xin\nbạn.");
    expect(result.words).toEqual([before[1], before[3]]);
    expect(result.words[0]).toBe(before[1]); expect(result.words[1]).toBe(before[3]);
  });
  it("rejects an unmapped bulk deletion atomically and can remove the entire transcript", () => {
    const before = [{ text: "xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }];
    expect(deleteScriptWords("xin", [0, 1], before)).toBeNull();
    expect(deleteScriptWords("xin chào", [0, 1], before)).toEqual({ text: "", words: [], changedWordIndexes: [] });
    expect(deleteScriptWords("xin chào", [], before)?.words).toBe(before);
  });
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
    expect(result.words).toEqual([{ ...before[0], text: "tôi", timingSource: "user-text-preserved", timingTrusted: false,
      sourceTiming: { start: 0.3, end: 0.7 }, reviewState: "manual", selectedVariant: "manual" }]);
    expect(result.words[0].start).toBe(0.3);
    expect(result.words[0].end).toBe(0.7);
  });

  it("preserves punctuation on untouched words when another word changes", () => {
    const before: StudioWord[] = [
      { text: "mới.", start: 0.1, end: 0.3 },
      { text: "toi", start: 0.4, end: 0.7 },
    ];
    const result = reconcileScriptTextEdit("mới. toi", "mới. tôi", before);
    expect(result.words[0]).toBe(before[0]);
    expect(result.words[0].text).toBe("mới.");
    expect(result.words[1]).toMatchObject({ text: "tôi", reviewState: "manual", selectedVariant: "manual" });
    expect(result.changedWordIndexes).toEqual([1]);
  });

  it("marks case edits as manual while retaining punctuation from the same word", () => {
    const before: StudioWord[] = [{ text: "Mới.", start: 0.1, end: 0.3 }];
    const result = reconcileScriptTextEdit("Mới.", "mới.", before);
    expect(result.words[0]).toMatchObject({ text: "mới.", reviewState: "manual", selectedVariant: "manual" });
    expect(result.changedWordIndexes).toEqual([0]);
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
    expect(result.words[1]).toMatchObject({ text: "về", start: 1.1, end: 1.3,
      timingSource: "user-text-preserved", timingTrusted: false,
      sourceTiming: { start: 1.1, end: 1.3 } });
    expect(result.words[2]).toBe(before[2]);
  });

  it("partitions a known replacement only across its original interval, including a retained prefix token", () => {
    const before: StudioWord[] = [
      { text: "giữ", start: 1, end: 1.2, speakerId: "lan" },
      { text: "một", start: 2, end: 2.4, timingSource: "recognizer", timingTrusted: true, speakerId: "minh" },
      { text: "sau", start: 7.6, end: 8, speakerId: "lan" },
    ];
    const result = replaceScriptWord("giữ một sau", 1, "một từ mới", before);

    expect(result.text).toBe("giữ một từ mới sau");
    expect(result.words[0]).toBe(before[0]);
    expect(result.words.slice(1, 4).map(({ text }) => text)).toEqual(["một", "từ", "mới"]);
    expect(result.words[1].start).toBe(2);
    expect(result.words[3].end).toBe(2.4);
    expect(result.words[1].end).toBe(result.words[2].start);
    expect(result.words[2].end).toBe(result.words[3].start);
    expect(result.words.slice(1, 4).every((word) => word.timingTrusted === false && word.timingSource === "user-text-preserved" && word.speakerId === "minh" && word.reviewState === "manual" && word.selectedVariant === "manual")).toBe(true);
    expect(result.words.slice(1, 4).every((word) => word.sourceTiming?.start === 2 && word.sourceTiming?.end === 2.4 && word.sourceTiming.source === "recognizer")).toBe(true);
    expect(result.words[4]).toBe(before[2]);
  });

  it("keeps an unchanged known replacement as a no-op", () => {
    const before: StudioWord[] = [{ text: "toi", start: 1, end: 1.4, timingTrusted: true }];
    const result = replaceScriptWord("toi", 0, "toi", before);
    expect(result).toEqual({ text: "toi", words: before, changedWordIndexes: [] });
  });

  it("keeps native unambiguous one-word expansions inside the removed word span", () => {
    const before: StudioWord[] = [
      { text: "trước", start: 1, end: 1.2 },
      { text: "cũ", start: 2, end: 2.4, speakerId: "speaker-1" },
      { text: "sau", start: 7.6, end: 8 },
    ];
    const result = reconcileScriptTextEdit("trước cũ sau", "trước hoàn toàn mới sau", before);
    expect(result.words[0]).toBe(before[0]);
    expect(result.words.slice(1, 4).map(({ text }) => text)).toEqual(["hoàn", "toàn", "mới"]);
    expect(result.words[1].start).toBe(2);
    expect(result.words[3].end).toBe(2.4);
    expect(result.words.slice(1, 4).every((word) => word.timingSource === "user-text-preserved" && word.timingTrusted === false && word.speakerId === "speaker-1")).toBe(true);
    expect(result.words[4]).toBe(before[2]);
  });

  it("deletes the indexed copy of a repeated word and keeps the other copy's timing", () => {
    const before: StudioWord[] = [
      { text: "xin", start: 0.1, end: 0.3 },
      { text: "xin", start: 1.1, end: 1.3 },
      { text: "chào", start: 1.4, end: 1.6 },
    ];
    const result = replaceScriptWord("xin xin chào", 0, "", before);
    expect(result.words).toEqual([before[1], before[2]]);
    expect(result.words[0].start).toBe(1.1);
  });

  it("inserts subtitle text at an explicit word boundary with a provisional chosen time", () => {
    const before: StudioWord[] = [{ text: "Xin", start: 1, end: 1.2 }, { text: "chào", start: 1.4, end: 1.6 }];
    const result = insertScriptTextAtWordBoundary("Xin chào", 1, "bạn nhé", before, 1.31);
    expect(result.text).toBe("Xin bạn nhé chào");
    expect(result.words[0]).toBe(before[0]);
    expect(result.words.slice(1, 3).map((word) => word.text)).toEqual(["bạn", "nhé"]);
    expect(result.words[1].start).toBe(1.31);
    expect(result.words.slice(1, 3).every((word) => word.end > word.start && word.timingTrusted === false)).toBe(true);
    expect(result.words[1].end).toBeLessThan(result.words[2].start);
    expect(result.words[2].end).toBeLessThan(before[1].start);
    expect(result.words[3]).toBe(before[1]);
  });
  it("keeps repeated neighbouring identities intact even when the insertion gap is tiny", () => {
    const before: StudioWord[] = [{ text: "rồi", start: 1, end: 2, speakerId: "a" }, { text: "rồi", start: 2.0001, end: 3, speakerId: "b" }];
    const result = insertScriptTextAtWordBoundary("rồi rồi", 1, "rồi rồi", before, 2.00005, 10);
    expect(result.text).toBe("rồi rồi rồi rồi");
    expect(result.changedWordIndexes).toEqual([1, 2]);
    expect(result.words[0]).toBe(before[0]); expect(result.words[3]).toBe(before[1]);
    expect(result.words[1].start).toBeGreaterThanOrEqual(2);
    expect(result.words[1].end).toBeGreaterThan(result.words[1].start);
    expect(result.words[1].end).toBeLessThan(result.words[2].start);
    expect(result.words[2].end).toBeLessThan(2.0001);
  });
  it("rejects insertion between touching anchors instead of moving either old word", () => {
    const before: StudioWord[] = [{ text: "xin", start: 1, end: 2 }, { text: "chào", start: 2, end: 3 }];
    const result = insertScriptTextAtWordBoundary("xin chào", 1, "mới", before, 1.5, 10);
    expect(result).toEqual({ text: "xin chào", words: before, changedWordIndexes: [] });
  });

  it.each([2.2, 3.8])("inherits the nearest speaker row at %s without changing existing anchors", (time) => {
    const before: StudioWord[] = [{ text: "one", start: 1, end: 2, speakerId: null, manualDiarizationSpeakerId: "speaker-2" },
      { text: "two", start: 4, end: 5, speakerId: "s", diarizationSpeakerId: "speaker-3", segmentIndex: 2 }];
    const result = insertScriptTextAtWordBoundary("one two", 1, "new", before, time, 10);
    expect(result.words[0]).toBe(before[0]); expect(result.words[2]).toBe(before[1]);
    expect(result.words[1]).toMatchObject(time < 3 ? { speakerId: null, manualDiarizationSpeakerId: "speaker-2" }
      : { speakerId: "s", diarizationSpeakerId: "speaker-3", segmentIndex: 2 });
    expect(result.words[1].timingTrusted).toBe(false);
  });

  it("replaces a known word with a positive provisional interval at the selected time", () => {
    const result = replaceScriptWordAtTime("rồi rồi đi", 1, "về", [
      { text: "rồi", start: 0.1, end: 0.3 },
      { text: "rồi", start: 1.1, end: 1.3 },
      { text: "đi", start: 1.4, end: 1.6 },
    ], 1.22);
    expect(result.words[1]).toMatchObject({ text: "về", start: 1.22, timingSource: "user-interpolated", timingTrusted: false });
    expect(result.words[1].end).toBeGreaterThan(result.words[1].start);
    expect(result.words[1].end).toBeLessThan(1.4);
  });

  it("keeps endpoint estimates positive and explicitly untrusted", () => {
    const result = reconcileScriptTextEdit("Xin", "Thưa Xin", [{ text: "Xin", start: 3, end: 3.2 }]);
    expect(result.words[0]).toMatchObject({ text: "Thưa", start: 0, timingSource: "user-interpolated", timingTrusted: false });
    expect(result.words[0].end).toBeGreaterThan(0);
    expect(result.words[0].end).toBeLessThan(3);
  });
});
