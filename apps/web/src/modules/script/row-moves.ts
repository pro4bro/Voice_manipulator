import type { SpeakerScriptRow } from "./script-table";

/**
 * Which row a selection is allowed to move into.
 *
 * Rows are not stored - they are runs of consecutive words that share a speaker,
 * rebuilt on every render. So "moving words to another row" only ever means
 * giving them that row's speaker; the words themselves never change place. That
 * is the whole constraint: recognition already put the transcript in time order,
 * and the only thing diarization gets wrong is who was speaking.
 *
 * Which is why a move has to start or end at a row's edge. Taking words off the
 * front of a row hands them to the row above, and off the back hands them to the
 * row below, both without disturbing the order. Taking a piece out of the middle
 * would leave the row in two halves with something else between them - that is a
 * split, not a move, and it is what right-clicking a speaker does instead.
 */

export type RowMoveDirection = "up" | "down";

export interface RowMove {
  direction: RowMoveDirection;
  target: SpeakerScriptRow;
}

function isRun(indexes: readonly number[]): boolean {
  return indexes.every((index, at) => at === 0 || index === indexes[at - 1] + 1);
}

/** The row holding the whole selection, with its position, or null. */
export function rowOfSelection(
  rows: SpeakerScriptRow[],
  indexes: number[],
): { row: SpeakerScriptRow; at: number } | null {
  if (!indexes.length) return null;
  const sorted = [...indexes].sort((left, right) => left - right);
  if (!isRun(sorted)) return null;
  const at = rows.findIndex((row) => row.words.some(({ index }) => index === sorted[0]));
  if (at < 0) return null;
  const held = new Set(rows[at].words.map(({ index }) => index));
  return sorted.every((index) => held.has(index)) ? { row: rows[at], at } : null;
}

export function legalRowMoves(rows: SpeakerScriptRow[], indexes: number[]): RowMove[] {
  const found = rowOfSelection(rows, indexes);
  if (!found) return [];
  const sorted = [...indexes].sort((left, right) => left - right);
  const { row, at } = found;
  const first = row.words[0].index;
  const last = row.words[row.words.length - 1].index;
  const moves: RowMove[] = [];
  if (sorted[0] === first && rows[at - 1]) moves.push({ direction: "up", target: rows[at - 1] });
  if (sorted[sorted.length - 1] === last && rows[at + 1]) moves.push({ direction: "down", target: rows[at + 1] });
  return moves;
}

/** The move that lands the selection in `targetRowId`, if that move is allowed. */
export function rowMoveTo(
  rows: SpeakerScriptRow[],
  indexes: number[],
  targetRowId: string,
): RowMove | null {
  return legalRowMoves(rows, indexes).find((move) => move.target.id === targetRowId) ?? null;
}

export function canMoveToRow(rows: SpeakerScriptRow[], indexes: number[], targetRowId: string): boolean {
  return rowMoveTo(rows, indexes, targetRowId) !== null;
}
