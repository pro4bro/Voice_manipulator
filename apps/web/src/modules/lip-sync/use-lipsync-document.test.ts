import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyLipSync, type LipSyncDocument } from "../../domain/lipsync";
import { useLipSyncDocument } from "./use-lipsync-document";

afterEach(() => vi.restoreAllMocks());

it("preserves edits made while a save is pending and advances only the saved revision", async () => {
  vi.spyOn(api, "getLipSync").mockImplementation(async () => emptyLipSync());
  let finish!: (value: LipSyncDocument) => void;
  const save = vi.spyOn(api, "saveLipSync").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useLipSyncDocument("project"));
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.edit((doc) => ({ ...doc, layers: [{ id: "l", name: "Before", enabled: true }] })));
  act(() => { void result.current.save(); });
  act(() => result.current.edit((doc) => ({ ...doc, layers: [{ ...doc.layers[0], name: "After" }] })));
  await act(async () => finish({ ...save.mock.calls[0][1], revision: 1 }));
  expect(result.current.document.revision).toBe(1);
  expect(result.current.document.layers[0].name).toBe("After");
  expect(result.current.dirty).toBe(true);
  act(() => result.current.undo());
  expect(result.current.document.layers[0].name).toBe("Before");
  expect(result.current.document.revision).toBe(1);
});

it("keeps histories independent through switching, remounting and a pending save", async () => {
  const p = crypto.randomUUID();
  const states = new Map(["a", "b"].map((id) => [id, { document: emptyLipSync(), past: [] as LipSyncDocument[], future: [] as LipSyncDocument[] }]));
  const get = vi.spyOn(api, "getLipSyncState").mockImplementation(async (_, id) => structuredClone(states.get(id)!));
  let finish!: () => void;
  vi.spyOn(api, "saveLipSyncState").mockImplementation((_, id, state) => new Promise((resolve) => { finish = () => { const saved = structuredClone({ ...state, document: { ...state.document, revision: 1 } }); states.set(id, saved); resolve(saved); }; }));
  const hook = renderHook(({ id }) => useLipSyncDocument(p, id), { initialProps: { id: "a" } });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.edit((doc) => ({ ...doc, layers: [{ id: "l", name: "A", enabled: true }] })));
  act(() => { void hook.result.current.save(); });
  hook.rerender({ id: "b" });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.edit((doc) => ({ ...doc, layers: [{ id: "l", name: "B", enabled: true }] })));
  await act(async () => finish());
  expect(hook.result.current.document.layers[0].name).toBe("B");
  hook.rerender({ id: "a" });
  expect(hook.result.current.document.layers[0].name).toBe("A");
  expect(hook.result.current.document.revision).toBe(1);
  act(() => hook.result.current.undo());
  expect(hook.result.current.document.layers).toEqual([]);
  hook.rerender({ id: "b" });
  expect(hook.result.current.canRedo).toBe(false);
  act(() => hook.result.current.undo());
  expect(hook.result.current.document.layers).toEqual([]);
  hook.unmount();
  const remount = renderHook(() => useLipSyncDocument(p, "a"));
  expect(remount.result.current.canRedo).toBe(true);
  act(() => remount.result.current.undo(true));
  expect(remount.result.current.document.layers[0].name).toBe("A");
  await act(async () => remount.result.current.reload());
  expect(remount.result.current.canUndo).toBe(true);
  expect(get).toHaveBeenCalledTimes(3);
});

it("undoes face ID and profile edits in the same version history as timing and settings", async () => {
  const p = crypto.randomUUID();
  const baseline = { analysisId: "analysis", revision: 0, observations: [{ id: "o", faceId: "face-1", reviewed: false }], bindings: [] };
  vi.spyOn(api, "getLipSyncState").mockResolvedValue({ document: emptyLipSync(), past: [], future: [], faceReviews: { analysis: baseline } });
  const save = vi.spyOn(api, "saveLipSyncState").mockImplementation(async (_, __, value) => ({ ...value, document: { ...value.document, revision: 1 } }));
  const { result } = renderHook(() => useLipSyncDocument(p, "v"));
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.editReview({ ...baseline, observations: [{ id: "o", faceId: "actor", reviewed: true }], bindings: [{ faceId: "actor", speakerProfileId: "speaker" }] }));
  act(() => result.current.edit((doc) => ({ ...doc, engineId: "musetalk-lipsync" })));
  act(() => result.current.undo());
  expect(result.current.faceReviews.analysis.observations[0].faceId).toBe("actor");
  act(() => result.current.undo());
  expect(result.current.faceReviews.analysis.observations[0].faceId).toBe("face-1");
  expect(result.current.faceReviews.analysis.bindings).toEqual([]);
  act(() => result.current.undo(true));
  await act(async () => { await result.current.save(); });
  expect(save.mock.calls[0][2].faceReviews?.analysis.bindings[0].speakerProfileId).toBe("speaker");
  expect(save.mock.calls[0][2].future).toHaveLength(1);
});
