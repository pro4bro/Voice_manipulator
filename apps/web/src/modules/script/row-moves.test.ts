import { describe, expect, it } from "vitest";

import type { StudioWord } from "../../domain/types";
import { legalRowMoves, rowMoveTo, rowOfSelection } from "./row-moves";
import { buildSpeakerScriptRows, moveWordsToRow } from "./script-table";

/** Nine words in three turns of three, the shape diarization produces. */
function transcript(): StudioWord[] {
  return ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((text, index) => ({
    text,
    start: index * 0.5,
    end: index * 0.5 + 0.4,
    diarizationSpeakerId: `speaker-${Math.floor(index / 3) + 1}`,
  })) as StudioWord[];
}

const rowsOf = (words: StudioWord[]) => buildSpeakerScriptRows(words, []);
const textOf = (words: StudioWord[]) => rowsOf(words).map((row) => row.words.map(({ word }) => word.text).join(""));

describe("legalRowMoves", () => {
  const rows = rowsOf(transcript());

  it("lets the front of a row go up to the row above", () => {
    const moves = legalRowMoves(rows, [3]);
    expect(moves.map((move) => move.direction)).toEqual(["up"]);
    expect(moves[0].target.id).toBe(rows[0].id);
  });

  it("lets the back of a row go down to the row below", () => {
    const moves = legalRowMoves(rows, [5]);
    expect(moves.map((move) => move.direction)).toEqual(["down"]);
    expect(moves[0].target.id).toBe(rows[2].id);
  });

  it("refuses a piece out of the middle: that is a split, not a move", () => {
    expect(legalRowMoves(rows, [4])).toEqual([]);
  });

  it("refuses a selection that spans two rows", () => {
    expect(legalRowMoves(rows, [2, 3])).toEqual([]);
  });

  it("refuses a selection with a gap in it", () => {
    expect(legalRowMoves(rows, [3, 5])).toEqual([]);
  });

  it("offers both ways when the whole row is taken", () => {
    expect(legalRowMoves(rows, [3, 4, 5]).map((move) => move.direction)).toEqual(["up", "down"]);
  });

  it("has nowhere to go past the ends of the transcript", () => {
    expect(legalRowMoves(rows, [0])).toEqual([]);
    expect(legalRowMoves(rows, [8])).toEqual([]);
  });

  it("finds no row for a selection that is not in one", () => {
    expect(rowOfSelection(rows, [])).toBeNull();
    expect(rowOfSelection(rows, [99])).toBeNull();
  });

  it("names only the adjacent row as a target, never a distant one", () => {
    expect(rowMoveTo(rows, [3], rows[0].id)).not.toBeNull();
    expect(rowMoveTo(rows, [3], rows[2].id)).toBeNull();
  });
});

describe("moving words between rows", () => {
  it("adds the front of a row to the end of the row above, in time order", () => {
    const words = transcript();
    const rows = rowsOf(words);
    const move = rowMoveTo(rows, [3], rows[0].id);
    const moved = moveWordsToRow(words, [3], move!.target);
    expect(textOf(moved)).toEqual(["abcd", "ef", "ghi"]);
  });

  it("adds the back of a row to the start of the row below, in time order", () => {
    const words = transcript();
    const rows = rowsOf(words);
    const move = rowMoveTo(rows, [5], rows[2].id);
    const moved = moveWordsToRow(words, [5], move!.target);
    expect(textOf(moved)).toEqual(["abc", "de", "fghi"]);
  });

  it("empties a row out of existence, and merges what is left either side", () => {
    // Rows are derived, so a row nothing belongs to simply stops being drawn -
    // and the two speaker-1 runs either side of it become one row, not two.
    const words = transcript();
    const rows = rowsOf(words);
    const moved = moveWordsToRow(words, [3, 4, 5], rows[0]);
    expect(textOf(moved)).toEqual(["abcdef", "ghi"]);
  });

  it("splits a row in three when a speaker is given to words in its middle", () => {
    const words = transcript();
    const rows = rowsOf(words);
    const split = moveWordsToRow(words, [4], rows[0]);
    expect(textOf(split)).toEqual(["abc", "d", "e", "f", "ghi"]);
  });
});
