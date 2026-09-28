import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { ObsCaptureController } from "./ObsCaptureController";

const apiMocks = vi.hoisted(() => ({
  getObsLiveLinkStatus: vi.fn(), listObsLiveLinkRecordings: vi.fn(),
  actOnObsLiveLinkRecording: vi.fn(), setObsLiveLinkTriggerPolicy: vi.fn(),
  retryObsLiveLinkArchive: vi.fn(),
  setObsLiveLinkRecordingFolder: vi.fn(), importObsLiveLinkVideoSpan: vi.fn(), pickMediaFile: vi.fn(),
}));
vi.mock("../../api/client", () => ({ api: apiMocks }));

const connected = {
  connectionState: "connected", activeProject: { id: "project", name: "Test" },
  obsRecording: "idle", appRecording: null, pendingAction: null,
  triggerPolicy: { ignoreStart: false, ignorePause: false, ignoreStop: false },
  channels: [{ channelId: "one", alias: "Channel 1", nativeName: "Desktop Audio",
    missing: false, appliedForward: true, meterPeak: 6 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  apiMocks.getObsLiveLinkStatus.mockResolvedValue(connected);
  apiMocks.listObsLiveLinkRecordings.mockResolvedValue([]);
  apiMocks.actOnObsLiveLinkRecording.mockResolvedValue({ ...connected, pendingAction: "start" });
  apiMocks.setObsLiveLinkTriggerPolicy.mockImplementation(async (_project, policy) => ({
    ...connected, triggerPolicy: policy,
  }));
  apiMocks.retryObsLiveLinkArchive.mockResolvedValue({ artifactReady: true });
  apiMocks.setObsLiveLinkRecordingFolder.mockImplementation(async (enabled) => ({ ...connected, connectRecordingFolder: enabled }));
  apiMocks.importObsLiveLinkVideoSpan.mockResolvedValue({ id: "video-asset" });
  apiMocks.pickMediaFile.mockResolvedValue({ path: "C:\\OBS\\take.mkv" });
});

it("arms OBS recording through the backend and prevents another Start until ACK", async () => {
  render(<ObsCaptureController projectId="project" />);
  const start = await screen.findByRole("button", { name: "Record" });
  expect(start).toBeEnabled();
  expect(screen.getByText("Linked · Project armed · OBS idle · App idle")).toBeInTheDocument();
  fireEvent.click(start);
  await waitFor(() => expect(apiMocks.actOnObsLiveLinkRecording).toHaveBeenCalledWith("start"));
  expect(await screen.findByRole("button", { name: "Đang bắt đầu…" })).toBeDisabled();
});

it.each([
  ["receiving", "Recording", true],
  ["pending", "Waiting for PCM", false],
  ["forward-pending", "Forward pending", false],
  ["stalled", "PCM stalled", false],
  ["paused", "Paused", false],
  ["disabled", "Disabled", false],
  ["missing", "Missing", false],
  ["disconnected", "Disconnected", false],
] as const)("shows %s evidence without false REC", async (captureState, label, isReceiving) => {
  apiMocks.getObsLiveLinkStatus.mockResolvedValue({
    ...connected, obsRecording: "recording",
    appRecording: { recordingId: "rec-1", projectId: "project", status: "recording", videoSpanIds: ["span"], pauseCauses: [] },
    channels: [{ ...connected.channels[0], capture: { recordingId: "rec-1", projectId: "project",
      state: captureState, durableChunkCount: isReceiving ? 1 : 0 } }],
  });
  render(<ObsCaptureController projectId="project" />);
  const indicator = await screen.findByRole("status", { name: `Trạng thái Channel 1: ${label}` });
  expect(indicator).toHaveAttribute("data-state", captureState);
  expect(Boolean(indicator.textContent?.includes("REC"))).toBe(isReceiving);
  expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() => expect(apiMocks.actOnObsLiveLinkRecording).toHaveBeenCalledWith("pause"));
});

it("leaves the indicator gray when OBS records under Ignore Start", async () => {
  apiMocks.getObsLiveLinkStatus.mockResolvedValue({
    ...connected, obsRecording: "recording",
    triggerPolicy: { ignoreStart: true, ignorePause: false, ignoreStop: false },
  });
  render(<ObsCaptureController projectId="project" />);
  expect(await screen.findByRole("status", { name: "Trạng thái Channel 1: Idle" })).toHaveAttribute("data-state", "idle");
  expect(screen.queryByText("REC")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record" })).toBeEnabled();
});

it("keeps a paused app gray if its last channel evidence still says receiving", async () => {
  apiMocks.getObsLiveLinkStatus.mockResolvedValue({
    ...connected, obsRecording: "paused",
    appRecording: { recordingId: "rec-1", projectId: "project", status: "paused", videoSpanIds: [], pauseCauses: ["obs"] },
    channels: [{ ...connected.channels[0], capture: { recordingId: "rec-1", projectId: "project",
      state: "receiving", durableChunkCount: 2 } }],
  });
  render(<ObsCaptureController projectId="project" />);
  expect(await screen.findByRole("status", { name: "Trạng thái Channel 1: Paused" })).toHaveAttribute("data-state", "paused");
  expect(screen.queryByText("REC")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
});

it("resumes the same app recording without changing OBS Record", async () => {
  const paused = {
    ...connected, obsRecording: "idle",
    appRecording: { recordingId: "manual-1", projectId: "project", status: "paused", videoSpanIds: [], pauseCauses: [] },
    channels: [{ ...connected.channels[0], capture: { recordingId: "manual-1", projectId: "project",
      state: "paused", durableChunkCount: 2 } }],
  };
  apiMocks.getObsLiveLinkStatus.mockResolvedValue(paused);
  apiMocks.actOnObsLiveLinkRecording.mockResolvedValue({
    ...paused, pendingAction: "resume", appRecording: { ...paused.appRecording, status: "recording" },
  });
  render(<ObsCaptureController projectId="project" />);
  fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
  await waitFor(() => expect(apiMocks.actOnObsLiveLinkRecording).toHaveBeenCalledWith("resume"));
  expect(await screen.findByRole("button", { name: "Stop" })).toBeDisabled();
});

it("persists the multi-select Ignore policy for the current project", async () => {
  render(<ObsCaptureController projectId="project" />);
  const stopTrigger = await screen.findByRole("checkbox", { name: "Stop Recording" });
  fireEvent.click(stopTrigger);
  await waitFor(() => expect(apiMocks.setObsLiveLinkTriggerPolicy).toHaveBeenCalledWith(
    "project", { ignoreStart: false, ignorePause: false, ignoreStop: true },
  ));
});

it("retries a stopped capture archive from its project journal", async () => {
  const journal = { recording: { recordingId: "rec-1", projectId: "project",
    status: "stopped", archiveStatus: "pending", videoSpanIds: [] }, sourceStems: [] };
  apiMocks.listObsLiveLinkRecordings.mockResolvedValueOnce([journal]).mockResolvedValueOnce([
    { ...journal, recording: { ...journal.recording, archiveStatus: "ready" } },
  ]);
  render(<ObsCaptureController projectId="project" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thử tạo lại MKA" }));
  await waitFor(() => expect(apiMocks.retryObsLiveLinkArchive).toHaveBeenCalledWith("project", "rec-1"));
  expect(await screen.findByText(/MKA ready/)).toBeInTheDocument();
});

it("connects the OBS folder and imports the completed MKV for its own span", async () => {
  const journal = { recording: { recordingId: "rec-2", projectId: "project",
    status: "stopped", archiveStatus: "ready", videoSpanIds: ["span-1"] },
    videoSpans: [{ spanId: "span-1", endedMonotonicNs: 42, importedVideoAssetId: null,
      recordingFileName: "take.mkv", recordingFolder: "C:\\OBS", recordingFileAvailable: true }] };
  apiMocks.listObsLiveLinkRecordings.mockResolvedValue([journal]);
  render(<ObsCaptureController projectId="project" />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Connect to OBS recording folder" }));
  await waitFor(() => expect(apiMocks.setObsLiveLinkRecordingFolder).toHaveBeenCalledWith(true));
  fireEvent.click(await screen.findByRole("button", { name: "Import MKV from OBS" }));
  await waitFor(() => expect(apiMocks.importObsLiveLinkVideoSpan).toHaveBeenCalledWith("project", "span-1", undefined));
});

it("opens Browse in the span's OBS folder", async () => {
  const journal = { recording: { recordingId: "rec-3", projectId: "project",
    status: "stopped", archiveStatus: "ready", videoSpanIds: ["span-2"] },
    videoSpans: [{ spanId: "span-2", endedMonotonicNs: 42, importedVideoAssetId: null,
      recordingFileName: null, recordingFolder: "D:\\Recordings", recordingFileAvailable: false }] };
  apiMocks.listObsLiveLinkRecordings.mockResolvedValue([journal]);
  render(<ObsCaptureController projectId="project" />);
  fireEvent.click(await screen.findByRole("button", { name: "Browse MKV" }));
  await waitFor(() => expect(apiMocks.pickMediaFile).toHaveBeenCalledWith("D:\\Recordings"));
  await waitFor(() => expect(apiMocks.importObsLiveLinkVideoSpan).toHaveBeenCalledWith("project", "span-2", "C:\\OBS\\take.mkv"));
});
