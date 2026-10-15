import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVoiceRender } from "./useVoiceRender";
afterEach(() => vi.unstubAllGlobals());
it("restores explicit render and refuses a late packet after Script changes", async () => {
  const body = { output: { id: "o" }, audioUrl: "/render/audio", scriptRevision: 1, editRevision: 0, report: {} };
  let resolve: (value: object) => void = () => undefined;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => body })
    .mockImplementationOnce(() => new Promise((r) => { resolve = r; })).mockResolvedValue({ ok: false }));
  const hook = renderHook(({ revision }) => useVoiceRender("p", "o", revision, 0), { initialProps: { revision: 1 } });
  await waitFor(() => expect(hook.result.current.packet?.audioUrl).toBe(body.audioUrl));
  let pending: Promise<void>;
  act(() => { pending = hook.result.current.render(); });
  hook.rerender({ revision: 2 });
  await act(async () => { resolve({ ok: true, json: async () => body }); await pending; });
  expect(hook.result.current.packet).toBeNull();
});
