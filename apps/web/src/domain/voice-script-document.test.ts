import { describe, expect, it } from "vitest";
import { effectiveScriptSettings, groupLegacyScript, joinScriptSentences, migrateScript, splitScriptSentence } from "./voice-script-document";

describe("portable Script intent", () => {
  it("migrates legacy rows without changing identity and resolves sentence overrides and ancestor locks", () => {
    const doc = migrateScript([{ id: "r1", text: "Xin chào.", speakerProfileId: "s", voiceId: "v" }]);
    doc.settings = { duration: 8, emotion: "happy", locked: ["emotion"] };
    doc.segments[0].settings = { duration: 4, gainDb: -3 };
    doc.rows[0].settings = { duration: 2, emotion: "sad" };
    expect(effectiveScriptSettings(doc, doc.rows[0])).toMatchObject({ duration: 2, emotion: "happy", gainDb: -3 });
    expect(doc.rows[0].id).toBe("r1");
    expect(migrateScript(doc.rows, doc)).toEqual(doc);
  });

  it("groups compatible legacy turns without mutating them and preserves their source identities", () => {
    const legacy = migrateScript([
      { id: "r1", text: "first\nline", speakerProfileId: "s", voiceId: "v", segmentId: "seg1", originIds: ["source-1"], tags: ["a"], legacyRowIds: [], settings: { emotion: "happy", mood: "calm", locked: ["emotion", "mood"] } },
      { id: "r2", text: "second", speakerProfileId: "s", voiceId: "v", segmentId: "seg2", originIds: ["source-2"], tags: ["b"], settings: { locked: ["mood", "emotion"], mood: "calm", emotion: "happy" } },
    ], { version: 1, revision: 4, settings: {}, segments: [
      { id: "seg1", name: "First segment", settings: {} }, { id: "seg2", name: "Second segment", settings: {} },
    ], rows: [], turnGroupingVersion: 0 });

    const grouped = groupLegacyScript(legacy);

    expect(grouped.rows).toHaveLength(1);
    expect(grouped.rows[0]).toMatchObject({ id: "r1", segmentId: "seg1", text: "first\nline\nsecond", originIds: ["source-1", "source-2"], tags: ["a", "b"], legacyRowIds: ["r1", "r2"] });
    expect(grouped.turnGroupingVersion).toBe(1);
    expect(legacy.rows.map((row) => [row.id, row.text])).toEqual([["r1", "first\nline"], ["r2", "second"]]);
    expect(groupLegacyScript(grouped)).toBe(grouped);
  });

  it("groups consecutive explicit voice turns only, not unknown turns or A-B-A speakers", () => {
    const legacy = migrateScript([
      { id: "v1", text: "voice line 1", speakerProfileId: null, voiceId: "v" },
      { id: "v2", text: "voice line 2", speakerProfileId: null, voiceId: "v" },
      { id: "u1", text: "unknown 1", speakerProfileId: null, voiceId: null },
      { id: "u2", text: "unknown 2", speakerProfileId: null, voiceId: null },
      { id: "a1", text: "A1", speakerProfileId: "a", voiceId: "va" },
      { id: "b", text: "B", speakerProfileId: "b", voiceId: "vb" },
      { id: "a2", text: "A2", speakerProfileId: "a", voiceId: "va" },
    ], { version: 1, revision: 0, settings: {}, segments: [], rows: [], turnGroupingVersion: 0 });
    const grouped = groupLegacyScript(legacy);
    expect(grouped.rows.map((row) => [row.id, row.text])).toEqual([
      ["v1", "voice line 1\nvoice line 2"], ["u1", "unknown 1"], ["u2", "unknown 2"],
      ["a1", "A1"], ["b", "B"], ["a2", "A2"],
    ]);
  });

  it("keeps rows separate when effective settings or duration conflict or the joined text exceeds the limit", () => {
    const rows = [
      { id: "mood1", text: "one", speakerProfileId: "s", voiceId: "v", settings: { emotion: "happy" } },
      { id: "mood2", text: "two", speakerProfileId: "s", voiceId: "v", settings: { emotion: "sad" } },
      { id: "duration1", text: "three", speakerProfileId: "s", voiceId: "v", settings: { duration: 2 } },
      { id: "duration2", text: "four", speakerProfileId: "s", voiceId: "v", settings: { duration: 2 } },
      { id: "long1", text: "x".repeat(4999), speakerProfileId: "s", voiceId: "v" },
      { id: "long2", text: "y", speakerProfileId: "s", voiceId: "v" },
    ];
    const legacy = migrateScript(rows, { version: 1, revision: 0, settings: {}, segments: [], rows: [], turnGroupingVersion: 0 });
    expect(groupLegacyScript(legacy).rows.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });

  it("keeps later manual rows separate after the legacy grouping marker is set", () => {
    const document = migrateScript([
      { id: "r1", text: "old 1", speakerProfileId: "s", voiceId: "v" },
      { id: "r2", text: "old 2", speakerProfileId: "s", voiceId: "v" },
    ], { version: 1, revision: 0, settings: {}, segments: [], rows: [], turnGroupingVersion: 0 });
    const grouped = groupLegacyScript(document);
    const withManualRow = migrateScript([...grouped.rows, { id: "manual", text: "intentional", speakerProfileId: "s", voiceId: "v" }], grouped);
    expect(groupLegacyScript(withManualRow).rows.map((row) => row.id)).toEqual(["r1", "manual"]);
  });
  it.each([ ["vi", "Xin chào. Anh khỏe không?"], ["en", "Hello. How are you?"], ["zh", "你好。你好吗？"], ["ja", "こんにちは。元気ですか？"], ["ko", "안녕하세요. 잘 지내세요?"] ])("splits %s preserving text, tags and provenance", (locale, text) => {
    const row = { id: "r1", text, segmentId: "seg", speakerProfileId: "s", voiceId: "v", settings: { emotion: "happy" }, tags: ["review"] };
    const parts = splitScriptSentence(row, locale);
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts[0].id).toBe(row.id);
    expect(new Set(parts.map((part) => part.id)).size).toBe(2);
    expect(joinScriptSentences(parts[0], parts[1])).toMatchObject({ id: "r1", text, tags: ["review"], originIds: ["r1"] });
    expect(() => joinScriptSentences(parts[0], { ...parts[1], voiceId: "other" })).toThrow();
  });
});
