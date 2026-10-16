import { expect, it } from "vitest";
import type { VoiceOutput } from "./types";
import { patchRowForSelection } from "./patch-selection";
const output = { id: "o", segments: [{ rowId: "a", start: 0, end: 1 }, { rowId: "b", start: 2, end: 3 }], words: [{ segmentIndex: 0 }, { segmentIndex: 1 }] } as VoiceOutput;
it("resolves a single source sentence from waveform, subtitle words or Script characters", () => {
  expect(patchRowForSelection(output, { indexes: [], anchor: null, ranges: [{ id: "r", start: .2, end: .4 }] }, "p")).toBe("a");
  expect(patchRowForSelection(output, { indexes: [1], anchor: 1 }, "p")).toBe("b");
  expect(patchRowForSelection(output, { indexes: [], anchor: null, scope: { kind: "script", id: "p", revision: "1" }, textRanges: [{ rowId: "a", start: 1, end: 4 }] }, "p")).toBe("a");
});
it("refuses multiple sentences, silence-only spans and another source", () => {
  expect(patchRowForSelection(output, { indexes: [0, 1], anchor: 0 }, "p")).toBeNull();
  expect(patchRowForSelection(output, { indexes: [], anchor: null, ranges: [{ id: "r", start: 1.2, end: 1.5 }] }, "p")).toBeNull();
  expect(patchRowForSelection(output, { indexes: [0], anchor: 0, scope: { kind: "voice-output", id: "other", revision: "1" } }, "p")).toBeNull();
});
