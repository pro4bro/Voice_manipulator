import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVoiceEdits } from "./useVoiceEdits";

const packet = (revision: number) => ({ document: { revision, outputId: "o", cursor: revision, operations: [], sampleRate: 24000 }, output: { id: "o", duration: 2 }, audioUrl: `/preview-${revision}/audio`, duration: 2 });
const response = (value: object) => ({ ok: true, json: async () => value });
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
  act(() => result.current.cancel());
  await act(async () => { resolve(response(packet(1))); await pending; });
  expect(result.current.packet?.document.revision).toBe(0);
  await act(async () => { expect(await result.current.commit(operation)).toBe(true); });
  expect(result.current.packet?.document.revision).toBe(1);
  expect(JSON.parse(fetch.mock.calls[2][1].body).revision).toBe(0);
});
