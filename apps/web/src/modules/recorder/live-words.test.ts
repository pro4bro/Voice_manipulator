import { describe, expect, it } from "vitest";

import { liveTranscriptWords } from "./live-words";

describe("liveTranscriptWords", () => {
  it("spreads a phrase across the time it was being spoken", () => {
    const words = liveTranscriptWords([{ text: "Xin chào bạn", endedAt: 3.35 }], 10);
    expect(words.map((word) => word.text)).toEqual(["Xin", "chào", "bạn"]);
    expect(words[0].start).toBe(0);
    expect(words[words.length - 1].end).toBeCloseTo(3, 2);
  });

  it("never claims these timings are measured", () => {
    const [word] = liveTranscriptWords([{ text: "Xin", endedAt: 1 }], 10);
    expect(word.timingTrusted).toBe(false);
    expect(word.timingSource).toBe("live-speech");
  });

  it("starts each phrase where the one before it ended", () => {
    const words = liveTranscriptWords([
      { text: "Xin chào", endedAt: 2.35 },
      { text: "các bạn", endedAt: 5.35 },
    ], 10);
    expect(words[1].end).toBeCloseTo(2, 2);
    expect(words[2].start).toBeCloseTo(2, 2);
    expect(words.every((word, at) => at === 0 || word.start >= words[at - 1].end - 1e-9)).toBe(true);
  });

  it("keeps every word inside the recording", () => {
    const words = liveTranscriptWords([{ text: "Xin chào", endedAt: 99 }], 4);
    expect(words[words.length - 1].end).toBeLessThanOrEqual(4);
  });

  it("has nothing to say about silence", () => {
    expect(liveTranscriptWords([], 10)).toEqual([]);
    expect(liveTranscriptWords([{ text: "   ", endedAt: 2 }], 10)).toEqual([]);
  });
});
