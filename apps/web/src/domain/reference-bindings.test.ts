import { expect, it } from "vitest";
import { captureReferenceTargets } from "./reference-bindings";
import { migrateScript } from "./voice-script-document";
import type { VoiceOutput } from "./types";

it("captures each untimed sentence and exact UTF16 text selection independently", () => {
  const script = migrateScript([{ id: "r1", text: "Hello 🙂 world.", voiceId: null, speakerProfileId: null }, { id: "r2", text: "你好。", voiceId: null, speakerProfileId: null }]);
  const targets = captureReferenceTargets({ indexes: [], anchor: null, rowIds: ["r1", "r2"], textRanges: [{ rowId: "r1", start: 6, end: 8 }], scope: { kind: "script", id: "p", revision: "1" } }, null, script);
  expect(targets.map((target) => [target.rowIds, target.text, target.start])).toEqual([[["r1"], "🙂", null], [["r2"], "你好。", null]]);
});

it("keeps silent and disjoint timed targets, filters words per target and rejects a different output", () => {
  const output = { id: "out", createdAt: "revision", words: [{ text: "One", start: 1, end: 2 }, { text: "Two", start: 7, end: 8 }] } as VoiceOutput;
  const selection = { indexes: [0, 1], anchor: 1, ranges: [{ id: "a", start: 1, end: 2 }, { id: "b", start: 5, end: 6 }, { id: "c", start: 7, end: 8 }], scope: { kind: "voice-output" as const, id: "out", revision: "revision" } };
  const targets = captureReferenceTargets(selection, output, migrateScript([]));
  expect(targets.map((target) => target.text)).toEqual(["One", "", "Two"]);
  expect(targets.map((target) => target.wordIndexes)).toEqual([[0], [], [1]]);
  expect(() => captureReferenceTargets(selection, { ...output, id: "different" }, migrateScript([]))).toThrow();
});
