import { expect, it } from "vitest";
import type { ObsLiveLinkTranscriptRow } from "../../domain/types";
import { archiveTranscriptGaps } from "./archive-transcript-gaps";

it("retains segment-level realtime text for a missing detailed-word span without creating words", () => {
  const words = [{ text: "trước", start: 239.99, end: 240.352 }, { text: "sau", start: 269.02, end: 271 }];
  const row = { status: "final", text: "lời realtime trong đoạn", startSeconds: 245.326, endSeconds: 301.156 } as ObsLiveLinkTranscriptRow;
  const gaps = archiveTranscriptGaps(words, [row]);
  expect(gaps[0]).toEqual({ start: 245.326, end: 269.02, row });
  expect(words).toHaveLength(2);
  expect(archiveTranscriptGaps(words, [{ ...row, status: "partial" }])).toEqual([]);
  expect(archiveTranscriptGaps([{ text: "đủ", start: 245, end: 302 }], [row])).toEqual([]);
});

it("does not treat user-estimated timing as verified detailed-word coverage", () => {
  const row = { status: "final", text: "realtime", startSeconds: 0, endSeconds: 10 } as ObsLiveLinkTranscriptRow;
  expect(archiveTranscriptGaps([{ text: "ước lượng", start: 4, end: 6, timingTrusted: false }], [row]))
    .toEqual([{ start: 0, end: 10, row }]);
});
