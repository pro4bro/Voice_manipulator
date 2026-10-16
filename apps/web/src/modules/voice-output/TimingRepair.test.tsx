import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TimingRepair } from "./TimingRepair";
afterEach(() => vi.unstubAllGlobals());
const job = { id: "j", key: "k", status: "complete", outputId: "o", done: 1, total: 1, report: { trustedWords: 3, totalWords: 4 } };
const reply = (body: object) => ({ ok: true, json: async () => body });
it("requires an explicit plan, separates repaired proposal from Apply and never starts TTS", async () => {
  const open = vi.fn(), fetcher = vi.fn().mockResolvedValueOnce(reply({ expectedKey: "k", processingAvailable: true, blockers: [] }))
    .mockResolvedValueOnce(reply(job)).mockResolvedValueOnce(reply({ output: { id: "new" } }));
  vi.stubGlobal("fetch", fetcher);
  render(<TimingRepair projectId="p" outputId="o" onOutputReady={open} />);
  expect(screen.getByText("Đo lại timing từ audio")).toBeDisabled();
  fireEvent.click(screen.getByText("Kiểm tra timing"));
  await waitFor(() => expect(screen.getByText("Đo lại timing từ audio")).toBeEnabled());
  fireEvent.click(screen.getByText("Đo lại timing từ audio"));
  await screen.findByText("1/1 · complete");
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Lưu bản timing mới"));
  await waitFor(() => expect(open).toHaveBeenCalledWith({ id: "new" }));
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    "/api/projects/p/voice-outputs/o/timing-repair/plan", "/api/projects/p/voice-outputs/o/timing-repair/jobs", "/api/projects/p/voice-outputs/o/timing-repair/apply"]);
});
it("recovers Stop from the latest job without starting recognition on reopen", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ expectedKey: "k", processingAvailable: false, blockers: [], latestJob: { ...job, status: "running" } }))
    .mockResolvedValueOnce(reply({ ...job, status: "cancelled" }));
  vi.stubGlobal("fetch", fetcher);
  render(<TimingRepair projectId="p" outputId="o" />);
  fireEvent.click(screen.getByText("Kiểm tra timing"));
  fireEvent.click(await screen.findByText("Dừng đo timing"));
  await screen.findByText("1/1 · cancelled");
  expect(fetcher.mock.calls[1][0]).toContain("/jobs/j/stop");
  expect(screen.getByText("Lưu bản timing mới")).toBeDisabled();
});
it("ignores a late Apply response after the selected output changes", async () => {
  let finish!: (value: unknown) => void;
  const open = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ expectedKey: "k", processingAvailable: true, blockers: [], latestJob: job }))
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })));
  const view = render(<TimingRepair projectId="p" outputId="o" onOutputReady={open} />);
  fireEvent.click(screen.getByText("Kiểm tra timing"));
  await waitFor(() => expect(screen.getByText("Lưu bản timing mới")).toBeEnabled());
  fireEvent.click(screen.getByText("Lưu bản timing mới"));
  view.rerender(<TimingRepair projectId="p" outputId="another" onOutputReady={open} />);
  finish(reply({ output: { id: "late" } }));
  await Promise.resolve(); await Promise.resolve();
  expect(open).not.toHaveBeenCalled();
});
