import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { CollectionVoicePreview } from "../../domain/types";
import { CollectionModelPreview } from "./CollectionModelPreview";

vi.mock("../../api/client", () => ({ api: { getCollectionVoicePreview: vi.fn(), startCollectionVoicePreview: vi.fn() } }));

function preview(status: CollectionVoicePreview["status"], overrides: Partial<CollectionVoicePreview> = {}): CollectionVoicePreview {
  return {
    status,
    script: `${status} sample script`,
    duration: null,
    audioUrl: null,
    error: null,
    trainingSeconds: null,
    emotionSupport: "neutral",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("plays only ready audio that meets the 15-second minimum", async () => {
  vi.mocked(api.getCollectionVoicePreview).mockResolvedValueOnce(preview("ready", { duration: 14.99, audioUrl: "/too-short.wav" }));
  const view = render(<CollectionModelPreview collectionId="collection" entryId="short" name="Short" />);
  expect(await screen.findByDisplayValue("ready sample script")).toBeInTheDocument();
  expect(screen.queryByRole("audio")).not.toBeInTheDocument();
  expect(screen.getByText("Chưa có mẫu giọng hợp lệ")).toBeInTheDocument();

  vi.mocked(api.getCollectionVoicePreview).mockResolvedValueOnce(preview("ready", { duration: 15, audioUrl: "/valid.wav" }));
  view.rerender(<CollectionModelPreview collectionId="collection" entryId="valid" name="Valid" />);
  const audio = await screen.findByLabelText("Nghe mẫu Valid");
  expect(audio).toHaveAttribute("src", "/valid.wav");
  expect(screen.getByText("15.0 giây · mẫu được tạo bằng model")).toBeInTheDocument();
});

it("polls queued/running previews until a ready response arrives", async () => {
  vi.useFakeTimers();
  vi.mocked(api.getCollectionVoicePreview)
    .mockResolvedValueOnce(preview("queued"))
    .mockResolvedValueOnce(preview("running"))
    .mockResolvedValueOnce(preview("ready", { duration: 18, audioUrl: "/ready.wav" }));
  render(<CollectionModelPreview collectionId="collection" entryId="entry" name="Voice" />);

  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(/Đang tạo mẫu giới thiệu/)).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(screen.getByText(/Đang tạo mẫu giới thiệu/)).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(screen.getByLabelText("Nghe mẫu Voice")).toHaveAttribute("src", "/ready.wav");
  expect(api.getCollectionVoicePreview).toHaveBeenCalledTimes(3);
});

it("drops a stale response when the selected entry changes", async () => {
  let resolveOld!: (value: CollectionVoicePreview) => void;
  vi.mocked(api.getCollectionVoicePreview).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  vi.mocked(api.getCollectionVoicePreview).mockResolvedValueOnce(preview("ready", { script: "new entry script", duration: 17, audioUrl: "/new.wav" }));
  const view = render(<CollectionModelPreview collectionId="collection" entryId="old" name="Old" />);
  view.rerender(<CollectionModelPreview collectionId="collection" entryId="new" name="New" />);

  expect(await screen.findByDisplayValue("new entry script")).toBeInTheDocument();
  await act(async () => { resolveOld(preview("ready", { script: "stale old script", duration: 19, audioUrl: "/old.wav" })); });
  expect(screen.getByDisplayValue("new entry script")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("stale old script")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Nghe mẫu New")).toHaveAttribute("src", "/new.wav");
});

it("retries generation when the preview status endpoint failed", async () => {
  vi.mocked(api.getCollectionVoicePreview)
    .mockRejectedValueOnce(new Error("status unavailable"))
    .mockRejectedValueOnce(new Error("status unavailable"));
  vi.mocked(api.startCollectionVoicePreview).mockResolvedValueOnce(preview("running"));
  render(<CollectionModelPreview collectionId="collection" entryId="entry" name="Voice" />);

  fireEvent.click(await screen.findByRole("button", { name: "Thử tạo mẫu lại" }));
  expect(await screen.findByText(/Đang tạo mẫu giới thiệu/)).toBeInTheDocument();
  expect(api.startCollectionVoicePreview).toHaveBeenCalledWith("collection", "entry");
  expect(api.startCollectionVoicePreview).toHaveBeenCalledTimes(1);
});
