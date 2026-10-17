import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ObsLiveLinkStatus, ObsLiveLinkTranscriptRow, ObsLiveLinkWaveform, ProjectMediaAsset } from "../../domain/types";
import { ObsLiveLinkTimeline } from "./ObsLiveLinkTimeline";
import { PreviewMixerProvider } from "./preview-mixer";
import { ModuleRegistry, type StudioContext } from "../registry/ModuleRegistry";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { publishPlaybackWords, requestPlaybackSeek } from "../../domain/playback-sync";

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

it("limits selected archived OBS playback to one track while preserving mute and gain", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording, status: "stopped",
    archiveStatus: "ready", endedMonotonicNs: 11_000_000_000 }, channels: [],
    sourceStems: ids.map((channelId, index) => ({ channelId, alias: `Channel ${index + 1}`, assetId: `asset-${index}` })) }]);
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  fireEvent.change(screen.getByRole("slider", { name: "Gain nghe lại Channel 2" }), { target: { value: "37" } });
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 1" }));
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" visibleAssetId="asset-1" />);
  expect(view.container.querySelectorAll("audio")).toHaveLength(1);
  expect(view.container.querySelector("audio")?.getAttribute("src")).toContain("asset-1/audio");
  expect(view.container.querySelector("audio")?.volume).toBe(.37);
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  expect(screen.getByRole("button", { name: "Bật tiếng Channel 1" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("slider", { name: "Gain nghe lại Channel 2" })).toHaveValue("37");
});

it("solos selected OBS tracks without resetting gain or overriding mute", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording, status: "stopped",
    archiveStatus: "ready", endedMonotonicNs: 11_000_000_000 }, channels: [],
    sourceStems: ids.map((channelId, index) => ({ channelId, alias: `Channel ${index + 1}`, assetId: `asset-${index}` })) }]);
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  fireEvent.change(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" }), { target: { value: "42" } });
  fireEvent.click(screen.getByRole("button", { name: "Solo Channel 1" }));
  expect([...view.container.querySelectorAll("audio")].map((audio) => audio.volume)).toEqual([.42, 0]);
  fireEvent.click(screen.getByRole("button", { name: "Solo Channel 2" }));
  expect([...view.container.querySelectorAll("audio")].map((audio) => audio.volume)).toEqual([.42, 1]);
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 1" }));
  expect([...view.container.querySelectorAll("audio")].map((audio) => audio.volume)).toEqual([0, 1]);
  fireEvent.click(screen.getByRole("button", { name: "Bỏ Solo Channel 2" }));
  expect([...view.container.querySelectorAll("audio")].map((audio) => audio.volume)).toEqual([0, 0]);
  expect(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" })).toHaveValue("42");
});

it("retains OBS preview controls across Timeline unmounts in the project session", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording, status: "stopped",
    archiveStatus: "ready", endedMonotonicNs: 11_000_000_000 }, channels: [],
    sourceStems: ids.map((channelId, index) => ({ channelId, alias: `Channel ${index + 1}`, assetId: `asset-${index}` })) }]);
  const timeline = <ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />;
  const view = render(<PreviewMixerProvider>{timeline}</PreviewMixerProvider>);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  fireEvent.change(screen.getByRole("slider", { name: "Gain nghe lại Channel 2" }), { target: { value: "29" } });
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Solo Channel 2" }));
  view.rerender(<PreviewMixerProvider><p>Another workspace view</p></PreviewMixerProvider>);
  expect(view.container.querySelectorAll("audio")).toHaveLength(0);
  view.rerender(<PreviewMixerProvider>{timeline}</PreviewMixerProvider>);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  expect(screen.getByRole("slider", { name: "Gain nghe lại Channel 2" })).toHaveValue("29");
  expect(screen.getByRole("button", { name: "Bật tiếng Channel 2" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Bỏ Solo Channel 2" })).toHaveAttribute("aria-pressed", "true");
  expect([...view.container.querySelectorAll("audio")].map((audio) => audio.volume)).toEqual([0, 0]);
});

it("uses one shared track subset for archived OBS Script and audio", async () => {
  const channels = [...ids, "channel-c"];
  const tracks = channels.map((channelId, index) => ({ id: `asset-${index}`, name: `Track ${index + 1}`,
    sourceArchiveAssetId: "parent", obsRecordingId: "recording", importSelected: true, duration: 10,
    text: `phrase${index}`, words: [{ text: `phrase${index}`, start: 1, end: 2 }] })) as ProjectMediaAsset[];
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording, status: "stopped",
    archiveStatus: "ready", endedMonotonicNs: 11_000_000_000 }, channels: [],
    sourceStems: channels.map((channelId, index) => ({ channelId, alias: `Channel ${index + 1}`, assetId: `asset-${index}` })) }]);
  const context = { workflow: "speech-to-text", projectId: "project", selectedAssetId: "parent",
    selectedImportedTrackId: null, selectedScriptAssetIds: ["asset-0", "asset-1"],
    mediaAssets: [{ id: "parent", name: "Footage", importSelected: true, obsRecordingId: "recording", words: [], text: "" }, ...tracks],
    take: null, script: "", trainingCatalog: { speakers: [], environmentProfiles: [] }, readingSession: null,
    wordSelection: EMPTY_SELECTION, obsTimelineActive: true, obsTimelineRecordingId: "recording", obsTranscriptRows: [],
    obsSeekRequest: null, onSelectImportedTrack: vi.fn(), onAssetWordsChange: vi.fn() } as unknown as StudioContext;
  const view = render(<><ModuleRegistry context={context} id="script" /><ModuleRegistry context={context} id="timeline" /></>);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  expect(screen.queryByRole("img", { name: "Sóng âm Channel 3" })).not.toBeInTheDocument();
  expect(view.container.querySelectorAll("audio")).toHaveLength(2);
  const script = within(screen.getByLabelText("Script theo channel"));
  expect(script.getByRole("button", { name: /^phrase0 ·/ })).toBeInTheDocument();
  expect(script.getByRole("button", { name: /^phrase1 ·/ })).toBeInTheDocument();
  expect(script.queryByRole("button", { name: /^phrase2 ·/ })).not.toBeInTheDocument();
});
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
afterEach(() => { publishPlaybackWords({}); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function archivedWorkspace(singleTrack = false) {
  const tracks = [
    { id: "asset-0", name: "Channel 1", words: [{ text: "Xin", start: 1, end: 2 }, { text: "chào", start: 3, end: 4 }] },
    { id: "asset-1", name: "Channel 2", words: [{ text: "Đồng", start: 3, end: 4 }, { text: "thời", start: 5, end: 6 }] },
  ].map((track) => ({ ...track, duration: 10, text: track.words.map((word) => word.text).join(" "),
    obsRecordingId: "recording", sourceArchiveAssetId: "parent", importSelected: true })) as ProjectMediaAsset[];
  const assets = [{ id: "parent", name: "OBS footage", obsRecordingId: "recording", words: [], text: "" }, ...tracks] as ProjectMediaAsset[];
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording, status: "stopped",
    archiveStatus: "ready", endedMonotonicNs: 11_000_000_000 }, channels: [],
    sourceStems: ids.map((channelId, index) => ({ channelId, alias: `Channel ${index + 1}`, assetId: `asset-${index}` })) }]);
  const playhead = vi.fn();
  let refreshAssets = () => {};
  function Workspace() {
    const [selection, setSelection] = useState<WordSelection>(EMPTY_SELECTION);
    const [mediaAssets, setMediaAssets] = useState(assets);
    refreshAssets = () => setMediaAssets((current) => structuredClone(current));
    const context = { workflow: "speech-to-text", projectId: "project", projectName: "OBS test",
      selectedAssetId: "parent", selectedImportedTrackId: singleTrack ? "asset-0" : null,
      selectedScriptAssetIds: [singleTrack ? "asset-0" : "parent"], mediaAssets,
      take: singleTrack ? tracks[0] : null, script: singleTrack ? tracks[0].text : "",
      trainingCatalog: { speakers: [], environmentProfiles: [] }, readingSession: null,
      wordSelection: selection, onWordSelectionChange: setSelection, onScriptChange: vi.fn(),
      obsTimelineActive: true, obsTimelineRecordingId: "recording", obsTranscriptRows: [],
      obsPlayheadSeconds: 0, obsSeekRequest: null, onObsPlayheadChange: playhead,
      onSelectImportedTrack: vi.fn(), onSelectAsset: vi.fn(),
      onAssetWordsChange: (id: string, words: ProjectMediaAsset["words"], text: string) => setMediaAssets((current) => current.map((asset) => asset.id === id ? { ...asset, words, text } : asset)),
      onAssetTimelineStateChange: vi.fn().mockResolvedValue(undefined),
    } as unknown as StudioContext;
    return <><ModuleRegistry context={context} id="script" /><ModuleRegistry context={context} id="timeline" /></>;
  }
  return { ...render(<Workspace />), playhead, refreshAssets: () => refreshAssets() };
}

it("commits a new subtitle phrase into Script and the archived lane together", async () => {
  archivedWorkspace();
  const lane = await screen.findByLabelText("Subtitle Channel 1");
  vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  fireEvent.doubleClick(lane, { clientX: 25 });
  const editor = await screen.findByRole("textbox", { name: "Sửa subtitle" });
  fireEvent.change(editor, { target: { value: "hai từ" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  const script = within(screen.getByLabelText("Script theo channel"));
  expect(await script.findByRole("button", { name: /^hai ·/ })).toBeInTheDocument();
  expect(script.getByRole("button", { name: /^từ ·/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Subtitle word hai" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ TRACK OBS" }));
  expect(await within(screen.getByLabelText("Subtitle Channel 1")).findByRole("button", { name: /^hai ·/ })).toBeInTheDocument();
});

it("synchronizes archived OBS Script words with the shared audio clock in both directions without live rows", async () => {
  const { container, playhead } = archivedWorkspace();
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const script = within(screen.getByLabelText("Script theo channel"));
  const word = script.getByRole("button", { name: "chào · 00:03.000–00:04.000" });
  fireEvent.click(word);
  expect([...container.querySelectorAll("audio")].map((audio) => audio.currentTime)).toEqual([3, 3]);
  expect(word).toHaveClass("is-active");
  expect(script.getByRole("button", { name: "Đồng · 00:03.000–00:04.000" })).toHaveClass("is-active");
  expect(playhead).toHaveBeenLastCalledWith(3);
  const audio = container.querySelector("audio")!;
  audio.currentTime = 5.2;
  fireEvent.timeUpdate(audio);
  expect(word).not.toHaveClass("is-active");
  expect(script.getByRole("button", { name: "thời · 00:05.000–00:06.000" })).toHaveClass("is-active");
  fireEvent.click(within(screen.getByLabelText("Subtitle Channel 1")).getByRole("button", { name: /^Xin ·/ }));
  expect([...container.querySelectorAll("audio")].map((element) => element.currentTime)).toEqual([1, 1]);
  expect(script.getByRole("button", { name: "Xin · 00:01.000–00:02.000" })).toHaveClass("is-active");
  act(() => requestPlaybackSeek("unrelated-footage", 9));
  expect(audio.currentTime).toBe(1);
});

it("seeks an archived OBS single-track Script selection and follows playback without transcript-refresh rewinds", async () => {
  const { container, refreshAssets } = archivedWorkspace(true);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const word = screen.getByRole("button", { name: "Chọn từ chào" });
  fireEvent.pointerDown(word, { button: 0 });
  fireEvent.pointerUp(word, { button: 0 });
  const audio = container.querySelector("audio")!;
  expect(audio.currentTime).toBe(3);
  audio.currentTime = 1.2;
  fireEvent.timeUpdate(audio);
  expect(screen.getByRole("button", { name: "Chọn từ Xin" })).toHaveClass("is-active");
  act(() => refreshAssets());
  expect(audio.currentTime).toBe(1.2);
  fireEvent.pointerDown(word, { button: 0 });
  fireEvent.pointerUp(word, { button: 0 });
  fireEvent.click(word);
  expect(audio.currentTime).toBe(3);
});

it("lets the focused OBS word editor own playback highlights while archived assets refresh", async () => {
  const { container, refreshAssets } = archivedWorkspace(true);
  const subtitle = await screen.findByLabelText("Subtitle Channel 1");
  fireEvent.doubleClick(within(subtitle).getByRole("button", { name: /^Xin ·/ }));
  await screen.findByRole("textbox", { name: "Sửa subtitle" });
  const audio = container.querySelector("audio")!;
  audio.currentTime = 3.2;
  fireEvent.timeUpdate(audio);
  const scriptWord = screen.getByRole("button", { name: "Chọn từ chào" });
  expect(scriptWord).toHaveClass("is-active");
  act(() => refreshAssets());
  expect(scriptWord).toHaveClass("is-active");
  expect(audio.currentTime).toBe(3.2);
});

it("selects words in the focused editor opened from the OBS multitrack view", async () => {
  const { container } = archivedWorkspace();
  const subtitle = await screen.findByLabelText("Subtitle Channel 1");
  fireEvent.doubleClick(within(subtitle).getByRole("button", { name: /^Xin ·/ }));
  fireEvent.keyDown(await screen.findByRole("textbox", { name: "Sửa subtitle" }), { key: "Escape" });
  const word = screen.getByRole("button", { name: "Subtitle word chào" });
  fireEvent.pointerDown(word, { button: 0 });
  fireEvent.pointerUp(word, { button: 0 });
  expect(word).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelectorAll(".selection-readout")).toHaveLength(1);
  expect(container.querySelector("audio")!.currentTime).toBe(3);
  expect(within(screen.getByLabelText("Script theo channel")).getByRole("button", { name: "chào · 00:03.000–00:04.000" })).toHaveClass("is-active");
});

it("follows archive playback across the view edge without recentering paused browsing", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording,
    status: "stopped", archiveStatus: "ready", endedMonotonicNs: 301_000_000_000 },
    channels: [], sourceStems: [{ channelId: ids[0], alias: "Channel 1", assetId: "asset-0" }] }]);
  const { container } = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const ruler = screen.getByLabelText("Ruler chung");
  fireEvent.click(screen.getByRole("button", { name: "Tiến cửa sổ Timeline" }));
  expect(ruler).toHaveTextContent("30s");
  const audio = container.querySelector("audio")!;
  // A paused media event at zero must not cancel manual browsing.
  fireEvent.timeUpdate(audio);
  expect(ruler).toHaveTextContent("30s");
  fireEvent.play(audio);
  audio.currentTime = 76;
  fireEvent.timeUpdate(audio);
  expect(ruler).toHaveTextContent("1:30");
  expect(container.querySelector<HTMLElement>(".obs-timeline__playhead")?.style.left).toBe("10%");
  fireEvent.pause(audio);
  fireEvent.click(screen.getByRole("button", { name: "Tiến cửa sổ Timeline" }));
  const pausedView = ruler.textContent;
  fireEvent.timeUpdate(audio);
  expect(ruler.textContent).toBe(pausedView);
});

it("reloads a stopped track using the standard viewport PCM waveform", async () => {
  const pcm = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    start: 0, end: 60, duration: 300, resolution: .001,
    points: Array.from({ length: 1200 }, () => ({ min: -.1, max: .2 })),
  }) });
  vi.stubGlobal("fetch", pcm);
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording,
    status: "stopped", archiveStatus: "ready", endedMonotonicNs: 301_000_000_000 },
    channels: [], sourceStems: [{ channelId: ids[0], alias: "Channel 1", assetId: "asset-0" }] }]);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  const lane = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  await waitFor(() => expect(pcm).toHaveBeenCalled());
  const url = new URL(pcm.mock.calls.at(-1)![0], "http://localhost");
  expect(url.pathname).toBe("/api/projects/project/media/asset-0/waveform");
  expect(Number(url.searchParams.get("points"))).toBeGreaterThanOrEqual(1024);
  await waitFor(() => expect(lane.querySelector("svg")).toHaveAttribute("data-waveform-source", "pcm-detail"));
});

it("keeps the archive window and PCM detail across repeated idle status and journal refreshes", async () => {
  const journal = { recording: { ...recording, status: "stopped", archiveStatus: "ready",
    endedMonotonicNs: 301_000_000_000 }, channels: [],
    sourceStems: [{ channelId: ids[0], alias: "Channel 1", assetId: "asset-0" }] };
  mocks.listObsLiveLinkRecordings.mockImplementation(async () => structuredClone([journal]));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string) => {
    const query = new URL(input, "http://localhost").searchParams;
    return { ok: true, json: async () => ({ start: Number(query.get("start")), end: Number(query.get("end")),
      points: [{ min: -.1, max: .2 }, { min: -.2, max: .1 }] }) };
  }));
  const { container } = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  for (let i = 0; i < 16; i++) fireEvent.click(screen.getByRole("button", { name: "Tiến cửa sổ Timeline" }));
  const ruler = screen.getByLabelText("Ruler chung");
  expect(ruler).toHaveTextContent("4:00");
  await waitFor(() => expect(container.querySelector("svg[data-waveform-source='pcm-detail']")).toBeInTheDocument());
  const saved = ruler.textContent;
  vi.useFakeTimers();
  try {
    for (let i = 0; i < 5; i++) {
      act(() => mocks.subscribe.mock.calls[0][4]({ appRecording: null, channels: [] }));
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(ruler.textContent).toBe(saved);
    }
  } finally { vi.useRealTimers(); }
});

it("shows final realtime text as a segment-level note where archived words are missing", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording,
    status: "stopped", archiveStatus: "ready", endedMonotonicNs: 301_000_000_000 },
    channels: [], sourceStems: [{ channelId: ids[0], alias: "Channel 1", assetId: "asset-0" }] }]);
  const words = [{ text: "trước", start: 1, end: 2 }, { text: "sau", start: 30, end: 31 }];
  const row = { ...captionRow(ids[0], 3, "lời realtime có sẵn", "final"), endSeconds: 30 };
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording"
    assets={[{ id: "asset-0", words } as ProjectMediaAsset]} transcriptRows={[row]} />);
  const note = await screen.findByRole("note");
  expect(note).toHaveTextContent("Realtime · chưa có timing từ");
  expect(note).toHaveAttribute("title", expect.stringContaining(row.text));
  expect(words).toHaveLength(2);
});

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

it("clears a status transport error after reconnect without a new live recording", async () => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const args = mocks.subscribe.mock.calls[0];
  await act(async () => {
    (args[5] ?? args[3])(new Error("API offline"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("API offline");
  await act(async () => { args[4]({ appRecording: null, channels: [] }); });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => { args[3](new Error("Waveform invalid")); });
  await act(async () => { args[4]({ appRecording: null, channels: [] }); });
  expect(screen.getByRole("alert")).toHaveTextContent("Waveform invalid");
});

it("clears the journal-list error when that same polling request recovers", async () => {
  vi.useFakeTimers();
  try {
    render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
    await act(async () => {});
    mocks.listObsLiveLinkRecordings.mockRejectedValue(new Error("Journal request offline"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole("alert")).toHaveTextContent("Journal request offline");
    mocks.listObsLiveLinkRecordings.mockResolvedValue([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it("does not echo the previous footage when the workspace requests another recording", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue(["recording", "recording-2"].map((recordingId) => ({
    recording: { ...recording, recordingId, status: "stopped", archiveStatus: "ready",
      endedMonotonicNs: 31_000_000_000 }, channels: [], sourceStems: [],
  })));
  const onRecordingIdChange = vi.fn();
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording"
    onRecordingIdChange={onRecordingIdChange} />);
  await screen.findAllByRole("option", { name: /recordin/ });
  onRecordingIdChange.mockClear();
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording-2"
    onRecordingIdChange={onRecordingIdChange} />);
  expect(screen.getByRole("combobox", { name: "Bản ghi OBS" })).toHaveValue("recording-2");
  expect(onRecordingIdChange).not.toHaveBeenCalled();
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording"
    onRecordingIdChange={onRecordingIdChange} />);
  expect(screen.getByRole("combobox", { name: "Bản ghi OBS" })).toHaveValue("recording");
  expect(onRecordingIdChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Bản ghi OBS" }), { target: { value: "recording-2" } });
  expect(onRecordingIdChange).toHaveBeenCalledWith("recording-2");
});

it("names each OBS recording with its local start time and project name", async () => {
  const firstStart = new Date(2026, 8, 29, 11, 22, 27).toISOString();
  const secondStart = new Date(2026, 8, 29, 11, 25, 4).toISOString();
  mocks.listObsLiveLinkRecordings.mockResolvedValue([
    { recording: { ...recording, status: "stopped", recordingId: "recording",
      startedAtUtc: firstStart, endedMonotonicNs: 2_000_000_000 }, channels: [], sourceStems: [] },
    { recording: { ...recording, status: "stopped", recordingId: "recording-2",
      startedAtUtc: secondStart, endedMonotonicNs: 2_000_000_000 }, channels: [], sourceStems: [] },
  ]);
  render(<ObsLiveLinkTimeline projectId="project" projectName="Test OBS 2"
    requestedRecordingId="recording" />);
  const selector = await screen.findByRole("combobox", { name: "Bản ghi OBS" });
  await waitFor(() => expect(screen.getByRole("option", { name: "2026-09-29_11-22-27_Test-OBS-2_LIV_recordin" })).toBeInTheDocument());
  expect(screen.getByRole("option", { name: "2026-09-29_11-25-04_Test-OBS-2_LIV_recordin" })).toBeInTheDocument();
  expect(selector).toHaveValue("recording");
  expect(selector).toHaveAttribute("title", "2026-09-29_11-22-27_Test-OBS-2_LIV_recordin");
});

it("shows a draft caption per live lane, including a new listening row for B", async () => {
  // Live captions age against wall time. Do not inherit a recording timestamp
  // created at file import, potentially many seconds before this test runs.
  const liveRecording = { ...recording, startedAtUtc: new Date(Date.now() - 2000).toISOString() };
  const a = captionRow(ids[0], 0.5, "A đang nói");
  const b = captionRow(ids[1], 1, "", "listening");
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} transcriptRows={[a, b]} />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  act(() => onStatus({ appRecording: liveRecording, channels: ids.map((channelId, index) => ({
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
    seekRequest={{ recordingId: "recording", channelId: ids[1], seconds: 0, selectOnly: true, serial: 1 }} />);
  expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "VỀ LIVE" })).not.toBeInTheDocument();
  view.rerender(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null}
    transcriptRows={[a, { ...b, text: "B chen vào", status: "partial", revision: 2 }]}
    seekRequest={{ recordingId: "recording", channelId: ids[0], seconds: 0.5, serial: 2 }} />);
  expect(screen.getByRole("button", { name: "VỀ LIVE" })).toBeInTheDocument();
  expect(screen.getByLabelText("Phụ đề nháp Channel 1")).toHaveTextContent("A đang nói");
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveTextContent("Chưa có lời nói");
});

it("keeps a Media Pool track choice made before live lanes arrive", async () => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording"
    seekRequest={{ recordingId: "recording", channelId: ids[1], seconds: 0,
      selectOnly: true, serial: 1 }} />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  act(() => onStatus({ appRecording: recording, channels: ids.map((channelId, index) => ({
    channelId, alias: `Channel ${index + 1}`, nativeName: `Mic ${index + 1}`,
    slot: index + 1, appliedForward: true, desiredForward: true,
    capture: { recordingId: "recording", projectId: "project", durableChunkCount: 1 },
  })) } as unknown as ObsLiveLinkStatus));
  await waitFor(() => expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.queryByRole("button", { name: "VỀ LIVE" })).not.toBeInTheDocument();
});

it("retains saved waveform when a cursor reply contains no audio in the viewed window", async () => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  const onSnapshot = mocks.subscribe.mock.calls[0]?.[2] as (next: ObsLiveLinkWaveform) => void;
  act(() => onStatus({ appRecording: recording, channels: [{ channelId: ids[0],
    alias: "Channel 1", nativeName: "Mic 1", slot: 1, appliedForward: true,
    capture: { recordingId: "recording", durableChunkCount: 2 } }] } as unknown as ObsLiveLinkStatus));
  const lane = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  act(() => onSnapshot(wave(ids[0], 12000, "pcm")));
  const saved = lane.querySelector("path")?.getAttribute("d");
  expect(saved).toBeTruthy();
  expect(saved).toMatch(/Z$/u);
  expect(lane.querySelector("svg")).toHaveClass("timeline-waveform__svg");
  act(() => onSnapshot(wave(ids[0], 12000, "mka")));
  expect(lane.querySelector("path")).toHaveAttribute("d", "");
  act(() => onSnapshot(wave(ids[0], 12000, "pcm")));
  expect(lane.querySelector("path")?.getAttribute("d")).toBe(saved);
  // PCM beyond this window advances the cursor but supplies no replacement bins.
  act(() => onSnapshot({ ...wave(ids[0], 0, "pcm"), sampleRate: null,
    lastDurableSequence: 2, lastIncludedSequence: 2, points: [], gaps: [] }));
  expect(lane.querySelector("path")).toHaveAttribute("d", saved);
  expect(lane).not.toHaveTextContent("Đang chờ PCM");
  act(() => onSnapshot({ ...wave(ids[0], 0, "pcm"), lastDurableSequence: 3,
    lastIncludedSequence: 3, points: [{ startFrame: 4800, endFrame: 7200,
      firstSampleIndex: 4800, lastSampleIndexExclusive: 7200, min: 0, max: 0, peak: 0 }] }));
  expect(lane.querySelector("path")?.getAttribute("d")).toContain(saved);
  expect(lane.querySelector("path")?.getAttribute("d")).toContain("30.00");
  // A full snapshot of a newly requested empty window must not reuse old bins.
  fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline OBS" }));
  act(() => onSnapshot({ ...wave(ids[0], 0, "pcm"), sampleRate: null,
    endSeconds: 30, lastDurableSequence: 2, lastIncludedSequence: -1, points: [] }));
  expect(lane.querySelector("path")).toHaveAttribute("d", "");
  expect(lane).toHaveTextContent("PCM đã lưu · cửa sổ này chưa có dữ liệu");
});

it("keeps received PCM visible after Stop while the archive waveform is loading", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ recording: { ...recording,
    status: "stopped", endedMonotonicNs: 8_000_000_000 },
    channels: [{ channelId: ids[0], relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [] }]);
  let resolveWave!: (value: ObsLiveLinkWaveform) => void;
  mocks.getObsLiveLinkWaveform.mockImplementation(() => new Promise((resolve) => { resolveWave = resolve; }));
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  const args = mocks.subscribe.mock.calls[0];
  await act(async () => { args[4]({ appRecording: recording, channels: [{ channelId: ids[0],
    alias: "Channel 1", slot: 1, appliedForward: true,
    capture: { recordingId: "recording", durableChunkCount: 1 } }] }); });
  act(() => args[2](wave(ids[0], 12000, "pcm")));
  const lane = screen.getByRole("img", { name: "Sóng âm Channel 1" });
  expect(lane.querySelector("path")?.getAttribute("d")).toBeTruthy();
  await act(async () => { args[4]({ appRecording: null, channels: [] }); });
  expect(lane.querySelector("path")?.getAttribute("d")).toBeTruthy();
  await act(async () => { resolveWave(wave(ids[0], 3000, "mka")); });
  expect(lane.querySelector("path")?.getAttribute("d")).toBeTruthy();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("retains the stopped lane until its journal arrives and refreshes it immediately", async () => {
  let resolveJournals!: (value: unknown[]) => void;
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  const args = mocks.subscribe.mock.calls[0];
  await act(async () => { args[4]({ appRecording: recording, channels: [{ channelId: ids[0],
    alias: "Channel 1", slot: 1, appliedForward: true,
    capture: { recordingId: "recording", durableChunkCount: 1 } }] }); });
  act(() => args[2](wave(ids[0], 12000, "pcm")));
  mocks.listObsLiveLinkRecordings.mockImplementation(() => new Promise((resolve) => { resolveJournals = resolve; }));
  mocks.listObsLiveLinkRecordings.mockClear();
  await act(async () => { args[4]({ appRecording: null, channels: [] }); });
  const lane = screen.getByRole("img", { name: "Sóng âm Channel 1" });
  expect(lane.querySelector("path")?.getAttribute("d")).toBeTruthy();
  expect(mocks.listObsLiveLinkRecordings).toHaveBeenCalledTimes(1);
  await act(async () => { resolveJournals([{ recording: { ...recording,
    status: "stopped", archiveStatus: "ready", endedMonotonicNs: 8_000_000_000 },
    channels: [{ channelId: ids[0], relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [] }]); });
  expect(screen.getByText("MKA READY")).toBeInTheDocument();
});

it("omits historical missing sources without PCM and retains sources recorded earlier in this take", async () => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  const channels = [
    { channelId: "historical", missing: true, durableChunkCount: 0, appliedForward: true },
    { channelId: ids[0], missing: false, durableChunkCount: 0, appliedForward: true },
    { channelId: ids[1], missing: true, durableChunkCount: 4, appliedForward: false },
  ].map(({ durableChunkCount, ...channel }, index) => ({ ...channel,
    alias: `Channel ${index + 1}`, nativeName: `Mic ${index + 1}`, slot: index + 1,
    desiredForward: true, capture: { recordingId: "recording", durableChunkCount } }));
  act(() => onStatus({ appRecording: recording, channels } as unknown as ObsLiveLinkStatus));
  expect(screen.queryByRole("img", { name: "Sóng âm Channel 1" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Sóng âm Channel 2" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Sóng âm Channel 2" })).toHaveTextContent("Đang chờ PCM");
  expect(screen.getByRole("img", { name: "Sóng âm Channel 3" })).toBeInTheDocument();
});

it("distinguishes source absence from delayed receipt while keeping saved PCM and unknown gaps", async () => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  const onSnapshot = mocks.subscribe.mock.calls[0]?.[2] as (next: ObsLiveLinkWaveform) => void;
  const absent = { appRecording: { ...recording, startedAtUtc: new Date(Date.now() - 20_000).toISOString(),
    channelIntervals: [
      { channelId: ids[0], reason: "source-missing", startMonotonicNs: 1_050_000_000, endMonotonicNs: 1_100_000_000 },
      { channelId: ids[0], reason: "source-missing", startMonotonicNs: 1_300_000_000, endMonotonicNs: null },
    ] }, channels: [{ channelId: ids[0], alias: "Channel 1", nativeName: "Mic 1", slot: 1,
    missing: true, appliedForward: false, desiredForward: true,
    capture: { recordingId: "recording", durableChunkCount: 3 } }] } as unknown as ObsLiveLinkStatus;
  act(() => onStatus(absent));
  const waveform = wave(ids[0], 12000, "pcm");
  act(() => onSnapshot({ ...waveform, points: [...waveform.points,
    { ...waveform.points[0], startFrame: 4800, endFrame: 7200 },
    { ...waveform.points[1], startFrame: 7200, endFrame: 9600 },
    { ...waveform.points[0], startFrame: 9600, endFrame: 12000 },
  ] }));
  const lane = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  expect(lane.querySelector("path")?.getAttribute("d")).toBeTruthy();
  expect(lane).toHaveTextContent("Nguồn đang vắng · PCM đã lưu");
  expect(lane).not.toHaveTextContent("Đang nhận PCM");
  expect(screen.getAllByLabelText("Channel 1: thiếu PCM")).toHaveLength(1);
  expect(screen.getAllByLabelText("Channel 1: source-missing")).toHaveLength(2);
  act(() => onStatus({ ...absent, appRecording: { ...absent.appRecording!, channelIntervals: [] },
    channels: absent.channels.map((channel) => ({ ...channel, missing: false, appliedForward: true })) }));
  expect(lane).not.toHaveTextContent("Nguồn đang vắng");
  expect(lane).toHaveTextContent("Đang nhận PCM");
});

it("keeps each full channel timeline in both layouts and resizes columns independently", async () => {
  const { container } = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  act(() => onStatus({ appRecording: recording, channels: ids.map((channelId, index) => ({
    channelId, alias: `Channel ${index + 1}`, nativeName: `Mic ${index + 1}`,
    slot: index + 1, appliedForward: true, desiredForward: true,
    capture: { recordingId: "recording", projectId: "project", durableChunkCount: 1 },
  })) } as unknown as ObsLiveLinkStatus));
  const firstWave = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const firstLane = firstWave.closest(".obs-timeline__lane") as HTMLElement;
  expect(firstLane).toContainElement(screen.getByLabelText("Phụ đề nháp Channel 1"));
  expect(firstLane).toContainElement(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" }));
  expect(firstLane).toContainElement(screen.getByRole("meter", { name: "Level nguồn Channel 1" }));
  expect(firstLane.parentElement).toHaveClass("is-layers");
  expect(firstLane.querySelectorAll(".obs-timeline__lane-label b")).toHaveLength(1);
  expect(firstLane.querySelector(".obs-timeline__lane-label b")).toHaveTextContent("Track 1 - Mic 1");
  expect(firstLane.querySelector(".obs-timeline__lane-label small")).toBeNull();
  expect(firstLane.parentElement).toHaveStyle({ "--obs-layer-height": "110px" });
  expect(screen.getByText("BẢN GHI")).toHaveAttribute("title", expect.stringContaining("một footage"));
  const header = container.querySelector(".module-frame__header") as HTMLElement;
  const layoutControls = screen.getByRole("group", { name: "Kiểu hiển thị Timeline OBS" });
  expect(header).toContainElement(layoutControls);
  expect(layoutControls.compareDocumentPosition(screen.getByRole("button", { name: "MARK IN" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("group", { name: "Zoom Timeline OBS" })).toHaveClass("timeline-zoom");
  expect(container.querySelector(".transport-bar .transport-button")).toBeInTheDocument();
  expect(container.querySelector(".obs-timeline__toolbar")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  const firstWidth = screen.getByRole("separator", { name: "Điều chỉnh độ rộng Timeline Channel 1" });
  expect(firstLane.querySelector(".obs-timeline__lane-label")).toHaveTextContent("Track 1 - Mic 1");
  expect(firstLane.parentElement).toHaveClass("is-columns");
  expect(firstLane.style.flexBasis).toBe("360px");
  expect(firstWidth).toHaveAttribute("aria-valuenow", "360");
  expect(screen.queryByRole("slider", { name: "Độ rộng Timeline Channel 1" })).toBeNull();
  vi.spyOn(firstLane, "getBoundingClientRect").mockReturnValue({ width: 400 } as DOMRect);
  fireEvent.pointerDown(firstWidth, { pointerId: 1, clientX: 400 });
  fireEvent.pointerMove(firstWidth, { pointerId: 1, clientX: 520 });
  fireEvent.pointerUp(firstWidth, { pointerId: 1, clientX: 520 });
  expect(firstLane).toHaveStyle({ flexBasis: "520px" });
  fireEvent.keyDown(firstWidth, { key: "ArrowRight" });
  expect(firstLane).toHaveStyle({ flexBasis: "544px" });
  fireEvent.keyDown(firstWidth, { key: "Home" });
  expect(firstLane).toHaveStyle({ flexBasis: "240px" });
  fireEvent.keyDown(firstWidth, { key: "ArrowLeft" });
  expect(firstLane).toHaveStyle({ flexBasis: "240px" });
  expect((screen.getByRole("img", { name: "Sóng âm Channel 2" }).closest(".obs-timeline__lane") as HTMLElement).style.flexBasis).toBe("360px");
  fireEvent.click(screen.getByRole("button", { name: "LAYER" }));
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(firstLane).toHaveStyle({ flexBasis: "240px" });
  expect(firstLane).toContainElement(screen.getByLabelText("Phụ đề nháp Channel 1"));
  expect(firstLane).toContainElement(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" }));
  expect(firstLane).toContainElement(screen.getByRole("meter", { name: "Level nguồn Channel 1" }));
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
  await waitFor(() => expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "true"), { timeout: 2500 });
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveTextContent("B");
  expect(screen.getByText("00:00:03.000")).toBeInTheDocument();
  // Realtime segment bands belong to capture; archived PCM has the standard
  // Timeline background while the segment text remains available below it.
  expect(screen.queryByLabelText("Lượt nói Channel 2 tại 3.00s")).not.toBeInTheDocument();
});

it("hides an archived OBS channel withdrawn by its Import checkbox", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 8_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`, relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`, alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const assets = [{ id: "asset-0", importSelected: false }, { id: "asset-1", importSelected: true }] as ProjectMediaAsset[];
  render(<ObsLiveLinkTimeline assets={assets} projectId="project" requestedRecordingId="recording" />);
  await screen.findByLabelText("Sóng âm Channel 2");
  expect(screen.queryByLabelText("Sóng âm Channel 1")).not.toBeInTheDocument();
});

it("keeps overlap clicks passive and previews audio only during waveform dragging", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const onOverlapSelect = vi.fn();
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 9_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const a = { ...captionRow(ids[0], 1, "A nói"), endSeconds: 5, lastSampleIndexExclusive: 5 * 48000 };
  const b = { ...captionRow(ids[1], 2, "B nói tiếp"), endSeconds: 7, lastSampleIndexExclusive: 7 * 48000 };
  const view = render(<ObsLiveLinkTimeline onOverlapSelect={onOverlapSelect}
    projectId="project" requestedRecordingId="recording" transcriptRows={[a, b]} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  expect(view.container.querySelectorAll(".obs-timeline__overlap-markers i")).toHaveLength(2);
  const wave = screen.getByRole("img", { name: "Sóng âm Channel 2" });
  vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.click(wave, { clientX: 30 });
  const selection = { recordingId: "recording", startSeconds: 2, endSeconds: 5,
    sourceIds: [ids[1], ids[0]] };
  expect(onOverlapSelect).toHaveBeenCalledWith(selection);
  expect(play).not.toHaveBeenCalled();
  view.rerender(<ObsLiveLinkTimeline onOverlapSelect={onOverlapSelect} selectedOverlap={selection}
    projectId="project" requestedRecordingId="recording" transcriptRows={[a, b]} />);
  expect(view.container.querySelectorAll(".obs-timeline__selected-overlap")).toHaveLength(2);
  expect(view.container.querySelectorAll(".obs-timeline__overlap-markers i.is-selected")).toHaveLength(2);
  fireEvent.pointerDown(wave, { pointerId: 1, clientX: 20 });
  fireEvent.pointerMove(wave, { pointerId: 1, clientX: 40 });
  fireEvent.pointerUp(wave, { pointerId: 1, clientX: 40 });
  expect(onOverlapSelect).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Phát track OBS" })).toBeInTheDocument();
  pause.mockClear();
  const audio = view.container.querySelector("audio") as HTMLAudioElement;
  expect(screen.getByLabelText("Phụ đề nháp Channel 1")).toHaveClass("is-overlap");
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).toHaveClass("is-overlap");
  audio.currentTime = 5;
  fireEvent.timeUpdate(audio);
  expect(pause).not.toHaveBeenCalled();
  expect(audio.currentTime).toBe(5);
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).not.toHaveClass("is-overlap");
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(view.container.querySelectorAll(".obs-timeline__overlap-markers i")).toHaveLength(2);
  view.rerender(<ObsLiveLinkTimeline onOverlapSelect={onOverlapSelect} projectId="project" requestedRecordingId="recording"
    transcriptRows={[a, b]} seekRequest={{ recordingId: "recording", channelId: ids[1], seconds: 5, serial: 1 }} />);
  expect(screen.getByLabelText("Phụ đề nháp Channel 2")).not.toHaveClass("is-overlap");
});

it("uses trusted detailed-STT word overlap and seeks the archived track asset", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 10_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const assets = [
    { id: "asset-0", name: "OBS LiveLink · Channel 1", obsRecordingId: "recording",
      sourceArchiveAssetId: "parent", importSelected: true, text: "Một",
      words: [{ text: "Một", start: 1, end: 2, timingTrusted: true }] },
    { id: "asset-1", name: "OBS LiveLink · Channel 2", obsRecordingId: "recording",
      sourceArchiveAssetId: "parent", importSelected: true, text: "Hai",
      words: [{ text: "Hai", start: 1.3, end: 2.2, timingTrusted: true }] },
  ] as ProjectMediaAsset[];
  const draftA = { ...captionRow(ids[0], 1, "Nháp A"), endSeconds: 5, lastSampleIndexExclusive: 5 * 48000 };
  const draftB = { ...captionRow(ids[1], 2, "Nháp B"), endSeconds: 7, lastSampleIndexExclusive: 7 * 48000 };
  const onOverlapSelect = vi.fn();
  const view = render(<ObsLiveLinkTimeline assets={assets} onOverlapSelect={onOverlapSelect}
    projectId="project" requestedRecordingId="recording" transcriptRows={[draftA, draftB]} />);
  const wave = await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  expect(view.container.querySelectorAll(".obs-timeline__overlap-markers i")).toHaveLength(2);
  expect(view.container.querySelector(".obs-timeline__overlap-markers i")).toHaveAttribute("title", "Chồng tiếng 00:01.30–00:02.00");
  vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.click(wave, { clientX: 35 });
  expect(onOverlapSelect).toHaveBeenLastCalledWith(null);
  fireEvent.click(wave, { clientX: 15 });
  const selection = { recordingId: "recording", startSeconds: 1.3, endSeconds: 2,
    sourceIds: ["asset-0", "asset-1"] };
  expect(onOverlapSelect).toHaveBeenCalledWith(selection);
  view.rerender(<ObsLiveLinkTimeline assets={assets} onOverlapSelect={onOverlapSelect}
    projectId="project" requestedRecordingId="recording" selectedOverlap={selection} transcriptRows={[draftA, draftB]}
    seekRequest={{ recordingId: "recording", assetId: "asset-1", seconds: 1.3, serial: 1 }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByText("00:00:01.300")).toBeInTheDocument();
  expect(view.container.querySelectorAll(".obs-timeline__selected-overlap")).toHaveLength(2);
});

it("resolves an archived asset seek when stem IDs arrive after channel lanes", async () => {
  const base = { protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 10_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })) };
  mocks.listObsLiveLinkRecordings.mockResolvedValueOnce([{ ...base, sourceStems: [] }])
    .mockResolvedValue([{ ...base, sourceStems: ids.map((channelId, index) => ({ channelId,
      sourceUuid: `source-${index}`, alias: `Channel ${index + 1}`, assetId: `asset-${index}`,
      sourcePath: "", analysisPath: "", gaps: [] })) }]);
  const intervals = vi.spyOn(window, "setInterval");
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording"
    seekRequest={{ recordingId: "recording", assetId: "asset-1", seconds: 1.3, serial: 1 }} />);
  await screen.findByRole("button", { name: "Nghe kênh Channel 2" });
  expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "false");
  const refresh = intervals.mock.calls.find(([, milliseconds]) => milliseconds === 3_000)?.[0];
  expect(refresh).toBeDefined();
  act(() => { if (typeof refresh === "function") refresh(); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Nghe kênh Channel 2" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByText("00:00:01.300")).toBeInTheDocument();
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
  const live = { appRecording: { ...recording, startedAtUtc: new Date(Date.now() - 5_000).toISOString() }, channels: ids.map((channelId, index) => ({
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
  expect(screen.queryByLabelText("Channel 1: thiếu PCM")).not.toBeInTheDocument();
  expect(screen.getAllByText(/Đang nhận PCM · trễ/)).toHaveLength(2);
  act(() => onSnapshot({ ...wave(ids[0], 12000, "pcm"), points: [
    ...wave(ids[0], 12000, "pcm").points,
    { startFrame: 4800, endFrame: 7200, firstSampleIndex: 4800, lastSampleIndexExclusive: 7200,
      min: -2000, max: 2000, peak: 2000 },
  ] }));
  expect(screen.getByLabelText("Channel 1: thiếu PCM")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Phát track OBS" })).toBeDisabled();
});

it("updates OBS channel waveform geometry with the live gain preview and mute state", async () => {
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  const onStatus = mocks.subscribe.mock.calls[0]?.[4] as (next: ObsLiveLinkStatus) => void;
  const onSnapshot = mocks.subscribe.mock.calls[0]?.[2] as (next: ObsLiveLinkWaveform) => void;
  act(() => onStatus({ appRecording: recording, channels: ids.map((channelId, index) => ({
    channelId, alias: `Channel ${index + 1}`, nativeName: `Mic ${index + 1}`, slot: index + 1,
    appliedForward: true, desiredForward: true,
    capture: { recordingId: "recording", projectId: "project", durableChunkCount: 1 },
  })) } as unknown as ObsLiveLinkStatus));
  const firstLane = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const secondLane = screen.getByRole("img", { name: "Sóng âm Channel 2" });
  act(() => { onSnapshot(wave(ids[0], 12000, "pcm")); onSnapshot(wave(ids[1], 3000, "pcm")); });
  await waitFor(() => expect(firstLane.querySelector("path")?.getAttribute("d")).toBeTruthy());
  const firstPath = firstLane.querySelector("path")!;
  const secondPath = secondLane.querySelector("path")!;
  const firstOriginal = firstPath.getAttribute("d");
  const secondOriginal = secondPath.getAttribute("d");
  const gain = screen.getByRole("slider", { name: "Gain nghe lại Channel 1" });
  fireEvent.pointerDown(gain);
  fireEvent.change(gain, { target: { value: "50" } });
  expect(firstPath.getAttribute("d")).not.toBe(firstOriginal);
  expect(secondPath.getAttribute("d")).toBe(secondOriginal);
  const gained = firstPath.getAttribute("d");
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 1" }));
  expect(firstPath.getAttribute("d")).not.toBe(gained);
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
  expect(screen.getByRole("button", { name: "Nghe kênh Channel 1" })).toHaveTextContent("Track 1 - Mic 1");
  await waitFor(() => expect(mocks.getObsLiveLinkWaveform).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("img", { name: "Sóng âm Channel 1" }).querySelector("path")?.getAttribute("d")).toBeTruthy());
  expect(container.querySelector("audio")?.getAttribute("src")).toContain("asset-0/audio");
  fireEvent.click(screen.getByRole("button", { name: "Nghe kênh Channel 2" }));
  expect(container.querySelector("audio")?.getAttribute("src")).toContain("asset-1/audio");
  expect(screen.getByRole("button", { name: "Phát track OBS" })).toBeEnabled();
  const lane = screen.getByRole("img", { name: "Sóng âm Channel 2" });
  vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  fireEvent.click(lane, { clientX: 30 });
  expect(screen.getByText("00:00:01.800")).toBeInTheDocument();
  fireEvent.loadedMetadata(container.querySelector("audio") as HTMLAudioElement);
  expect((container.querySelector("audio") as HTMLAudioElement).currentTime).toBeCloseTo(1.8);
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
  expect(screen.getAllByText("00:00:01.000")).toHaveLength(2);
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
  expect(screen.getByText("00:00:12.000")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "MARK IN" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "MARK IN" }));
  fireEvent.click(screen.getByRole("button", { name: "CỘT" }));
  expect(screen.getByLabelText("Mark In Channel 1")).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" })).toHaveValue("42");
  expect(screen.getByText("00:00:12.000")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline OBS" }));
  expect(screen.getByTitle("Cửa sổ 20s")).toBeInTheDocument();
  expect(screen.getByText("00:00:12.000")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "LAYER" }));
  expect(screen.getByRole("slider", { name: "Gain nghe lại Channel 1" })).toHaveValue("42");
  fireEvent.click(screen.getByRole("button", { name: "Nghe kênh Channel 2" }));
  expect((container.querySelector("audio") as HTMLAudioElement).volume).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Nghe kênh Channel 1" }));
  expect((container.querySelector("audio") as HTMLAudioElement).volume).toBeCloseTo(.42);
});

it("persists work marks, cuts at playhead and restores selected shared sections", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 41_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  let assets = ids.map((_, index) => ({ id: `asset-${index}`, removedRanges: [], cutPoints: [] })) as unknown as ProjectMediaAsset[];
  const save = vi.fn(async (assetId: string, state: import("../../domain/timeline-editing").TimelineEditState) => {
    assets = assets.map((asset) => asset.id === assetId ? { ...asset, ...state } : asset);
  });
  const view = render(<ObsLiveLinkTimeline assets={assets} onAssetTimelineStateChange={save} projectId="project" requestedRecordingId="recording" />);
  const refresh = () => view.rerender(<ObsLiveLinkTimeline assets={assets} onAssetTimelineStateChange={save} projectId="project" requestedRecordingId="recording" />);
  const wave = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  fireEvent.click(wave, { clientX: 25 });
  fireEvent.click(screen.getByRole("button", { name: "MARK IN" }));
  fireEvent.click(wave, { clientX: 50 });
  fireEvent.click(screen.getByRole("button", { name: "MARK OUT" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(assets.every((asset) => asset.workingRange?.start === 10 && asset.workingRange.end === 20)).toBe(true);
  refresh();
  expect(screen.getAllByLabelText(/^Đoạn đã loại Channel/)).toHaveLength(4);
  fireEvent.click(wave, { clientX: 37.5 });
  fireEvent.click(screen.getByRole("button", { name: "CUT" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
  expect(assets.every((asset) => asset.cutPoints?.[0] === 15)).toBe(true);
  refresh();
  fireEvent.click(screen.getByRole("button", { name: "00:00–00:15" }));
  fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(6));
  expect(assets.every((asset) => asset.removedRanges?.[0].end === 15)).toBe(true);
  refresh();
  const audio = view.container.querySelector("audio") as HTMLAudioElement;
  audio.currentTime = 5;
  fireEvent.timeUpdate(audio);
  expect(audio.currentTime).toBe(15);
  fireEvent.click(screen.getByRole("button", { name: "00:00–00:15" }));
  fireEvent.click(screen.getByRole("button", { name: "UNCUT" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(8));
  expect(assets.every((asset) => !asset.removedRanges?.length && !asset.cutPoints?.length && asset.workingRange?.start === 10)).toBe(true);
});

it.each(["menu", "doubleclick"])("adds multiple words to an empty archived OBS subtitle lane via %s", async (gesture) => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 41_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1", assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  const asset = { id: "asset-0", name: "OBS Mic 1", duration: 41, text: "", words: [] } as unknown as ProjectMediaAsset;
  const change = vi.fn();
  render(<ObsLiveLinkTimeline assets={[asset]} onAssetWordsChange={change}
    onAssetTimelineStateChange={vi.fn().mockResolvedValue(undefined)} projectId="project" requestedRecordingId="recording" />);
  const lane = await screen.findByLabelText("Subtitle Channel 1");
  vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  if (gesture === "menu") {
    fireEvent.contextMenu(lane, { clientX: 50 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add text" }));
  } else fireEvent.doubleClick(lane, { clientX: 50 });
  const input = await screen.findByRole("textbox", { name: "Sửa subtitle" });
  expect(input).toHaveValue("");
  fireEvent.change(input, { target: { value: "hello world" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0][0]).toBe("asset-0");
  expect(change.mock.calls[0][1].map((word: { text: string }) => word.text)).toEqual(["hello", "world"]);
  expect(change.mock.calls[0][1][0].start).toBeCloseTo(20);
  expect(change.mock.calls[0][2]).toBe("hello world");
});

it("edits timestamped words from an archived OBS track in the shared Timeline editor", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 41_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  const asset = { id: "asset-0", name: "OBS Mic 1", duration: 41, text: "hello world", removedRanges: [], words: [
    { text: "hello", start: 1, end: 2 }, { text: "world", start: 3, end: 4 },
  ] } as unknown as ProjectMediaAsset;
  const onAssetWordsChange = vi.fn();
  const onAssetTimelineStateChange = vi.fn().mockResolvedValue(undefined);
  render(<ObsLiveLinkTimeline assets={[asset]} onAssetWordsChange={onAssetWordsChange}
    onAssetTimelineStateChange={onAssetTimelineStateChange} projectId="project" requestedRecordingId="recording" />);
  fireEvent.doubleClick(await screen.findByRole("button", { name: /hello ·/ }));
  expect(await screen.findByRole("button", { name: "← TẤT CẢ TRACK OBS" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Nhập gain dB" })).toHaveValue(0);
  const editor = await screen.findByRole("textbox", { name: "Sửa subtitle" });
  fireEvent.change(editor, { target: { value: "Hi" } });
  fireEvent.keyDown(editor, { key: "Enter" });
  await waitFor(() => expect(onAssetWordsChange).toHaveBeenCalledTimes(1));
  const [editedAssetId, editedWords, editedText] = onAssetWordsChange.mock.calls.at(-1)!;
  expect(editedAssetId).toBe("asset-0");
  expect(editedWords[0]).toEqual(expect.objectContaining({ text: "Hi", timingSource: "user-interpolated", timingTrusted: false }));
  expect(editedWords[0].start).toBeGreaterThanOrEqual(asset.words![0].start);
  expect(editedWords[0].end).toBeGreaterThan(editedWords[0].start);
  expect(editedWords[0].end).toBeLessThan(asset.words![1].start);
  expect(editedWords[1]).toEqual(asset.words![1]);
  expect(editedText).toBe("Hi world");
  const gain = screen.getByRole("slider", { name: "Source gain" });
  fireEvent.pointerDown(gain);
  fireEvent.change(gain, { target: { value: "6" } });
  fireEvent.pointerUp(gain);
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ TRACK OBS" }));
  await screen.findByRole("button", { name: /hello ·/ });
  expect(Number((screen.getByRole("slider", { name: "Gain nghe lại Channel 1" }) as HTMLInputElement).value)).toBeCloseTo(199.526, 2);
  const promotion = vi.fn();
  window.addEventListener("pro4bro:timestamp-promotion", promotion);
  act(() => window.dispatchEvent(new CustomEvent("pro4bro:timestamp-promotion", { detail: { assetId: "asset-0", index: 0 } })));
  // Original request plus the shared editor's one replay; no feedback loop.
  expect(promotion.mock.calls.filter(([event]) => event.detail.index !== null)).toHaveLength(2);
  expect(promotion).toHaveBeenCalledTimes(3); // Includes the mount's reset event.
  window.removeEventListener("pro4bro:timestamp-promotion", promotion);
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ TRACK OBS" }));
  fireEvent.contextMenu(await screen.findByRole("button", { name: /world ·/ }));
  expect(await screen.findByRole("menuitem", { name: "Sửa text" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Xóa text đã chọn" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "← TẤT CẢ TRACK OBS" }));
  const subtitle = await screen.findByLabelText("Subtitle Channel 1");
  vi.spyOn(subtitle, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, right: 100 } as DOMRect);
  fireEvent.click(subtitle, { ctrlKey: true, clientX: 50 });
  expect(await screen.findByRole("textbox", { name: "Sửa subtitle" })).toBeInTheDocument();
});

it("routes undo and redo in both the archived OBS root and focused editor", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 41_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  const asset = { id: "asset-0", name: "OBS Mic 1", duration: 41, text: "hello", removedRanges: [], words: [
    { text: "hello", start: 1, end: 2 },
  ] } as unknown as ProjectMediaAsset;
  const onUndo = vi.fn(), onRedo = vi.fn();
  const onAssetWordsChange = vi.fn();
  const onAssetTimelineStateChange = vi.fn().mockResolvedValue(undefined);
  render(<ObsLiveLinkTimeline assets={[asset]} onUndo={onUndo} onRedo={onRedo}
    onAssetWordsChange={onAssetWordsChange}
    onAssetTimelineStateChange={onAssetTimelineStateChange}
    projectId="project" requestedRecordingId="recording" />);

  fireEvent.pointerEnter(document.querySelector(".timeline-module")!);
  fireEvent.keyDown(document, { key: "z", ctrlKey: true });
  fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: true });
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onRedo).toHaveBeenCalledTimes(1);

  fireEvent.doubleClick(await screen.findByRole("button", { name: /hello ·/ }));
  expect(await screen.findByRole("textbox", { name: "Sửa subtitle" })).toBeInTheDocument();
  const focusedTimeline = document.querySelector(".timeline-module")!;
  fireEvent.pointerEnter(focusedTimeline);
  fireEvent.keyDown(focusedTimeline, { key: "z", ctrlKey: true });
  fireEvent.keyDown(focusedTimeline, { key: "z", ctrlKey: true, shiftKey: true });
  expect(onUndo).toHaveBeenCalledTimes(2);
  expect(onRedo).toHaveBeenCalledTimes(2);
  fireEvent.click(await screen.findByRole("button", { name: "← TẤT CẢ TRACK OBS" }));
  const restoredRoot = document.querySelector(".timeline-module")!;
  fireEvent.pointerEnter(restoredRoot);
  fireEvent.keyDown(restoredRoot, { key: "z", ctrlKey: true });
  fireEvent.keyDown(restoredRoot, { key: "z", ctrlKey: true, shiftKey: true });
  expect(onUndo).toHaveBeenCalledTimes(3);
  expect(onRedo).toHaveBeenCalledTimes(3);
});

it("shows the actual visible time span for a short archive", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 1_500_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  expect(screen.getByTitle("Cửa sổ 0.5s")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Phóng to Timeline OBS" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Thu nhỏ Timeline OBS" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline OBS" }));
  expect(screen.getByRole("group", { name: "Zoom Timeline OBS" })).toHaveTextContent("0.01s / 10px");
});

it("fits an archive shorter than ten milliseconds and keeps its resolution readable", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 1_005_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  expect(await screen.findByTitle("Cửa sổ 0.005s")).toBeInTheDocument();
  expect(screen.getByText("0.0002s / 10px")).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Zoom timeline" })).toBeDisabled();
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

it("plays both archived tracks and mutes one without changing its gain", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 41_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const { container } = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 2" });
  const audios = [...container.querySelectorAll("audio")];
  expect(audios).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Channel 2" }));
  expect(audios[1].volume).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Phát track OBS" }));
  await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  expect(audios[0].volume).toBe(1);
  expect(audios[1].volume).toBe(0);
});

it("centres archived zoom on the playhead and clears word selection on blank waveform or subtitle clicks", async () => {
  archivedWorkspace(true);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const ruler = screen.getByLabelText("Ruler chung");
  vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  fireEvent.click(ruler, { clientX: 700 });
  const playhead = screen.getByLabelText("Playhead chung");
  expect(playhead).toHaveStyle({ left: "70%" });
  fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline OBS" }));
  expect(playhead).toHaveStyle({ left: "50%" });

  const selectedWord = screen.getByRole("button", { name: "Chọn từ Xin" });
  const waveform = screen.getByRole("img", { name: "Sóng âm Channel 1" });
  fireEvent.click(selectedWord);
  expect(selectedWord).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(waveform, { clientX: 200 });
  expect(selectedWord).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(selectedWord);
  const subtitle = screen.getByLabelText("Subtitle Channel 1");
  fireEvent.click(subtitle, { clientX: 300 });
  expect(selectedWord).toHaveAttribute("aria-pressed", "false");
});

it("auto-scrolls an archived waveform drag at screen-relative speed and skips full transport", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 241_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const wave = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  fireEvent.pointerDown(wave, { button: 0, pointerId: 1, clientX: 950 });
  const before = frames.shift();
  expect(before).toBeDefined();
  act(() => { before!(0); frames.shift()!(1000); });
  expect(await screen.findByText("00:01:00.000")).toBeInTheDocument();
  expect(screen.getByLabelText("Playhead chung")).toHaveStyle({ left: "90%" });
  const queuedAfterEdgePan = frames.shift();
  const rulerBeforeRelease = screen.getByLabelText("Ruler chung").textContent;
  fireEvent.pointerUp(wave, { pointerId: 1, clientX: 950 });
  fireEvent.click(wave, { clientX: 950 });
  expect(screen.getByText("00:01:00.000")).toBeInTheDocument();
  expect(screen.getByLabelText("Ruler chung").textContent).toBe(rulerBeforeRelease);
  expect(screen.getByLabelText("Playhead chung")).toHaveStyle({ left: "90%" });
  fireEvent.pointerCancel(wave, { pointerId: 1, clientX: 950 });
  act(() => queuedAfterEdgePan?.(2000));
  expect(screen.getByText("00:01:00.000")).toBeInTheDocument();
  expect(screen.getByLabelText("Playhead chung")).toHaveStyle({ left: "90%" });

  const fullTransport = screen.getByLabelText("Thanh tiến trình Timeline — bấm hoặc kéo để tua");
  vi.spyOn(fullTransport, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
  const scheduled = frames.length;
  fireEvent.pointerDown(fullTransport, { button: 0, pointerId: 2, clientX: 950 });
  expect(frames).toHaveLength(scheduled);
  fireEvent.pointerUp(fullTransport, { pointerId: 2, clientX: 950 });
  frames.length = 0;
  fireEvent.pointerDown(wave, { button: 0, pointerId: 3, clientX: 500 });
  fireEvent.pointerMove(wave, { pointerId: 3, clientX: 50 });
  act(() => { frames.shift()!(0); }); act(() => { frames.shift()!(1000); });
  expect(screen.getByLabelText("Playhead chung")).toHaveStyle({ left: "10%" });
  const leftRulerBeforeRelease = screen.getByLabelText("Ruler chung").textContent;
  fireEvent.pointerUp(wave, { pointerId: 3, clientX: 50 });
  fireEvent.click(wave, { clientX: 50 });
  expect(screen.getByLabelText("Ruler chung").textContent).toBe(leftRulerBeforeRelease);
  expect(screen.getByLabelText("Playhead chung")).toHaveStyle({ left: "10%" });
});

it("shows source-scoped numeric readouts only on the matching archived track without moving a multi-selection viewport", async () => {
  const assets = ids.map((channelId, index) => ({ id: `asset-${index}`, name: `Track ${index + 1}`,
    duration: 10, updatedAt: `revision-${index}`, obsRecordingId: "recording", sourceArchiveAssetId: "parent",
    words: [{ text: `word${index}`, start: 1, end: 2 }], importSelected: true })) as unknown as ProjectMediaAsset[];
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 11_000_000_000 },
    channels: ids.map((channelId, index) => ({ channelId, nativeName: `Mic ${index + 1}`,
      relayLabel: `Channel ${index + 1}`, slot: index + 1, forwardApplied: true })),
    sourceStems: ids.map((channelId, index) => ({ channelId, sourceUuid: `source-${index}`,
      alias: `Channel ${index + 1}`, assetId: `asset-${index}`, sourcePath: "", analysisPath: "", gaps: [] })),
  }]);
  const view = render(<ObsLiveLinkTimeline assets={assets} projectId="project" requestedRecordingId="recording" />);
  const laneA = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const laneB = screen.getByRole("img", { name: "Sóng âm Channel 2" });
  const ruler = screen.getByLabelText("Ruler chung");
  const rulerBefore = ruler.textContent;
  const onWordSelectionChange = vi.fn();
  const scopedSelection: WordSelection = { indexes: [], anchor: null, scope: { kind: "asset", id: "asset-0", revision: "revision-0" },
    ranges: [{ id: "early", start: 1, end: 2 }, { id: "late", start: 8, end: 9 }] };
  view.rerender(<ObsLiveLinkTimeline assets={assets} projectId="project" requestedRecordingId="recording"
    wordSelection={scopedSelection} onWordSelectionChange={onWordSelectionChange} />);

  await waitFor(() => expect(laneA.querySelectorAll(".selection-readout")).toHaveLength(2));
  expect(laneA).toHaveTextContent("1.000s");
  expect(laneA).toHaveTextContent("2.000s");
  expect(laneA).toHaveTextContent("8.000s");
  expect(laneA).toHaveTextContent("9.000s");
  expect(laneB.querySelectorAll(".selection-readout")).toHaveLength(0);
  expect(ruler.textContent).toBe(rulerBefore);

  fireEvent.click(laneA, { ctrlKey: true, clientX: 200 });
  expect(onWordSelectionChange).not.toHaveBeenCalled();
  fireEvent.click(laneA, { clientX: 200 });
  expect(onWordSelectionChange).toHaveBeenLastCalledWith(EMPTY_SELECTION);
});

it("uses Space to toggle playback only while the pointer is over Timeline", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 10_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  fireEvent.keyDown(window, { key: " " });
  expect(play).not.toHaveBeenCalled();
  const module = view.container.querySelector(".obs-timeline")!;
  fireEvent.pointerEnter(module);
  fireEvent.keyDown(window, { key: " " });
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  fireEvent.keyDown(window, { key: " " });
  expect(pause).toHaveBeenCalled();
  fireEvent.pointerLeave(module);
  fireEvent.keyDown(window, { key: " " });
  expect(play).toHaveBeenCalledTimes(1);
});

it("can zoom out to the entire archived recording", async () => {
  mocks.getObsLiveLinkWaveform.mockImplementation(async (_project, _recording, channel, start, end) => ({
    ...wave(channel, 12000, "mka"), startSeconds: start, endSeconds: end,
  }));
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 901_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  fireEvent.change(screen.getByRole("slider", { name: "Zoom timeline" }), { target: { value: "0" } });
  expect(screen.getByTitle("Cửa sổ 900s")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thu nhỏ Timeline OBS" })).toBeDisabled();
  await waitFor(() => expect(mocks.getObsLiveLinkWaveform).toHaveBeenCalledWith("project", "recording", ids[0], 0, 900, 600));
  expect(screen.getByRole("img", { name: "Sóng âm Channel 1" }).querySelector("path")?.getAttribute("d")).toBeTruthy();
  // A new live take can arrive before the overview viewport reset effect runs.
  const liveWindow = mocks.subscribe.mock.calls[0][1]("new-recording", ids[0]);
  expect(liveWindow.endSeconds - liveWindow.startSeconds).toBeLessThanOrEqual(120);
});

it("gives archived and live OBS timelines density-based zoom across viewport widths", async () => {
  let viewportWidth = 1_000;
  const observers: Array<{ notify: () => void }> = [];
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("obs-timeline__viewport") ? viewportWidth : 0;
  });
  vi.stubGlobal("ResizeObserver", class {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push({ notify: () => this.callback([], this as unknown as ResizeObserver) });
    }
    observe() { this.callback([], this as unknown as ResizeObserver); }
    disconnect() {}
  });
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 901_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  const view = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId="recording" />);
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const zoom = screen.getByRole("slider", { name: "Zoom timeline" });
  expect(zoom).toHaveAttribute("max", "1000");
  fireEvent.click(screen.getByRole("button", { name: "Phóng to Timeline OBS" }));
  expect(screen.getByTitle("Cửa sổ 30s")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thu nhỏ Timeline OBS" }));
  expect(screen.getByTitle("Cửa sổ 60s")).toBeInTheDocument();
  fireEvent.change(zoom, { target: { value: "0" } });
  expect(screen.getByTitle("Cửa sổ 900s")).toBeInTheDocument();
  fireEvent.change(zoom, { target: { value: "1000" } });
  expect(zoom).toHaveAttribute("aria-valuetext", "0.01s / 10px");
  expect(screen.getByLabelText("Ruler chung")).toHaveTextContent("0.1s");

  viewportWidth = 700;
  act(() => observers.forEach((observer) => observer.notify()));
  expect(zoom).toHaveAttribute("aria-valuetext", "0.02s / 10px");
  fireEvent.change(zoom, { target: { value: "1000" } });
  expect(zoom).toHaveAttribute("aria-valuetext", "0.01s / 10px");
  expect(screen.getByRole("button", { name: "Phóng to Timeline OBS" })).toBeDisabled();

  view.unmount();
  mocks.listObsLiveLinkRecordings.mockResolvedValue([]);
  const live = render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const liveFeed = mocks.subscribe.mock.calls[mocks.subscribe.mock.calls.length - 1];
  await act(async () => liveFeed[4]({ appRecording: { ...recording, endedMonotonicNs: null,
    startedAtUtc: new Date(Date.now() - 200_000).toISOString() }, channels: [{ channelId: ids[0],
    alias: "Channel 1", slot: 1, appliedForward: true, capture: { recordingId: "recording", durableChunkCount: 0 } }] }));
  await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const liveZoom = screen.getByRole("slider", { name: "Zoom timeline" });
  fireEvent.change(liveZoom, { target: { value: "1000" } });
  expect(liveZoom).toHaveAttribute("aria-valuetext", "0.01s / 10px");
  fireEvent.change(liveZoom, { target: { value: "0" } });
  expect(screen.getByTitle("Cửa sổ 120s")).toBeInTheDocument();
  const liveWindow = liveFeed[1]("recording", ids[0]);
  expect(liveWindow.endSeconds - liveWindow.startSeconds).toBeLessThanOrEqual(120);
  live.unmount();
});

it("does not seek back to zero after dragging a waveform", async () => {
  mocks.listObsLiveLinkRecordings.mockResolvedValue([{ protocolVersion: 3,
    recording: { ...recording, status: "stopped", archiveStatus: "ready", endedMonotonicNs: 41_000_000_000 },
    channels: [{ channelId: ids[0], nativeName: "Mic 1", relayLabel: "Channel 1", slot: 1, forwardApplied: true }],
    sourceStems: [{ channelId: ids[0], sourceUuid: "source-0", alias: "Channel 1",
      assetId: "asset-0", sourcePath: "", analysisPath: "", gaps: [] }],
  }]);
  render(<ObsLiveLinkTimeline projectId="project" requestedRecordingId={null} />);
  const wave = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.pointerDown(wave, { pointerId: 1, clientX: 20 });
  fireEvent.pointerMove(wave, { pointerId: 1, clientX: 60 });
  fireEvent.pointerUp(wave, { pointerId: 1, clientX: 60 });
  fireEvent.click(wave, { clientX: 0 });
  expect(screen.getByText("00:00:24.000")).toBeInTheDocument();
});

it.each([false, true])("resumes Script following by dragging an archived OBS waveform (single track=%s)", async (singleTrack) => {
  const { container } = archivedWorkspace(singleTrack);
  const waveform = await screen.findByRole("img", { name: "Sóng âm Channel 1" });
  const view = container.querySelector<HTMLElement>(".script-table-scroll")!;
  Object.defineProperties(view, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 2000 } });
  vi.spyOn(view, "getBoundingClientRect").mockReturnValue({ top: 100, height: 200 } as DOMRect);
  container.querySelectorAll<HTMLElement>(".script-table__word").forEach((word) => {
    vi.spyOn(word, "getBoundingClientRect").mockImplementation(() => ({ top: 500 - view.scrollTop, height: 20 } as DOMRect));
  });
  vi.spyOn(waveform, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  fireEvent.wheel(view);
  fireEvent.pointerDown(waveform, { pointerId: 1, clientX: 35, button: 0 });
  fireEvent.pointerUp(waveform, { pointerId: 1, clientX: 35, button: 0 });
  await waitFor(() => expect(container.querySelector('.script-table__word.is-active')).toHaveTextContent("chào"));
  expect(view.scrollTop).toBeGreaterThan(0);
  fireEvent.wheel(view);
  view.scrollTop = 0;
  // The second drag remains in the same word, so no new word publication is needed.
  fireEvent.pointerDown(waveform, { pointerId: 2, clientX: 36, button: 0 });
  fireEvent.pointerUp(waveform, { pointerId: 2, clientX: 36, button: 0 });
  expect(view.scrollTop).toBeGreaterThan(0);
});
