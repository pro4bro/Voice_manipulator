import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { TrainingModelOption } from "../../domain/types";
import { useVoiceGeneratorCatalog } from "./useVoiceGeneratorCatalog";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("shows pending metadata, refreshes readiness and stops polling after completion", async () => {
  vi.useFakeTimers();
  const pending = [{ id: "fish", available: false, status: "Đang kiểm tra runtime/model…" }] as TrainingModelOption[];
  const ready = [{ id: "fish", available: true, status: "Sẵn sàng." }] as TrainingModelOption[];
  const read = vi.spyOn(api, "getVoiceGenerators").mockResolvedValueOnce(pending).mockResolvedValue(ready);
  const options = vi.fn(), error = vi.fn();
  function Consumer() { useVoiceGeneratorCatalog("scratch", 0, options, error); return null; }
  const view = render(<Consumer />);
  await act(async () => { await Promise.resolve(); });
  expect(options).toHaveBeenLastCalledWith(pending);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(options).toHaveBeenLastCalledWith(ready);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(read).toHaveBeenCalledTimes(2);
  expect(error).not.toHaveBeenCalled();
  view.unmount();
});

it("cancels pending refresh and ignores a late response when the workspace closes", async () => {
  let finish!: (options: TrainingModelOption[]) => void;
  vi.spyOn(api, "getVoiceGenerators").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const options = vi.fn(), error = vi.fn();
  function Consumer() { useVoiceGeneratorCatalog("scratch", 0, options, error); return null; }
  const view = render(<Consumer />);
  view.unmount();
  await act(async () => { finish([]); });
  expect(options).not.toHaveBeenCalled();
});
