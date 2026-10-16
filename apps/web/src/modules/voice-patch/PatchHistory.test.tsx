import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PatchHistory } from "./PatchHistory";
afterEach(() => vi.unstubAllGlobals());
const entry = (id: string, strategy: string, group = "same") => ({ output: { id, duration: 8, parameters: { voicePatch: { replacementText: "giọng nói mẫu", trainedVoiceId: "v", voiceId: "v" } } },
  sourceOutputId: "source", strategy, comparisonKey: group, audioUrl: `/${id}.wav`, report: { startFrame: 98880, endFrame: 150720, durationPolicy: "source" } });
it("groups only comparable accepted variants and opens history without generating or applying", async () => {
  const open = vi.fn();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revisions: [entry("a", "trained-media-patch"), entry("b", "context-patch"), entry("c", "hybrid-patch"), entry("d", "hybrid-patch", "different")], invalidCount: 1 }) });
  vi.stubGlobal("fetch", fetcher);
  render(<PatchHistory projectId="p" onOpen={open} />);
  fireEvent.click(screen.getByText("Đọc lịch sử bản vá"));
  await screen.findByText("1 bản có artifact thiếu hoặc không khớp đã bị loại.");
  expect(screen.getAllByRole("group", { name: /source/ })).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "Tải báo cáo đối chiếu JSON" })).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "Tải báo cáo đối chiếu JSON" })[0]).toHaveAttribute("href", "/api/projects/p/voice-patch/history/a/comparison-report");
  expect(screen.getAllByRole("button", { name: /Nghe đối chiếu/ })).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Mở bản vá a" }));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("discards a late history response from another project", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
  const view = render(<PatchHistory projectId="old" />);
  fireEvent.click(screen.getByText("Đọc lịch sử bản vá"));
  await waitFor(() => expect(finish).toBeDefined());
  view.rerender(<PatchHistory projectId="new" />);
  await act(async () => finish({ ok: true, json: async () => ({ revisions: [entry("old", "hybrid-patch")], invalidCount: 0 }) }));
  expect(screen.queryByRole("button", { name: "Mở bản vá old" })).not.toBeInTheDocument();
});
