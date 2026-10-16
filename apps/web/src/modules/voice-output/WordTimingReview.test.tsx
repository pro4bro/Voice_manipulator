import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WordTimingReview } from "./WordTimingReview";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const plan = { key: "a".repeat(64), sampleRate: 24000, frames: 48000, trustedWords: 1, totalWords: 2, words: [
  { index: 0, text: "xin", startFrame: 0, endFrame: 12000, segmentIndex: 0, minFrame: 0, maxFrame: 48000, timingTrusted: true, timingSource: "faster-whisper-dtw" },
  { index: 1, text: "chào", startFrame: 12000, endFrame: 24000, segmentIndex: 0, minFrame: 0, maxFrame: 48000, timingTrusted: false, timingSource: "script-proportional" },
] };
it("loads only explicitly, permits untrusted-word audition and stops on word changes", async () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => plan }); vi.stubGlobal("fetch", fetcher);
  render(<WordTimingReview projectId="p" outputId="o" />); expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Đọc mốc từ đã lưu")); await screen.findByText("1/2 từ có mốc tin cậy đã lưu.");
  fireEvent.click(screen.getByText("Từ sau")); expect(screen.getByText("Chưa tin cậy · script-proportional")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Nghe từ và ngữ cảnh")); const audio = screen.getByLabelText("Nghe mốc từ");
  expect(audio.getAttribute("src")).toContain("index=1"); fireEvent.loadedMetadata(audio); await waitFor(() => expect(play).toHaveBeenCalled());
  fireEvent.click(screen.getByText("Từ trước")); expect(audio).not.toHaveAttribute("src"); expect(pause).toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not display a late plan from another output", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
  const view = render(<WordTimingReview projectId="p" outputId="old" />); fireEvent.click(screen.getByText("Đọc mốc từ đã lưu"));
  view.rerender(<WordTimingReview projectId="p" outputId="new" />);
  await act(async () => finish({ ok: true, json: async () => plan }));
  expect(screen.queryByLabelText("Từ cần kiểm tra")).not.toBeInTheDocument();
});

it("saves only the selected reviewed boundaries as a separate output", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const ready = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => plan }).mockResolvedValueOnce({ ok: true, json: async () => ({ output: { id: "new" } }) });
  vi.stubGlobal("fetch", fetcher); render(<WordTimingReview projectId="p" outputId="o" onOutputReady={ready} />);
  fireEvent.click(screen.getByText("Đọc mốc từ đã lưu")); await screen.findByLabelText("Từ cần kiểm tra");
  fireEvent.click(screen.getByText("Từ sau")); const save = screen.getByText("Lưu mốc từ thành bản mới"); expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Mốc đầu của từ (giây)"), { target: { value: "0.6" } });
  fireEvent.click(screen.getByLabelText("Đã nghe và kiểm tra biên từ này")); fireEvent.click(save);
  await waitFor(() => expect(ready).toHaveBeenCalledWith({ id: "new" }));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ expectedKey: plan.key, reviewed: true, changes: [{ index: 1, startFrame: 14400, endFrame: 24000 }] });
});
it("rejects overlapping boundaries and resets confirmation on a different word", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => plan }));
  render(<WordTimingReview projectId="p" outputId="o" />); fireEvent.click(screen.getByText("Đọc mốc từ đã lưu")); await screen.findByLabelText("Từ cần kiểm tra");
  fireEvent.click(screen.getByLabelText("Đã nghe và kiểm tra biên từ này"));
  fireEvent.change(screen.getByLabelText("Mốc cuối của từ (giây)"), { target: { value: "0.9" } });
  expect(screen.getByText("Lưu mốc từ thành bản mới")).toBeDisabled();
  fireEvent.click(screen.getByText("Từ sau")); expect(screen.getByLabelText("Đã nghe và kiểm tra biên từ này")).not.toBeChecked();
});

it("does not open a late saved review after switching outputs", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  let finish!: (value: unknown) => void;
  const ready = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => plan }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<WordTimingReview projectId="p" outputId="old" onOutputReady={ready} />);
  fireEvent.click(screen.getByText("Đọc mốc từ đã lưu")); fireEvent.click(await screen.findByLabelText("Đã nghe và kiểm tra biên từ này"));
  fireEvent.click(screen.getByText("Lưu mốc từ thành bản mới")); await waitFor(() => expect(finish).toBeDefined());
  view.rerender(<WordTimingReview projectId="p" outputId="new" onOutputReady={ready} />);
  await act(async () => finish({ ok: true, json: async () => ({ output: { id: "old-review" } }) }));
  expect(ready).not.toHaveBeenCalled(); expect(screen.queryByText(/Đã lưu bản mốc từ mới/)).not.toBeInTheDocument();
});
