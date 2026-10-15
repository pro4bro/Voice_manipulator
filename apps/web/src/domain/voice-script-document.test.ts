import { describe, expect, it } from "vitest";
import { effectiveScriptSettings, joinScriptSentences, migrateScript, splitScriptSentence } from "./voice-script-document";

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
