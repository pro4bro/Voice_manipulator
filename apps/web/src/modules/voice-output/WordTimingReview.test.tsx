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
