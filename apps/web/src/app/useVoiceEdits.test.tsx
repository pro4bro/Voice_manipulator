import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVoiceEdits } from "./useVoiceEdits";

const packet = (revision: number) => ({ document: { revision, outputId: "o", cursor: revision, operations: [], sampleRate: 24000 }, output: { id: "o", duration: 2 }, audioUrl: `/preview-${revision}/audio`, duration: 2 });
const response = (value: object) => ({ ok: true, json: async () => value });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
afterEach(() => vi.unstubAllGlobals());

it("does not publish a late preview after Escape and checkpoints commit separately", async () => {
  let resolve: (result: object) => void = () => undefined;
  const fetch = vi.fn().mockResolvedValueOnce(response(packet(0))).mockImplementationOnce(() => new Promise((r) => { resolve = r; })).mockResolvedValueOnce(response(packet(1)));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => useVoiceEdits("p", "o", 3));
  await waitFor(() => expect(result.current.packet?.document.revision).toBe(0));
  const operation = { startFrame: 0, endFrame: 24000, targetFrames: 48000, edge: "right" as const };
  let pending: Promise<boolean>;
  act(() => { pending = result.current.preview(operation); });
  let queued: Promise<boolean>;
  act(() => { queued = result.current.preview({ ...operation, targetFrames: 36000 }); });
  act(() => result.current.cancel());
  await expect(queued!).resolves.toBe(false);
  await act(async () => { resolve(response(packet(1))); await pending; });
  expect(result.current.packet?.document.revision).toBe(0);
  await act(async () => { expect(await result.current.commit(operation)).toBe(true); });
  expect(result.current.packet?.document.revision).toBe(1);
  expect(JSON.parse(fetch.mock.calls[2][1].body).revision).toBe(0);
});

it("coalesces queued previews and serializes the final commit behind the active preview", async () => {
  const active = deferred<ReturnType<typeof response>>();
  const finalPreview = deferred<ReturnType<typeof response>>();
  const committed = deferred<ReturnType<typeof response>>();
  const fetch = vi.fn().mockResolvedValueOnce(response(packet(0)))
    .mockImplementationOnce(() => active.promise)
    .mockImplementationOnce(() => finalPreview.promise)
    .mockImplementationOnce(() => committed.promise);
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => useVoiceEdits("p", "o", 3));
  await waitFor(() => expect(result.current.packet?.document.revision).toBe(0));
  const a = { startFrame: 0, endFrame: 24000, targetFrames: 30000, edge: "right" as const };
  const b = { ...a, targetFrames: 36000 };
  const c = { ...a, targetFrames: 42000 };
  let first!: Promise<boolean>, superseded!: Promise<boolean>, latest!: Promise<boolean>, commit!: Promise<boolean>;
  act(() => { first = result.current.preview(a); });
  act(() => { superseded = result.current.preview(b); latest = result.current.preview(c); });
  expect(fetch).toHaveBeenCalledTimes(2);
  await expect(superseded).resolves.toBe(false);
  await act(async () => { active.resolve(response(packet(1))); await first; });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2][0]).toContain("/preview");
  expect(JSON.parse(fetch.mock.calls[2][1].body).operation).toEqual(c);
  act(() => { commit = result.current.commit(c); });
  expect(fetch).toHaveBeenCalledTimes(3);
  await act(async () => { finalPreview.resolve(response(packet(1))); });
  await expect(latest).resolves.toBe(false);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls[3][0]).not.toContain("/preview");
  expect(JSON.parse(fetch.mock.calls[3][1].body).operation).toEqual(c);
  await act(async () => { committed.resolve(response(packet(2))); await commit; });
  expect(result.current.packet?.document.revision).toBe(2);
});

it("drops queued previews on cancel and output change without starting stale commits", async () => {
  const active = deferred<ReturnType<typeof response>>();
  const nextOutput = deferred<ReturnType<typeof response>>();
  const fetch = vi.fn().mockResolvedValueOnce(response(packet(0)))
    .mockImplementationOnce(() => active.promise)
    .mockImplementationOnce(() => nextOutput.promise);
  vi.stubGlobal("fetch", fetch);
  const { result, rerender } = renderHook(({ output }) => useVoiceEdits("p", output, 3), { initialProps: { output: "o" } });
  await waitFor(() => expect(result.current.packet?.document.revision).toBe(0));
  const operation = { startFrame: 0, endFrame: 24000, targetFrames: 36000, edge: "right" as const };
  let activePreview!: Promise<boolean>, queuedPreview!: Promise<boolean>;
  act(() => { activePreview = result.current.preview(operation); queuedPreview = result.current.preview({ ...operation, targetFrames: 42000 }); });
  act(() => rerender({ output: "other" }));
  await expect(queuedPreview).resolves.toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => { active.resolve(response(packet(1))); await activePreview; });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2][0]).toContain("/voice-outputs/other/edit");
  expect(fetch.mock.calls.some((call) => call[0] === "/api/projects/p/voice-outputs/o/edit")).toBe(true);
  await act(async () => { nextOutput.resolve({ ...response(packet(0)), json: async () => ({ ...packet(0), document: { ...packet(0).document, outputId: "other" } }) }); });
  expect(result.current.packet?.document.outputId).toBe("other");
  expect(fetch.mock.calls.some((call) => call[0] === "/api/projects/p/voice-outputs/o/edit" && call[1]?.method === "POST")).toBe(false);
});

it("drops the queued request and invalidates an active response on unmount", async () => {
  const active = deferred<ReturnType<typeof response>>();
  const fetch = vi.fn().mockResolvedValueOnce(response(packet(0))).mockImplementationOnce(() => active.promise);
  vi.stubGlobal("fetch", fetch);
  const { result, unmount } = renderHook(() => useVoiceEdits("p", "o", 3));
  await waitFor(() => expect(result.current.packet?.document.revision).toBe(0));
  const operation = { startFrame: 0, endFrame: 24000, targetFrames: 36000, edge: "right" as const };
  let activePreview!: Promise<boolean>, queuedPreview!: Promise<boolean>;
  act(() => { activePreview = result.current.preview(operation); queuedPreview = result.current.preview({ ...operation, targetFrames: 42000 }); });
  unmount();
  await expect(queuedPreview).resolves.toBe(false);
  await act(async () => { active.resolve(response(packet(1))); await expect(activePreview).resolves.toBe(false); });
  expect(fetch).toHaveBeenCalledTimes(2);
});
