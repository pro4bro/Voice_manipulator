import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ObsCapture } from "./ObsCapture";

const mock = vi.hoisted(() => ({
  listObsSessions: vi.fn(),
  listObsLiveSessions: vi.fn(),
  getObsLivePairing: vi.fn(),
  getObsLiveCaptionQuality: vi.fn(),
  pickMediaFile: vi.fn(),
  inspectObsRecording: vi.fn(),
  createObsSession: vi.fn(),
  getObsSessionSubtitleStatus: vi.fn(),
  enqueueMediaTranscriptions: vi.fn(),
  exportObsSessionSubtitles: vi.fn(),
  renderObsSessionHardSubtitle: vi.fn(),
}));
vi.mock("../../api/client", () => ({ api: mock }));

describe("ObsCapture", () => {
  beforeEach(() => {
    mock.listObsSessions.mockReset().mockResolvedValue([]);
    mock.listObsLiveSessions.mockReset().mockResolvedValue([]);
    mock.getObsLivePairing.mockReset().mockResolvedValue({ protocolVersion: "2", token: "pair-token", overlayPath: "C:/Project/cache/obs-live-caption.txt" });
    mock.getObsLiveCaptionQuality.mockReset().mockResolvedValue({ sessionId: "live-mic", finalAvailable: false, mismatchPercent: null, liveWords: 0, finalWords: 0 });
    mock.pickMediaFile.mockReset().mockResolvedValue({ path: "C:\\Records\\meeting.mkv" });
    mock.inspectObsRecording.mockReset().mockResolvedValue({
      duration: 22, tracks: [
        { streamIndex: 1, obsTrack: 1, sampleRate: 48000, codec: "aac" },
        { streamIndex: 2, obsTrack: 2, sampleRate: 48000, codec: "aac" },
      ],
    });
    mock.createObsSession.mockReset().mockResolvedValue({ id: "obs-1", status: "queued", tracks: [] });
    mock.getObsSessionSubtitleStatus.mockReset().mockResolvedValue({ sessionId: "obs-1", readyCues: 0, skippedCues: 0, sources: [] });
    mock.enqueueMediaTranscriptions.mockReset().mockResolvedValue([]);
    mock.exportObsSessionSubtitles.mockReset().mockResolvedValue(undefined);
    mock.renderObsSessionHardSubtitle.mockReset().mockResolvedValue(undefined);
  });

  it("maps inspected tracks to editable source labels before import", async () => {
    render(<ObsCapture onImportReady={vi.fn()} onOpenAsset={vi.fn()} projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn MKV từ OBS" }));
    expect(await screen.findByLabelText("Tên nguồn cho track 1")).toHaveValue("Track 1 (chưa xác định nguồn)");
    fireEvent.change(screen.getByLabelText("Tên nguồn cho track 1"), { target: { value: "Micro" } });
    fireEvent.change(screen.getByLabelText("Tên nguồn cho track 2"), { target: { value: "Tab họp" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập 2 track" }));
    await waitFor(() => expect(mock.createObsSession).toHaveBeenCalledWith("project-1", "C:\\Records\\meeting.mkv", [
      { streamIndex: 1, sourceLabel: "Micro" },
      { streamIndex: 2, sourceLabel: "Tab họp" },
    ]));
  });

  it("opens the video and each audio track from a ready session", async () => {
    mock.listObsSessions.mockResolvedValue([{ id: "obs-1", status: "ready", createdAt: "2026-09-22T00:00:00Z", duration: 22,
      recordingAssetId: "asset-video", tracks: [
        { assetId: "asset-mic", sourceLabel: "Micro", streamIndex: 1, obsTrack: 1 },
        { assetId: "asset-tab", sourceLabel: "Tab họp", streamIndex: 2, obsTrack: 2 },
      ],
    }]);
    const onOpenAsset = vi.fn();
    render(<ObsCapture onImportReady={vi.fn()} onOpenAsset={onOpenAsset} projectId="project-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Âm thanh video OBS" }));
    fireEvent.click(screen.getByRole("button", { name: "Micro" }));
    fireEvent.click(screen.getByRole("button", { name: "Tab họp" }));
    expect(onOpenAsset.mock.calls).toEqual([["asset-video"], ["asset-mic"], ["asset-tab"]]);
    expect(screen.getByRole("link", { name: "Tải MKV gốc" })).toHaveAttribute("href", "/api/projects/project-1/obs-sessions/obs-1/recording");
  });

  it("keeps live sources and provisional transcripts independent", async () => {
    mock.listObsLiveSessions.mockResolvedValue([
      { id: "live-mic", captureId: "capture-1", sourceId: "uuid-mic", sourceLabel: "Micro", status: "recording",
        bytesReceived: 96000, gaps: [], liveText: "xin chào", livePending: "anh", liveSttStatus: "live",
        liveSttLagSeconds: 1.2, liveSttError: null, assetId: null },
      { id: "live-app", captureId: "capture-1", sourceId: "uuid-app", sourceLabel: "Tab họp", status: "paused",
        bytesReceived: 48000, gaps: [{ firstSequence: 2, lastSequence: 2, missingFrames: 480 }], liveText: "nội dung tab",
        livePending: "", liveSttStatus: "paused", liveSttLagSeconds: 0, liveSttError: null, assetId: null },
    ]);
    render(<ObsCapture onImportReady={vi.fn()} onOpenAsset={vi.fn()} projectId="project-1" />);
    expect(await screen.findByText((_, element) => element?.tagName === "P" && element.textContent?.includes("xin chào anh") === true)).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent?.includes("nội dung tab") === true)).toBeInTheDocument();
    expect(screen.getByText(/0\.1 MB · 0 gap/)).toBeInTheDocument();
    expect(screen.getByText(/0\.0 MB · 1 gap/)).toBeInTheDocument();
  });

  it("shows draft versus final mismatch only after final STT", async () => {
    mock.listObsLiveSessions.mockResolvedValue([{ id: "live-mic", captureId: "capture-1", sourceId: "uuid-mic",
      sourceLabel: "Micro", status: "stopped", bytesReceived: 96000, gaps: [], liveText: "xin chào anh",
      livePending: "", liveSttStatus: "stopped", liveSttLagSeconds: 1.2, liveSttError: null, assetId: "asset-mic" }]);
    mock.getObsLiveCaptionQuality.mockResolvedValue({ sessionId: "live-mic", finalAvailable: true,
      mismatchPercent: 33.3, liveWords: 3, finalWords: 3 });
    render(<ObsCapture onImportReady={vi.fn()} onOpenAsset={vi.fn()} projectId="project-1" />);
    expect(await screen.findByText(/Sai khác live\/final ~33\.3%/)).toBeInTheDocument();
    expect(mock.getObsLiveCaptionQuality).toHaveBeenCalledWith("project-1", "live-mic");
  });

  it("runs final STT per OBS track and exports only when trusted cues exist", async () => {
    mock.listObsSessions.mockResolvedValue([{ id: "obs-1", status: "ready", createdAt: "2026-09-22T00:00:00Z", duration: 22,
      recordingAssetId: "asset-video", tracks: [
        { assetId: "asset-mic", sourceLabel: "Micro", streamIndex: 1, obsTrack: 1 },
        { assetId: "asset-tab", sourceLabel: "Tab họp", streamIndex: 2, obsTrack: 2 },
      ],
    }]);
    mock.getObsSessionSubtitleStatus.mockResolvedValue({ sessionId: "obs-1", readyCues: 2, skippedCues: 1, unsafeWords: 1, sources: [
      { assetId: "asset-mic", transcriptionStatus: "complete", readyCues: 1, skippedCues: 1, unsafeWords: 1 },
      { assetId: "asset-tab", transcriptionStatus: "skipped", readyCues: 1, skippedCues: 0, unsafeWords: 0 },
    ] });
    render(<ObsCapture onImportReady={vi.fn()} onOpenAsset={vi.fn()} projectId="project-1" />);
    expect(await screen.findByText("0 cue sẵn sàng · 0 cue và 0 từ bỏ do timecode chưa tin cậy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xuất SRT phiên OBS" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ghép vào SRT: Micro" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ghép vào SRT: Tab họp" }));
    expect(screen.getByText("2 cue sẵn sàng · 1 cue và 1 từ bỏ do timecode chưa tin cậy")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Final STT" })[1]);
    await waitFor(() => expect(mock.enqueueMediaTranscriptions).toHaveBeenCalledWith("project-1", ["asset-tab"]));
    fireEvent.click(screen.getByRole("button", { name: "Xuất SRT phiên OBS" }));
    await waitFor(() => expect(mock.exportObsSessionSubtitles).toHaveBeenCalledWith("project-1", "obs-1", ["asset-mic", "asset-tab"]));
    fireEvent.click(screen.getByRole("button", { name: "Render video có subtitle" }));
    await waitFor(() => expect(mock.renderObsSessionHardSubtitle).toHaveBeenCalledWith("project-1", "obs-1", ["asset-mic", "asset-tab"]));
  });

  it("selects OBS tracks by range or Ctrl+A and queues Final STT once for the group", async () => {
    mock.listObsSessions.mockResolvedValue([{ id: "obs-1", status: "ready", createdAt: "2026-09-22T00:00:00Z", duration: 22,
      recordingAssetId: "asset-video", tracks: [
        { assetId: "asset-mic", sourceLabel: "Micro", streamIndex: 1, obsTrack: 1 },
        { assetId: "asset-tab", sourceLabel: "Tab họp", streamIndex: 2, obsTrack: 2 },
      ],
    }]);
    render(<ObsCapture onImportReady={vi.fn()} onOpenAsset={vi.fn()} projectId="project-1" />);
    const first = await screen.findByRole("checkbox", { name: "Ghép vào SRT: Micro" });
    const second = screen.getByRole("checkbox", { name: "Ghép vào SRT: Tab họp" });
    fireEvent.click(first);
    fireEvent.click(second, { shiftKey: true });
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Final STT đã chọn (2)" }));
    await waitFor(() => expect(mock.enqueueMediaTranscriptions).toHaveBeenCalledWith("project-1", ["asset-mic", "asset-tab"]));
    fireEvent.click(first);
    fireEvent.keyDown(screen.getByRole("region", { name: "Danh sách track OBS phiên obs-1" }), { key: "a", ctrlKey: true });
    expect(first).toBeChecked();
    expect(second).toBeChecked();
  });
});
