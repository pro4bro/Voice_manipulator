import { describe, expect, it } from "vitest";

import type { ObsLiveLinkTranscriptRow } from "../../domain/types";
import { obsOverlapAt, obsOverlapByUtterance, obsOverlapTime } from "./obs-overlap";
import { mergeObsTranscriptRows } from "./obs-transcript-feed";

const row = (utteranceId: string, channelId: string, startSeconds: number,
             endSeconds: number, revision = 1): ObsLiveLinkTranscriptRow => ({
  schemaVersion: 1, eventRevision: revision, firstEventRevision: revision,
  recordingId: "recording", channelId, sourceUuid: `source-${channelId}`,
  alias: channelId, utteranceId, revision,
  firstSampleIndex: Math.round(startSeconds * 48000),
  lastSampleIndexExclusive: Math.round(endSeconds * 48000), sampleRate: 48000,
  startSeconds, endSeconds, status: "partial", text: utteranceId, pending: "",
  timingTrust: "segment", lagSeconds: 0, error: null,
});

describe("OBS cross-channel overlap", () => {
  it("marks only the shared portion on both sources and stops at A's end", () => {
    const overlaps = obsOverlapByUtterance([row("a", "A", 1, 5), row("b", "B", 2, 8)]);
    expect(overlaps.get("a")).toEqual([{ startSeconds: 2, endSeconds: 5, otherChannelIds: ["B"] }]);
    expect(overlaps.get("b")).toEqual([{ startSeconds: 2, endSeconds: 5, otherChannelIds: ["A"] }]);
    expect(obsOverlapAt(overlaps.get("b")!, 4.999)).toBe(true);
    expect(obsOverlapAt(overlaps.get("b")!, 5)).toBe(false);
  });

  it("handles full containment, reversed order, late revisions and A→B→A", () => {
    const a = row("a1", "A", 0, 6);
    const b = row("b1", "B", 2, 4);
    const a2 = row("a2", "A", 7, 9);
    const expected = obsOverlapByUtterance([a, b, a2]);
    expect(expected.get("b1")).toEqual([{ startSeconds: 2, endSeconds: 4, otherChannelIds: ["A"] }]);
    expect(expected.has("a2")).toBe(false);
    expect(obsOverlapByUtterance([a2, { ...b, revision: 4, text: "late" }, a])).toEqual(expected);
  });

  it("ignores touching boundaries, same-channel speech, other recordings and untrusted timing", () => {
    const a = row("a", "A", 1, 2);
    expect(obsOverlapByUtterance([a, row("b", "B", 2, 3)]).size).toBe(0);
    expect(obsOverlapByUtterance([a, row("b", "A", 1.5, 3)]).size).toBe(0);
    expect(obsOverlapByUtterance([a, { ...row("b", "B", 1.5, 3), recordingId: "other" }]).size).toBe(0);
    expect(obsOverlapByUtterance([a, { ...row("b", "B", 1.5, 3), timingTrust: "none" }]).size).toBe(0);
    expect(obsOverlapByUtterance([a, { ...row("b", "B", 1.5, 3), lastSampleIndexExclusive: 0 }]).size).toBe(0);
  });

  it("unions simultaneous peers without duplicating a review marker", () => {
    const overlaps = obsOverlapByUtterance([
      row("a", "A", 1, 6), row("b", "B", 2, 4), row("c", "C", 3, 5),
    ]);
    expect(overlaps.get("a")).toEqual([{ startSeconds: 2, endSeconds: 5, otherChannelIds: ["B", "C"] }]);
    expect(obsOverlapTime(61.999)).toBe("01:02.00");
  });

  it("adds overlap when a delayed partial extends a listening row, without duplicating that row", () => {
    const a = row("a", "A", 1, 5);
    const listening = { ...row("b", "B", 2, 3, 1), status: "listening" as const,
      eventRevision: 2, endSeconds: 2, lastSampleIndexExclusive: 2 * 48000, text: "" };
    const first = mergeObsTranscriptRows([], [a, listening]);
    expect(first).toHaveLength(2);
    expect(obsOverlapByUtterance(first).size).toBe(0);
    const delayed = { ...listening, status: "partial" as const, revision: 2,
      eventRevision: 3, endSeconds: 7, lastSampleIndexExclusive: 7 * 48000, text: "B chen vào" };
    const revised = mergeObsTranscriptRows(first, [delayed]);
    expect(revised).toHaveLength(2);
    expect(obsOverlapByUtterance(revised).get("b")).toEqual([
      { startSeconds: 2, endSeconds: 5, otherChannelIds: ["A"] },
    ]);
  });
});
