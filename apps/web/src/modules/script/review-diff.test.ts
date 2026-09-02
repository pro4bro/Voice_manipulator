import { describe, expect, it } from "vitest";

import { buildReviewPieces, differsOnlyByPunctuation, splitWord, type ReviewPiece } from "./review-diff";

const changes = (pieces: ReviewPiece[]) =>
  pieces.flatMap((piece) => piece.kind === "change" ? [[piece.stt, piece.ai]] : []);
/** What the text reads as when every change is left at the live-transcript side. */
const kept = (pieces: ReviewPiece[]) =>
  pieces.map((piece) => piece.kind === "same" ? piece.text : piece.stt).join("");
/** What it reads as when every change is accepted. */
const taken = (pieces: ReviewPiece[]) =>
  pieces.map((piece) => piece.kind === "same" ? piece.text : piece.ai).join("");

describe("splitWord", () => {
  it("peels punctuation off a word without touching the word", () => {
    expect(splitWord("chào,")).toMatchObject({ lead: "", core: "chào", trail: ",", space: "" });
    expect(splitWord("(chào) ")).toMatchObject({ lead: "(", core: "chào", trail: ")", space: " " });
    expect(splitWord("anh-em.")).toMatchObject({ core: "anh-em", trail: "." });
  });

  it("leaves a bare word alone", () => {
    expect(splitWord("chào")).toMatchObject({ lead: "", core: "chào", trail: "", space: "" });
  });
});

describe("differsOnlyByPunctuation", () => {
  it("sees a comma added to the same word", () => {
    expect(differsOnlyByPunctuation("chào", "chào,")).toBe(true);
  });

  it("does not confuse a different word for a punctuation change", () => {
    expect(differsOnlyByPunctuation("chào", "chào bạn")).toBe(false);
    expect(differsOnlyByPunctuation("chào", "chao,")).toBe(false);
  });

  it("says no when nothing but punctuation is there to compare", () => {
    expect(differsOnlyByPunctuation(",", ".")).toBe(false);
  });
});

describe("buildReviewPieces", () => {
  it("changes only the comma, not the word it is attached to", () => {
    // The reported case: live speech heard "Xin chào", STT punctuated it.
    const pieces = buildReviewPieces("Xin chào", "Xin chào,");
    expect(changes(pieces)).toEqual([["", ","]]);
    expect(kept(pieces)).toBe("Xin chào");
    expect(taken(pieces)).toBe("Xin chào,");
  });

  it("keeps the word out of the change even mid-sentence", () => {
    const pieces = buildReviewPieces("Xin chào các bạn", "Xin chào, các bạn.");
    expect(changes(pieces)).toEqual([["", ","], ["", "."]]);
    expect(taken(pieces)).toBe("Xin chào, các bạn.");
  });

  it("still reports a real word change as a word change", () => {
    const pieces = buildReviewPieces("Xin chào", "Xin xin chào");
    expect(changes(pieces).length).toBe(1);
    expect(taken(pieces)).toBe("Xin xin chào");
  });

  it("reports a word that changed and gained punctuation as one change", () => {
    const pieces = buildReviewPieces("chao", "chào,");
    expect(changes(pieces)).toEqual([["chao", "chào,"]]);
  });

  it("finds nothing to change in identical text", () => {
    expect(changes(buildReviewPieces("Xin chào bạn", "Xin chào bạn"))).toEqual([]);
  });

  it("rebuilds the original text exactly when every change is declined", () => {
    const source = "Xin chào các bạn nhé";
    expect(kept(buildReviewPieces(source, "Xin chào, các bạn nhé."))).toBe(source);
  });
});
