import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { ObsCaptureController } from "./ObsCaptureController";

const apiMocks = vi.hoisted(() => ({
  getObsLiveLinkStatus: vi.fn(), listObsLiveLinkRecordings: vi.fn(),
  actOnObsLiveLinkRecording: vi.fn(), setObsLiveLinkTriggerPolicy: vi.fn(),
  retryObsLiveLinkArchive: vi.fn(),
  retryObsLiveLinkOutbox: vi.fn(), exportObsLiveLinkOutbox: vi.fn(),
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
  apiMocks.retryObsLiveLinkOutbox.mockResolvedValue({ retriedChunks: 2, durablyAccepted: false });
  apiMocks.exportObsLiveLinkOutbox.mockResolvedValue(undefined);
  apiMocks.setObsLiveLinkRecordingFolder.mockImplementation(async (enabled) => ({ ...connected, connectRecordingFolder: enabled }));
  apiMocks.importObsLiveLinkVideoSpan.mockResolvedValue({ id: "video-asset" });
  apiMocks.pickMediaFile.mockResolvedValue({ path: "C:\\OBS\\take.mkv" });
});

it("shows unknown outbox health for a legacy plugin instead of an empty queue", async () => {
  render(<ObsCaptureController projectId="project" />);
  expect(await screen.findByText("Plugin chưa báo trạng thái dữ liệu chờ gửi.")).toBeInTheDocument();
  expect(screen.queryByText(/Còn giữ 0 đoạn/)).not.toBeInTheDocument();
});

it("scopes retry and export to the stopped recording and never reports retry as accepted PCM", async () => {
  apiMocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: {
    recordingId: "stopped-rec", projectId: "project", status: "stopped", archiveStatus: "ready",
    videoSpanIds: [], pauseCauses: [],
  } }]);
  render(<ObsCaptureController projectId="project" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thử gửi lại PCM" }));
  await waitFor(() => expect(apiMocks.retryObsLiveLinkOutbox).toHaveBeenCalledWith("project", "stopped-rec"));
  expect(await screen.findByText(/2 đoạn được mở lại để gửi. Chưa xác nhận đã lưu vào project/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Export outbox" }));
  await waitFor(() => expect(apiMocks.exportObsLiveLinkOutbox).toHaveBeenCalledWith("project", "stopped-rec"));
  expect(await screen.findByText(/dữ liệu gốc vẫn trong outbox/)).toBeInTheDocument();
});

it("retains recovery errors while normal status polling succeeds", async () => {
  apiMocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: {
    recordingId: "stopped-rec", projectId: "project", status: "stopped", archiveStatus: "ready", videoSpanIds: [],
  } }]);
  apiMocks.exportObsLiveLinkOutbox.mockRejectedValue(new Error("Export failed; original PCM retained"));
  render(<ObsCaptureController projectId="project" />);
  fireEvent.click(await screen.findByRole("button", { name: "Export outbox" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Export failed; original PCM retained");
  await waitFor(() => expect(apiMocks.getObsLiveLinkStatus.mock.calls.length).toBeGreaterThan(1), { timeout: 2500 });
  expect(screen.getByRole("alert")).toHaveTextContent("Export failed; original PCM retained");
});

it("keeps retained and rejected PCM independent of a quiet Track and marks stale reports", async () => {
  apiMocks.getObsLiveLinkStatus.mockResolvedValue({ ...connected, connectionState: "disconnected",
    outbox: { readable: true, retainedChunks: 12, rejectedChunks: 2,
      oldestRetainedAgeMs: 30000, memoryFrames: 480, unspooledChunks: 1,
      overflowFrames: 8192, lastSpoolError: "append: disk full", reportAgeSeconds: 16, stale: true } });
  render(<ObsCaptureController projectId="project" />);
  expect(await screen.findByText("Còn giữ 12 đoạn · bị từ chối 2 đoạn")).toBeInTheDocument();
  expect(screen.getByText(/Trạng thái cũ/)).toBeInTheDocument();
  expect(screen.getByText(/30 giây tại lần báo gần nhất/)).toBeInTheDocument();
  expect(screen.getByText(/Lỗi lưu đĩa gần nhất: append: disk full/)).toBeInTheDocument();
  expect(screen.getByText(/có thể gồm trước khi Record/)).toBeInTheDocument();
});

it("does not show healthy zero counts when the spool cannot be read", async () => {
  apiMocks.getObsLiveLinkStatus.mockResolvedValue({ ...connected,
    outbox: { readable: false, retainedChunks: null, rejectedChunks: null,
      oldestRetainedAgeMs: null, memoryFrames: 0, unspooledChunks: 0,
      overflowFrames: 0, lastSpoolError: "open failed", reportAgeSeconds: 0, stale: false } });
  render(<ObsCaptureController projectId="project" />);
  expect(await screen.findByText("Không đọc được outbox · chưa biết số đoạn còn giữ")).toBeInTheDocument();
  expect(screen.getByText("Đoạn chờ lâu nhất: chưa rõ")).toBeInTheDocument();
  expect(screen.queryByText(/Còn giữ 0 đoạn/)).not.toBeInTheDocument();
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

it("shows Stop as pending until the app recording receives its OBS ACK", async () => {
  const running = { ...connected, obsRecording: "recording",
    appRecording: { recordingId: "rec-1", projectId: "project", status: "recording",
      videoSpanIds: ["span"], pauseCauses: [] } };
  apiMocks.getObsLiveLinkStatus.mockResolvedValue(running);
  apiMocks.actOnObsLiveLinkRecording.mockResolvedValue({ ...running, pendingAction: "stop" });
  render(<ObsCaptureController projectId="project" />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
  await waitFor(() => expect(apiMocks.actOnObsLiveLinkRecording).toHaveBeenCalledWith("stop"));
  expect(await screen.findByRole("button", { name: "Đang dừng…" })).toBeDisabled();
});

it("does not restore an older recording state from a poll begun before Stop", async () => {
  const running = { ...connected, obsRecording: "recording",
    appRecording: { recordingId: "rec-1", projectId: "project", status: "recording",
      videoSpanIds: ["span"], pauseCauses: [] } };
  let resolveOldPoll: (value: typeof running) => void = () => undefined;
  const oldPoll = new Promise<typeof running>((resolve) => { resolveOldPoll = resolve; });
  apiMocks.getObsLiveLinkStatus.mockResolvedValueOnce(running).mockReturnValueOnce(oldPoll);
  apiMocks.actOnObsLiveLinkRecording.mockResolvedValue({ ...running, pendingAction: "stop" });
  const timerCallbacks: Array<() => void> = [];
  const interval = vi.spyOn(window, "setInterval").mockImplementation((handler) => {
    timerCallbacks.push(handler as () => void);
    return 42;
  });
  try {
    render(<ObsCaptureController projectId="project" />);
    const stop = await screen.findByRole("button", { name: "Stop" });
    timerCallbacks[0]?.();
    await waitFor(() => expect(apiMocks.getObsLiveLinkStatus).toHaveBeenCalledTimes(2));
    fireEvent.click(stop);
    expect(await screen.findByRole("button", { name: "Đang dừng…" })).toBeDisabled();
    await act(async () => resolveOldPoll(running));
    expect(screen.getByRole("button", { name: "Đang dừng…" })).toBeDisabled();
  } finally {
    interval.mockRestore();
  }
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
] as const)("shows %s evidence with a persistent REC or PAUSE indicator", async (captureState, label, isReceiving) => {
  apiMocks.getObsLiveLinkStatus.mockResolvedValue({
    ...connected, obsRecording: "recording",
    appRecording: { recordingId: "rec-1", projectId: "project", status: "recording", videoSpanIds: ["span"], pauseCauses: [] },
    channels: [{ ...connected.channels[0], capture: { recordingId: "rec-1", projectId: "project",
      state: captureState, durableChunkCount: isReceiving ? 1 : 0 } }],
  });
  render(<ObsCaptureController projectId="project" />);
  const indicator = await screen.findByRole("status", { name: `Trạng thái Track 1: ${label}` });
  expect(indicator).toHaveAttribute("data-state", captureState);
  expect(indicator).toHaveTextContent(captureState === "paused" ? "PAUSE" : "REC");
  expect(indicator).toHaveAttribute("data-recording", String(isReceiving));
  expect(indicator.querySelector("i")).toBeInTheDocument();
  if (isReceiving) expect(indicator.closest(".obs-recorder__channel")).toHaveClass("is-receiving");
  else expect(indicator.closest(".obs-recorder__channel")).not.toHaveClass("is-receiving");
  expect(indicator.parentElement?.firstElementChild).toBe(indicator);
  expect(screen.getByText(new RegExp(`PCM ${isReceiving ? 1 : 0}`))).toBeInTheDocument();
  expect(screen.getByRole("meter", { name: /Tín hiệu OBS Track 1, không xác nhận PCM đã lưu/ })).toBeInTheDocument();
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
  expect(await screen.findByRole("status", { name: "Trạng thái Track 1: Idle" })).toHaveAttribute("data-state", "idle");
  expect(screen.getByRole("status", { name: "Trạng thái Track 1: Idle" })).toHaveTextContent("REC");
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
  expect(await screen.findByRole("status", { name: "Trạng thái Track 1: Paused" })).toHaveAttribute("data-state", "paused");
  expect(screen.getByRole("status", { name: "Trạng thái Track 1: Paused" })).toHaveTextContent("PAUSE");
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

it("automatically retries the latest failed MKA once after Stop", async () => {
  const failed = { recording: { recordingId: "rec-failed", projectId: "project",
    status: "stopped", archiveStatus: "error", videoSpanIds: [] }, sourceStems: [] };
  apiMocks.listObsLiveLinkRecordings.mockResolvedValueOnce([failed]).mockResolvedValue([
    { ...failed, recording: { ...failed.recording, archiveStatus: "ready" } },
  ]);
  render(<ObsCaptureController projectId="project" />);
  await waitFor(() => expect(apiMocks.retryObsLiveLinkArchive).toHaveBeenCalledWith("project", "rec-failed"));
  expect(apiMocks.retryObsLiveLinkArchive).toHaveBeenCalledTimes(1);
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

it("announces a completed archive once so Media Pool can refresh without F5", async () => {
  const onArchiveReady = vi.fn().mockResolvedValue(undefined);
  const pending = { recording: { recordingId: "rec-ready", projectId: "project", status: "stopped", archiveStatus: "pending", videoSpanIds: [] } };
  apiMocks.listObsLiveLinkRecordings.mockResolvedValueOnce([pending]).mockResolvedValue([
    { ...pending, recording: { ...pending.recording, archiveStatus: "ready" } },
  ]);
  const callbacks: Array<() => void> = [];
  const interval = vi.spyOn(window, "setInterval").mockImplementation((handler) => {
    callbacks.push(handler as () => void);
    return 42;
  });
  try {
    render(<ObsCaptureController onArchiveReady={onArchiveReady} projectId="project" />);
    await waitFor(() => expect(apiMocks.listObsLiveLinkRecordings).toHaveBeenCalledTimes(1));
    expect(onArchiveReady).not.toHaveBeenCalled();
    callbacks[0]?.();
    await waitFor(() => expect(onArchiveReady).toHaveBeenCalledWith("rec-ready"));
    callbacks[0]?.();
    await waitFor(() => expect(apiMocks.listObsLiveLinkRecordings).toHaveBeenCalledTimes(3));
    expect(onArchiveReady).toHaveBeenCalledTimes(1);
  } finally {
    interval.mockRestore();
  }
});
