import { describe, expect, it } from "vitest";

import type { ObsLiveLinkTranscriptEvent } from "../../domain/types";
import { mergeObsTranscriptRows, obsTranscriptText } from "./obs-transcript-feed";

const event = (revision: number, channelId: string, utteranceId: string,
               startSeconds: number, status: ObsLiveLinkTranscriptEvent["status"],
               text = "", pending = ""): ObsLiveLinkTranscriptEvent => ({
  schemaVersion: 1, eventRevision: revision, recordingId: "recording", channelId,
  sourceUuid: `source-${channelId}`, alias: `Channel ${channelId}`,
  utteranceId, revision: 1, firstSampleIndex: startSeconds * 48000,
  lastSampleIndexExclusive: (startSeconds + 1) * 48000, sampleRate: 48000,
  startSeconds, endSeconds: startSeconds + 1, status, text, pending,
  timingTrust: "segment", lagSeconds: 0.1, error: null,
});

describe("OBS channel transcript rows", () => {
  it("keeps A→B→A order and updates simultaneous turns in place", () => {
    const first = event(1, "A", "a-1", 1, "listening");
    const second = event(2, "B", "b-1", 1.5, "listening");
    const aPartial = { ...event(4, "A", "a-1", 1, "partial", "Xin", "chào"), revision: 2 };
    const bPartial = { ...event(3, "B", "b-1", 1.5, "partial", "Vâng"), revision: 2 };
    const aFinal = { ...event(5, "A", "a-1", 1, "final", "Xin chào"), revision: 3 };
    const third = event(6, "A", "a-2", 4, "listening");
    const rows = mergeObsTranscriptRows([], [third, aFinal, bPartial, first, aPartial, second]);
    expect(rows.map((row) => row.utteranceId)).toEqual(["a-1", "b-1", "a-2"]);
    expect(rows.map((row) => row.channelId)).toEqual(["A", "B", "A"]);
    expect(obsTranscriptText(rows[0])).toBe("Xin chào");
    expect(obsTranscriptText(rows[1])).toBe("Vâng");
    expect(rows[2].status).toBe("listening");
    expect(mergeObsTranscriptRows(rows, [first, aPartial, second])).toEqual(rows);
  });

  it("keeps source identity and draft text through alias and error revisions", () => {
    const listening = event(1, "A", "a-1", 0, "listening");
    const partial = { ...event(2, "A", "a-1", 0, "partial", "Lời nháp"), revision: 2 };
    const error = { ...event(3, "A", "a-1", 0, "error"), revision: 3,
      alias: "Mic mới", error: "model busy" };
    const rows = mergeObsTranscriptRows([], [listening, partial, error]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channelId: "A", sourceUuid: "source-A", alias: "Mic mới",
      text: "Lời nháp", revision: 3, status: "error" });
  });
});
