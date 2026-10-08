import { expect, it } from "vitest";
import { ScriptEditHistory } from "./script-edit-history";

it("retains thirty edits, restores text/timing/profile and drops redo after a new edit", () => {
  const history = new ScriptEditHistory();
  const snapshot = (n: number) => ({ text: String(n), words: [{ text: String(n), start: n, end: n + 1, speakerId: String(n) }] });
  for (let n = 0; n < 35; n++) history.record("footage", snapshot(n), snapshot(n + 1));
  for (let n = 34; n >= 5; n--) expect(history.undo()).toEqual({ assetId: "footage", snapshot: snapshot(n) });
  expect(history.undo()).toBeNull();
  expect(history.redo()).toEqual({ assetId: "footage", snapshot: snapshot(6) });
  history.record("footage", snapshot(6), snapshot(50));
  expect(history.redo()).toBeNull();
  expect(history.undo()?.snapshot).toEqual(snapshot(6));
});

it("undoes a single bulk speaker choice across tracks as one step", () => {
  const history = new ScriptEditHistory();
  const before = { text: "one", words: [{ text: "one", start: 0, end: 1, speakerId: "a" }] };
  const after = { ...before, words: [{ ...before.words[0], speakerId: "b" }] };
  history.batch(() => { history.record("track-a", before, after); history.record("track-b", before, after); });
  expect(history.undo()).toEqual({ assetId: "track-a", snapshot: before, related: [{ assetId: "track-b", snapshot: before }] });
  expect(history.undo()).toBeNull();
  expect(history.redo()).toEqual({ assetId: "track-a", snapshot: after, related: [{ assetId: "track-b", snapshot: after }] });
});
