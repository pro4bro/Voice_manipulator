import { expect, it } from "vitest";
import { findScriptDocumentMatches, formatScriptDocumentPauses, replaceScriptDocumentMatches } from "./script-document-actions";

const words = [{ text: "Xin", start: 1, end: 2, speakerId: "speaker", emotion: "good" as const }, { text: "chào", start: 3, end: 4 }];
const documents = ["a", "b"].map((id) => ({ id, name: id, text: "Xin chào", words }));
it("finds literal text with local offsets even when sources share independent timestamps", () => {
  expect(findScriptDocumentMatches(documents, "xin", false)).toEqual([{ assetId: "a", start: 0, end: 3 }, { assetId: "b", start: 0, end: 3 }]);
  expect(findScriptDocumentMatches(documents, "xin", true)).toEqual([]);
  expect(findScriptDocumentMatches([{ ...documents[0], text: "[a]* [a]*" }], "[a]*", true)).toEqual([{ assetId: "a", start: 0, end: 4 }, { assetId: "a", start: 5, end: 9 }]);
});
it("replaces only the addressed source and preserves untouched word timing and labels", () => {
  const changes = replaceScriptDocumentMatches(documents, [{ assetId: "a", start: 0, end: 3 }], "Chúc");
  expect(changes).toHaveLength(1);
  expect(changes[0].assetId).toBe("a");
  expect(changes[0].words[1]).toEqual(words[1]);
  expect(changes[0].words[0]).toMatchObject({ text: "Chúc", speakerId: "speaker", emotion: "good", timingTrusted: false });
  expect(documents[0].text).toBe("Xin chào");
});
it("uses exactly the same pause formatting for a single source and multitrack commands", () => {
  expect(formatScriptDocumentPauses(documents[0])).toBe("Xin,\nchào");
  expect(formatScriptDocumentPauses({ text: "Xin chào", words: [] })).toBe("Xin chào");
});
