import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ObsLiveLinkStatus, ObsLiveLinkTranscriptRow, ObsLiveLinkWaveform } from "../../domain/types";
import { ObsLiveLinkTimeline } from "./ObsLiveLinkTimeline";

const mocks = vi.hoisted(() => ({
  listObsLiveLinkRecordings: vi.fn(), getObsLiveLinkWaveform: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("../../api/client", () => ({ api: {
  listObsLiveLinkRecordings: mocks.listObsLiveLinkRecordings,
  getObsLiveLinkWaveform: mocks.getObsLiveLinkWaveform,
} }));
vi.mock("../obs-capture/obs-waveform-feed", () => ({
  subscribeObsLiveLinkWaveforms: mocks.subscribe,
}));

const ids = ["channel-a", "channel-b"];
const wave = (channelId: string, amplitude: number, source: "pcm" | "mka"): ObsLiveLinkWaveform => ({
  recordingId: "recording", projectId: "project", channelId, source,
  sampleAxis: source === "pcm" ? "channel" : "recording", sampleRate: 48000,
  startSeconds: 0, endSeconds: source === "pcm" ? 60 : 10,
  lastDurableSequence: 0, lastIncludedSequence: -1, hasMore: false,
  points: [
    { startFrame: 0, endFrame: 2400, firstSampleIndex: source === "pcm" ? 0 : null,
      lastSampleIndexExclusive: source === "pcm" ? 2400 : null,
      min: -amplitude, max: amplitude, peak: amplitude },
    ...(source === "pcm" && channelId === ids[0] ? [{ startFrame: 2400, endFrame: 4800,
      firstSampleIndex: null, lastSampleIndexExclusive: null,
      min: null, max: null, peak: null }] : []),
  ],
  gaps: source === "mka" && channelId === ids[0]
    ? [{ startFrame: 2400, endFrame: 4800, classification: "transport-gap" }] : [],
});

const recording = {
  recordingId: "recording", projectId: "project", status: "recording",
  archiveStatus: "pending", startedMonotonicNs: 1_000_000_000,
  startedAtUtc: new Date(Date.now() - 2_000).toISOString(), endedMonotonicNs: null,
  pauseCauses: [], videoSpanIds: [], channelIntervals: [],
  capturePauseIntervals: [{ startMonotonicNs: 1_300_000_000, endMonotonicNs: 1_500_000_000 }],
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listObsLiveLinkRecordings.mockResolvedValue([]);
  mocks.getObsLiveLinkWaveform.mockImplementation(async (_project: string, _record: string, channel: string) =>
    wave(channel, channel === ids[0] ? 12000 : 3000, "mka"));
  mocks.subscribe.mockReturnValue(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const captionRow = (channelId: string, startSeconds: number, text: string,
                    status: ObsLiveLinkTranscriptRow["status"] = "partial"): ObsLiveLinkTranscriptRow => ({
  schemaVersion: 1, eventRevision: startSeconds + 1, firstEventRevision: startSeconds + 1,
  recordingId: "recording", channelId, sourceUuid: `source-${channelId}`,
  alias: channelId === ids[0] ? "Channel 1" : "Channel 2", utteranceId: `${channelId}-${startSeconds}`,
  revision: 1, firstSampleIndex: startSeconds * 48000,
  lastSampleIndexExclusive: (startSeconds + 1) * 48000, sampleRate: 48000,
  startSeconds, endSeconds: startSeconds + 1, status, text, pending: "",
  timingTrust: "segment", lagSeconds: 0.1, error: null,
});

it("shows a draft caption per live lane, including a new listening row for B", async () => {
  const a = captionRow(ids[0], 0.5, "A đang nói");
  const b = captionRow(ids[1], 1, "", "listening");
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} transcriptRows={[a, b]} />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  act(() => onStatus({ appRecording: recording, channels: ids.map((channelId, index) => ({
    channelId, alias: `Channel ${index + 1}`, nativeName: `Mic ${index + 1}`,
    slot: index + 1, appliedForward: true, desiredForward: true,
    capture: { recordingId: "recording", projectId: "project", durableChunkCount: 1 },
  })) } as unknown as ObsLiveLinkStatus));
  await screen.findByLabelText("Phụ đề nháp Channel 2");
  expect(screen.getByLabelText("Phụ đề nháp Channel 1")).toHaveTextContent("A đang nói");
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveTextContent("Đang nghe…");
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null}
    transcriptRows={[a, { ...b, text: "B chen vào", status: "partial", revision: 2 }]} />);
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveTextContent("B chen vào");
  expect(screen.getByLabelText("Phụ đề nháp Channel 1")).toHaveTextContent("A đang nói");
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveTextContent("B chen vào");
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null}
    transcriptRows={[a, { ...b, text: "B chen vào", status: "partial", revision: 2 }]}
    seekRequest={{ recordingId: "recording", channelId: ids[0], seconds: 0.5, serial: 1 }} />);
  expect(screen.getByRole("button", { name: "VỀ LIVE" })).toBeInTheDocument();
  expect(screen.getByLabelText("Phụ đề nháp Channel 1")).toHaveTextContent("A đang nói");
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveTextContent("Chưa có lời nói");
});

it("seeks a Script row to its own archived source and recording time", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 8_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const rows = [captionRow(ids[0], 1, "A"), captionRow(ids[1], 3, "B")];
  const onRecordingIdChange = vi.fn();
  const view = render(<ObsLiveLinkTimeline onRecordingIdChange={onRecordingIdChange}
    projectId="project" requestedRecordingId="recording" transcriptRows={rows} />);
  await screen.findByLabelText("Phụ đề nháp Channel 2");
  view.rerender(<ObsLiveLinkTimeline onRecordingIdChange={onRecordingIdChange}
    projectId="project" requestedRecordingId="recording" transcriptRows={rows}
    seekRequest={{ recordingId: "recording", channelId: ids[1], seconds: 3, serial: 1 }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveTextContent("B");
  expect(screen.getByText("00:03")).toBeInTheDocument();
  expect(screen.getByLabelText("Lượt nói Channel 2 tại 3.00s")).toBeInTheDocument();
});

it("places overlap markers on both archived stems and clears red after A stops", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 9_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const a = { ...captionRow(ids[0], 1, "A nói"), endSeconds: 5, lastSampleIndexExclusive: 5 * 48000 };
  const b = { ...captionRow(ids[1], 2, "B nói tiếp"), endSeconds: 7, lastSampleIndexExclusive: 7 * 48000 };
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" transcriptRows={[a, b]} />);
  const marker = await screen.findByRole("button", { name: "Nghe lại chồng tiếng Channel 2 từ 00:02.00 đến 00:05.00" });
  expect(screen.getByRole("button", { name: "Nghe lại chồng tiếng Channel 1 từ 00:02.00 đến 00:05.00" })).toBeInTheDocument();
  fireEvent.click(marker);
  expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "true");
  const audio = view.container.querySelector("audio") as HTMLAudioElement;
  expect(audio.src).toContain("asset-1/audio");
  Object.defineProperty(audio, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_METADATA });
  fireEvent.loadedMetadata(audio);
  await waitFor(() => expect(play).toHaveBeenCalled());
  expect(audio.currentTime).toBe(2);
  expect(screen.getByLabelText("Phụ đề nháp Channel 1")).toHaveClass("is-overlap");
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveClass("is-overlap");
  audio.currentTime = 5;
  fireEvent.timeUpdate(audio);
  expect(pause).toHaveBeenCalled();
  expect(audio.currentTime).toBe(5);
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).not.toHaveClass("is-overlap");
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.getByRole("button", { name: "Nghe lại chồng tiếng Channel 2 từ 00:02.00 đến 00:05.00" })).toBeInTheDocument();
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording"
    transcriptRows={[a, b]} seekRequest={{ recordingId: "recording", channelId: ids[1], seconds: 5, serial: 1 }} />);
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).not.toHaveClass("is-overlap");
});

it("keeps the chosen layout while reporting the playhead to the parent Script", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 9_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  function Host() {
    const [playhead, setPlayhead] = useState(0);
    return <><output data-testid="parent-playhead">{playhead}</output>
      <ObsLiveLinkTimeline onPlayheadChange={(seconds) => setPlayhead(seconds)} projectId="project"
        requestedRecordingId="recording" transcriptRows={[captionRow(ids[0], 1, "A")]} /></>;
  }
  render(<Host />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.getByRole("button", { name: "CỘT" })).toHaveAttribute("aria-pressed", "true");
});

it("draws separate live source paths under one ruler and playhead", async () => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  const onSnapshot = mocks.subscribe.mock.calls[0]?.[2] as (next: ObsLiveLinkWaveform) => void;
  const live = { appRecording: recording, channels: ids.map((channelId, index) => ({
    channelId, alias: `Channel ${index + 1}`, nativeName: `Mic ${index + 1}`, slot: index + 1,
    appliedForward: true, desiredForward: true,
    capture: { recordingId: "recording", projectId: "project", durableChunkCount: 1, lastDurableSequence: 0 },
  })) } as unknown as ObsLiveLinkStatus;
  act(() => onStatus(live));
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  act(() => { onSnapshot(wave(ids[0], 12000, "pcm")); onSnapshot(wave(ids[1], 3000, "pcm")); });
  await waitFor(() => {
    const first = screen.getByRole("img", { name: "Sóng âm Channel 1" }).querySelector("path")?.getAttribute("d");
    const second = screen.getByRole("img", { name: "Sóng âm Channel 2" }).querySelector("path")?.getAttribute("d");
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
  expect(screen.getAllByLabelText("Ruler chung")).toHaveLength(1);
  expect(screen.getAllByLabelText("Playhead chung")).toHaveLength(1);
  expect(screen.getAllByLabelText("Channel 1: app-paused")).toHaveLength(1);
  expect(screen.getByLabelText("Channel 1: thiếu PCM")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Phát track OBS" })).toBeDisabled();
});

it("reopens a stopped MKA recording with source-owned playback and seek", async () => {
  const stopped = { ...recording, status: "stopped", archiveStatus: "ready",
    endedMonotonicNs: 7_000_000_000,
    sourceArchive: { parentAssetId: "parent", sourcePath: "assets/obs-livelink/recording/source.mka",
      tracks: ids.map((channelId, streamIndex) => ({ channelId, sourceUuid: `source-${streamIndex}`,
        streamIndex, trackUid: streamIndex + 1, relayLabel: `Channel ${streamIndex + 1}`,
        aliasRevision: 0, analysisPath: `assets/media/asset-${streamIndex}/analysis.wav` })) },
  };
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3, recording: stopped,
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`, relayLabel: `Channel ${index + 1}`,
      slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "",
      gaps: [] })),
  }]);
  const { container } = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  expect(screen.getByText("Mic 1")).toBeInTheDocument();
  await waitFor(() => expect(mocks.getObsLiveLinkWaveform).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("img", { name: "Sóng âm Channel 1" }).querySelector("path")?.getAttribute("d")).toBeTruthy());
  expect(container.querySelector("audio")?.getAttribute("src")).toContain("asset-0/audio");
  fireEvent.click(screen.getByRole("button", { name: "Nghe kênh Channel 2" }));
  expect(container.querySelector("audio")?.getAttribute("src")).toContain("asset-1/audio");
  expect(screen.getByRole("button", { name: "Phát track OBS" })).toBeEnabled();
  const lane = screen.getByRole("img", { name: "Sóng âm Channel 2" });
  vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  fireEvent.click(lane, { clientX: 30 });
  expect(screen.getByText("00:03")).toBeInTheDocument();
  fireEvent.loadedMetadata(container.querySelector("audio") as HTMLAudioElement);
  expect((container.querySelector("audio") as HTMLAudioElement).currentTime).toBe(3);
  expect(screen.getByLabelText("Channel 1: transport-gap")).toBeInTheDocument();
});

it("clamps the shared playhead to the archive duration after live capture stops", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready",
      endedMonotonicNs: 2_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  act(() => onStatus({ appRecording: recording, channels: [{ channelId: ids[0],
    alias: "Channel 1", nativeName: "Mic 1", slot: 1, appliedForward: true,
    capture: { recordingId: "recording", durableChunkCount: 1 } }] } as unknown as ObsLiveLinkStatus));
  await waitFor(() => expect(screen.getByText("REC LIVE")).toBeInTheDocument());
  act(() => onStatus({ appRecording: null, channels: [] } as unknown as ObsLiveLinkStatus));
  await waitFor(() => expect(screen.getByText("MKA READY")).toBeInTheDocument());
  expect(screen.getAllByText("00:01")).toHaveLength(2);
});

it.each([1, 2, 5, 20])("keeps %i live channels reachable in both layouts", async (count) => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  act(() => onStatus({ appRecording: recording, channels: Array.from({ length: count }, (_, index) => ({
    channelId: `channel-${index}`, alias: `Channel ${index + 1}`, nativeName: `Mic ${index + 1}`,
    slot: index + 1, appliedForward: true, desiredForward: true, meterPeak: index / count,
    capture: { recordingId: "recording", projectId: "project", durableChunkCount: 1 },
  })) } as unknown as ObsLiveLinkStatus));
  await waitFor(() => expect(screen.getAllByRole("img", { name: /^Sóng âm Channel/ })).toHaveLength(count));
  expect(screen.getAllByRole("meter", { name: /^Level nguồn Channel/ })).toHaveLength(count);
  expect(screen.getAllByRole("slider", { name: /^Gain nghe lại Channel/ })).toHaveLength(count);
  expect(screen.getAllByLabelText("Ruler chung")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.getByLabelText("Timeline đa kênh OBS")).toHaveClass("is-columns");
  expect(screen.getAllByLabelText(/^Ruler Channel/)).toHaveLength(count);
  expect(screen.getAllByRole("img", { name: /^Sóng âm Channel/ })).toHaveLength(count);
  fireEvent.click(screen.getByRole("button", { name: "LAYER" }));
  expect(screen.getByLabelText("Timeline đa kênh OBS")).toHaveClass("is-layers");
});

it("keeps archive seek and each preview gain across layout and zoom changes", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 41_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const { container } = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  await waitFor(() => expect(screen.getByRole("meter", { name: "Level nguồn Channel 1" })).toHaveAttribute("aria-valuenow", "37"));
  const gainA = screen.getByRole("slider", { name: "Gain nghe lại Channel 1" });
  fireEvent.change(gainA, { target: { value: "42" } });
  expect(gainA).toHaveValue("42");
  expect((container.querySelector("audio") as HTMLAudioElement).volume).toBeCloseTo(.42);
  expect(screen.getByRole("meter", { name: "Level nguồn Channel 1" })).toHaveAttribute("aria-valuenow", "37");
  const lane = screen.getByRole("img", { name: "Sóng âm Channel 1" });
  vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  fireEvent.click(lane, { clientX: 30 });
  expect(screen.getByText("00:12")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CỘT" }).compareDocumentPosition(
    screen.getByRole("button", { name: "MARK IN" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "MARK IN" }));
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.getByLabelText("Mark In Channel 1")).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" })).toHaveValue("42");
  expect(screen.getByText("00:12")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline OBS" }));
  expect(screen.getByText("30s")).toBeInTheDocument();
  expect(screen.getByText("00:12")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "LAYER" }));
  expect(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" })).toHaveValue("42");
  fireEvent.click(screen.getByRole("button", { name: "Nghe kênh Channel 2" }));
  expect((container.querySelector("audio") as HTMLAudioElement).volume).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Nghe kênh Channel 1" }));
  expect((container.querySelector("audio") as HTMLAudioElement).volume).toBeCloseTo(.42);
});

it("shows the actual visible time span for a short archive", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 7_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  expect(screen.getByText("10s")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Phóng to Timeline OBS" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Thu nhỏ Timeline OBS" })).toBeDisabled();
});

it("boosts only preview playback through a channel-scoped Web Audio gain node", async () => {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const graph = { createMediaElementSource: vi.fn(() => source), createGain: vi.fn(() => gain),
    destination: {}, resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
  vi.stubGlobal("AudioContext", function MockAudioContext() { return graph; });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 7_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const { container } = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  fireEvent.change(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" }),
    { target: { value: "150" } });
  fireEvent.click(screen.getByRole("button", { name: "Phát track OBS" }));
  expect(graph.createMediaElementSource).toHaveBeenCalledWith(container.querySelector("audio"));
  expect(gain.gain.value).toBe(1.5);
  expect((container.querySelector("audio") as HTMLAudioElement).volume).toBe(1);
  expect(screen.getByRole("meter", { name: "Level nguồn Channel 1" })).toHaveAttribute("aria-valuenow", "37");
  fireEvent.click(screen.getByRole("button", { name: "Nghe kênh Channel 2" }));
  expect(source.disconnect).toHaveBeenCalled();
  expect(graph.close).toHaveBeenCalled();
  expect(container.querySelector("audio")?.getAttribute("src")).toContain("asset-1/audio");
});
