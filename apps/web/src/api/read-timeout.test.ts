import { afterEach, expect, it, vi } from "vitest";
import { api } from "./client";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("releases a stalled data read and allows a new request without restarting the app", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn((_path, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  vi.stubGlobal("fetch", fetcher);
  const result = api.getPreferences();
  const checked = expect(result).rejects.toThrow(/15 giây/);
  await vi.advanceTimersByTimeAsync(15000);
  await checked;
  fetcher.mockResolvedValueOnce(new Response("{}"));
  await expect(api.getPreferences()).resolves.toEqual({});
  expect(vi.getTimerCount()).toBe(0);
});
