import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectMediaAsset } from "../domain/types";
import { WorkspaceShell } from "./WorkspaceShell";

const apiMocks = vi.hoisted(() => ({
  getOmniVoiceProfileSchema: vi.fn(),
  getPreferences: vi.fn(),
  getSystemStatus: vi.fn(),
  getTrainingCatalog: vi.fn(),
  listProjectMedia: vi.fn(),
  listProjectMediaTranscriptionStatus: vi.fn(),
  listReadingPacks: vi.fn(),
  getDatasetReadiness: vi.fn(),
  listTrainingRuns: vi.fn(),
  recycleProjectMedia: vi.fn(),
  restoreProjectMedia: vi.fn(),
  removeProjectMedia: vi.fn(),
  getTrainingRunProgress: vi.fn(),
  claimObsLiveLinkTarget: vi.fn(),
  releaseObsLiveLinkTarget: vi.fn(),
  getObsLiveLinkTranscriptEvents: vi.fn(),
  updateMediaScript: vi.fn(),
  pickMediaFile: vi.fn(),
  inspectLocalMediaTracks: vi.fn(),
  startGrowingMkvFollow: vi.fn(),
  getGrowingMkvAssets: vi.fn().mockResolvedValue([]),
  importLocalProjectMedia: vi.fn(),
  setMediaImportSelected: vi.fn(),
  importExistingAudioTrack: vi.fn(),
}));

vi.mock("../api/client", () => ({ api: apiMocks }));
vi.mock("../modules/registry/ModuleRegistry", () => ({
  ModuleRegistry: ({ id, context }: { id: string; context: { script: string; take: { name: string } | null; mediaAssets: ProjectMediaAsset[]; selectedImportedTrackId: string | null; onSelectImportedTrack: (id: string) => void; onSelectAsset: (id: string) => void; onToggleImport: (id: string, selected: boolean, streamIndex?: number) => void; onScriptChange: (value: string) => void; obsTimelineActive: boolean; obsTimelineRecordingId: string | null; obsSeekRequest: { channelId: string; selectOnly?: boolean } | null; onOpenObsRecording: (id: string) => void; onOpenObsTrack: (id: string, channelId: string) => void; onOpenVoiceOutput: (output: unknown) => void; onBatchMediaAction: (action: unknown) => void; onRemoveAsset: (asset: ProjectMediaAsset) => void; onOpenObsAsset: (id: string) => void; onImportLocalMedia: () => void; pendingLocalMedia: { tracks: Array<{ streamIndex: number; imported: boolean; transcribe: boolean }> } | null; onPendingLocalTrackChange: (streamIndex: number, field: "imported" | "transcribe", selected: boolean) => void; onConfirmPendingLocalMedia: (mode: "import" | "follow") => void } }) => {
    if (id === "library-panel") return <><button onClick={() => (context as unknown as { onClearMediaSelection: () => void }).onClearMediaSelection()} type="button">clear footage selection</button><button onClick={() => context.onSelectAsset("asset-1")} type="button">open first footage</button><button onClick={() => context.onSelectAsset("archive-1")} type="button">open OBS footage</button><button onClick={() => context.onToggleImport("channel-a", false)} type="button">withdraw first track</button><button onClick={() => context.onToggleImport("channel-b", false)} type="button">withdraw second track</button><button onClick={() => context.onToggleImport("archive", true)} type="button">restore imported parent</button><button onClick={() => context.onToggleImport("archive", true, 3)} type="button">add omitted track</button><button onClick={() => context.onSelectAsset("archive")} type="button">open imported parent</button><button onClick={() => context.onBatchMediaAction({ kind: "recycle", assetIds: ["asset-1", "asset-2"] })} type="button">remove selected footage</button><button onClick={() => context.onBatchMediaAction({ kind: "restore", assetIds: ["asset-1", "asset-2"] })} type="button">restore selected footage</button><button onClick={() => context.onBatchMediaAction({ kind: "delete", assetIds: ["asset-1", "asset-2"] })} type="button">delete selected bin footage</button><button onClick={() => { const asset = context.mediaAssets.find((item) => item.id === "asset-1"); if (asset) context.onRemoveAsset(asset); }} type="button">delete first bin footage</button><button onClick={() => context.onOpenObsAsset("asset-1")} type="button">refresh footage list</button><output data-testid="media-ids">{context.mediaAssets.map((item) => item.id).join(",")}</output><button onClick={context.onImportLocalMedia} type="button">pick native media</button><output data-testid="pending-tracks">{context.pendingLocalMedia?.tracks.map((track) => `${track.streamIndex}:${track.imported}:${track.transcribe}`).join(",") ?? "none"}</output><button onClick={() => context.onPendingLocalTrackChange(1, "imported", false)} type="button">omit first track</button><button onClick={() => context.onPendingLocalTrackChange(2, "transcribe", true)} type="button">stt second track</button><button onClick={() => context.onConfirmPendingLocalMedia("follow")} type="button">start follow</button></>;
    if (id === "media-pool") return <><button onClick={context.onImportLocalMedia} type="button">pick native media</button><button onClick={() => context.onOpenObsRecording("live-take")} type="button">open live OBS take</button><button onClick={() => context.onOpenObsTrack("live-take", "mic-1")} type="button">open live OBS track</button><output data-testid="pending-tracks">{context.pendingLocalMedia?.tracks.map((track) => `${track.streamIndex}:${track.imported}:${track.transcribe}`).join(",") ?? "none"}</output><button onClick={() => context.onPendingLocalTrackChange(1, "imported", false)} type="button">omit first track</button><button onClick={() => context.onPendingLocalTrackChange(2, "transcribe", true)} type="button">stt second track</button><button onClick={() => context.onConfirmPendingLocalMedia("follow")} type="button">start follow</button></>;
    if (id === "script") {
      const overlap = context as unknown as { obsOverlapSelection: { startSeconds: number; endSeconds: number } | null;
        onObsArchivedOverlapSelect: (trackId: string, selection: { recordingId: string; startSeconds: number;
          endSeconds: number; sourceIds: string[] }) => void };
      return <><output data-testid="script-value">{context.script}</output><output data-testid="script-track">{context.selectedImportedTrackId ?? "none"}</output><output data-testid="obs-overlap-selection">{overlap.obsOverlapSelection ? `${overlap.obsOverlapSelection.startSeconds}-${overlap.obsOverlapSelection.endSeconds}` : "none"}</output><button onClick={() => overlap.onObsArchivedOverlapSelect("asset-b", { recordingId: "take-one", startSeconds: 2, endSeconds: 5, sourceIds: ["asset-a", "asset-b"] })} type="button">select archived overlap</button><button onClick={() => context.onSelectImportedTrack("channel-b")} type="button">select second imported track</button><button onClick={() => context.onScriptChange("Edited channel B")} type="button">edit imported script</button></>;
    }
    if (id === "timeline") {
      const request = context.obsSeekRequest as { assetId?: string; channelId?: string; selectOnly?: boolean } | null;
      const overlap = context as unknown as { onObsOverlapSelect: (selection: { recordingId: string;
        startSeconds: number; endSeconds: number; sourceIds: string[] }) => void };
      return <><output data-testid="timeline-take">{context.take?.name ?? "trống"}</output><output data-testid="obs-recording">{context.obsTimelineRecordingId ?? "none"}:{String(context.obsTimelineActive)}</output><output data-testid="obs-track-request">{request?.channelId ?? "none"}:{String(request?.selectOnly ?? false)}</output><output data-testid="obs-asset-request">{request?.assetId ?? "none"}</output><button onClick={() => overlap.onObsOverlapSelect({ recordingId: "take-one", startSeconds: 2, endSeconds: 5, sourceIds: ["asset-a", "asset-b"] })} type="button">select Timeline overlap</button></>;
    }
    if (id === "recorder") return <><button onClick={() => void (context as unknown as { onObsArchiveReady: (id: string) => Promise<void> }).onObsArchiveReady("take-new")} type="button">archive ready</button><button onClick={() => context.onOpenObsRecording("live-take")} type="button">open live OBS take</button><button onClick={() => context.onOpenObsRecording("take-new")} type="button">open new OBS take</button><button onClick={() => context.onOpenObsTrack("live-take", "mic-1")} type="button">open live OBS track</button></>;
    if (id === "manipulator-library") {
      return <button onClick={() => context.onOpenVoiceOutput(GENERATED)} type="button">mở voice output</button>;
    }
    return null;
  },
}));

const GENERATED = {
  id: "output-1", name: "Script · 35 đoạn", text: "xin chào", voiceId: "voice-1", voiceName: "Anh Vũ",
  speakerProfileId: "speaker-1", engine: "omnivoice", generatorId: "omnivoice-generate", parameters: {},
  duration: 208, audioPath: "assets/voice-output/output-1/audio.wav", words: [], segments: [],
  createdAt: "2026-09-17T00:00:00Z",
};
vi.mock("../modules/workspace-status/WorkspaceStatusBar", () => ({ WorkspaceStatusBar: () => null }));

const project: Project = {
  id: "project-stt-race",
  name: "STT race",
  projectPath: "data/projects/project-stt-race",
  location: null,
  language: "vi",
  accent: null,
  sampleRate: 24000,
  purpose: null,
  createdAt: "2026-08-30T00:00:00Z",
  updatedAt: "2026-08-30T00:00:00Z",
  lastPage: "speech-to-text",
};

function mediaAsset(status: ProjectMediaAsset["transcriptionStatus"], text: string, updatedAt: string): ProjectMediaAsset {
  return {
    id: "asset-1",
    name: "speech.wav",
    sourceExtension: ".wav",
    mediaKind: "audio",
    sourcePath: "assets/media/asset-1/source.wav",
    analysisPath: "assets/media/asset-1/analysis.wav",
    studioItemId: status === "complete" ? "stt-result" : null,
    url: "/api/projects/project-stt-race/media/asset-1/audio",
    duration: 12,
    sampleRate: 24000,
    text,
    words: [],
    origin: "import",
    status: "ready",
    transcriptionStatus: status,
    transcriptionSelected: true,
    transcriptionProgress: status === "complete" ? 100 : 42,
    transcriptionError: null,
    aiReviewStatus: "pending",
    trainingSelected: false,
    captureTier: "import",
    speakerProfileIds: [],
    environmentProfileIds: [],
    emotion: "normal",
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt,
    revisions: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("WorkspaceShell STT synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiMocks.listReadingPacks.mockResolvedValue([]);
    apiMocks.getDatasetReadiness.mockResolvedValue(null);
    apiMocks.listTrainingRuns.mockResolvedValue([]);
    apiMocks.getTrainingRunProgress.mockResolvedValue([]);
    apiMocks.getTrainingCatalog.mockResolvedValue({
      speakers: [],
      environmentProfiles: [],
      settings: {
        targetSpeakerIds: [], maxSteps: 10000, checkpointEvery: 1000, batchSize: 4,
        learningRate: 0.00002, denoiseBeforeTraining: true, learnEnvironmentNoise: false,
        environmentProfileId: null,
      },
      updatedAt: "2026-08-30T00:00:00Z",
    });
    apiMocks.getOmniVoiceProfileSchema.mockResolvedValue(null);
    apiMocks.getPreferences.mockResolvedValue({
      aiReview: { enabled: false, baseUrl: "", model: "", apiKey: null, apiKeyConfigured: false },
      diarization: { enabled: true, model: "pyannote", huggingfaceToken: null, huggingfaceTokenConfigured: false },
      emotionStyle: {
        colorMode: "gradient", gradientStart: "#18d9ff", gradientEnd: "#ff4b52",
        emotionColors: {}, backgroundEnabled: false, backgroundColor: "#24384b", backgroundOpacity: 0.34,
      },
    });
    apiMocks.getSystemStatus.mockResolvedValue(null);
    apiMocks.claimObsLiveLinkTarget.mockResolvedValue(undefined);
    apiMocks.releaseObsLiveLinkTarget.mockResolvedValue(undefined);
    apiMocks.getObsLiveLinkTranscriptEvents.mockResolvedValue({ events: [], revision: 0 });
  });

  it("starts without a footage and clears Script, waveform and OBS feed on deselect", async () => {
    const first = mediaAsset("complete", "Lời đã nhận dạng", "2026-08-30T00:00:02Z");
    apiMocks.listProjectMedia.mockResolvedValue([first]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent(first.id));
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống");
    expect(screen.getByTestId("script-value")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    expect(screen.getByTestId("timeline-take")).toHaveTextContent(first.name);
    expect(screen.getByTestId("script-value")).toHaveTextContent(first.text);
    fireEvent.click(screen.getByRole("button", { name: "clear footage selection" }));
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống");
    expect(screen.getByTestId("script-value")).toBeEmptyDOMElement();
    expect(screen.getByTestId("obs-recording")).toHaveTextContent("none:false");
  });

  it("passes Media Pool channel choices into a growing MKV follow", async () => {
    const parent = { ...mediaAsset("not-applicable", "", "2026-09-29T00:00:00Z"),
      id: "mkv-parent", name: "recording.mkv", sourceExtension: ".mkv", growingMkvFollow: true };
    const child = { ...mediaAsset("skipped", "", "2026-09-29T00:00:01Z"),
      id: "mkv-track-2", sourceArchiveAssetId: "mkv-parent", sourceArchiveStreamIndex: 2 };
    apiMocks.listProjectMedia.mockResolvedValueOnce([]).mockResolvedValue([parent, child]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.pickMediaFile.mockResolvedValue({ path: "C:/captures/recording.mkv" });
    apiMocks.inspectLocalMediaTracks.mockResolvedValue({ tracks: [
      { streamIndex: 1, title: "Mic", codec: "aac", channels: 2 },
      { streamIndex: 2, title: "Desktop", codec: "aac", channels: 2 },
    ] });
    apiMocks.startGrowingMkvFollow.mockResolvedValue({ asset: parent, trackAssetIds: [child.id], item: null, elapsed: 0 });
    apiMocks.getGrowingMkvAssets.mockResolvedValue([parent, { ...child, text: "Lời từ MKV", updatedAt: "2026-09-29T00:00:02Z" }]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    fireEvent.click(screen.getByRole("button", { name: "pick native media" }));
    await waitFor(() => expect(screen.getByTestId("pending-tracks")).toHaveTextContent("1:true:false,2:true:false"));
    fireEvent.click(screen.getByRole("button", { name: "omit first track" }));
    fireEvent.click(screen.getByRole("button", { name: "stt second track" }));
    fireEvent.click(screen.getByRole("button", { name: "start follow" }));
    await waitFor(() => expect(apiMocks.startGrowingMkvFollow).toHaveBeenCalledWith(
      project.id, "C:/captures/recording.mkv", [2], [2], 60,
    ));
    await waitFor(() => expect(screen.getByTestId("pending-tracks")).toHaveTextContent("none"));
    expect(screen.getByTestId("script-track")).toHaveTextContent("none");
    // Following a new MKV opens its parent; the track remains available in Media Pool.
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("recording.mkv");
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("mkv-track-2"));
  });

  it("claims the OBS target while a project is open and releases the same owner on leave", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    const view = render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);
    await waitFor(() => expect(apiMocks.claimObsLiveLinkTarget).toHaveBeenCalledWith(project.id, expect.any(String)));
    const owner = apiMocks.claimObsLiveLinkTarget.mock.calls[0][1];
    view.unmount();
    expect(apiMocks.releaseObsLiveLinkTarget).toHaveBeenCalledWith(owner);
  });

  it("opens an OBS footage on its recording-wide Timeline and Script feed", async () => {
    const archived = { ...mediaAsset("skipped", "", "2026-09-29T00:00:00Z"),
      id: "archive-1", name: "OBS LiveLink · take-one", sourceExtension: ".mka",
      sourcePath: "assets/obs-livelink/take-one/source.mka", obsRecordingId: "take-one" };
    apiMocks.listProjectMedia.mockResolvedValue([archived]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("archive-1"));
    fireEvent.click(screen.getByRole("button", { name: "open OBS footage" }));
    await waitFor(() => expect(screen.getByTestId("obs-recording")).toHaveTextContent("take-one:true"));
    await waitFor(() => expect(apiMocks.getObsLiveLinkTranscriptEvents).toHaveBeenCalledWith(project.id, "take-one", expect.any(Number)));
  });

  it("routes an archived Script overlap to the OBS Timeline asset without narrowing the footage", async () => {
    const archived = { ...mediaAsset("skipped", "", "2026-09-29T00:00:00Z"),
      id: "archive-1", name: "OBS LiveLink · take-one", sourceExtension: ".mka",
      sourcePath: "assets/obs-livelink/take-one/source.mka", obsRecordingId: "take-one" };
    apiMocks.listProjectMedia.mockResolvedValue([archived]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("archive-1"));
    fireEvent.click(screen.getByRole("button", { name: "open OBS footage" }));
    fireEvent.click(screen.getByRole("button", { name: "select archived overlap" }));
    expect(screen.getByTestId("obs-overlap-selection")).toHaveTextContent("2-5");
    expect(screen.getByTestId("obs-asset-request")).toHaveTextContent("asset-b");
    expect(screen.getByTestId("script-track")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("button", { name: "open live OBS take" }));
    await waitFor(() => expect(screen.getByTestId("obs-overlap-selection")).toHaveTextContent("none"));
  });

  it("returns from a single archived track to the parent Script when Timeline selects overlap", async () => {
    const archived = { ...mediaAsset("skipped", "", "2026-09-29T00:00:00Z"),
      id: "archive-1", name: "OBS LiveLink · take-one", sourceExtension: ".mka",
      sourcePath: "assets/obs-livelink/take-one/source.mka", obsRecordingId: "take-one" };
    const child = { ...mediaAsset("complete", "Track B", "2026-09-29T00:00:01Z"),
      id: "channel-b", name: "OBS LiveLink · Track 2", obsRecordingId: "take-one",
      sourceArchiveAssetId: "archive-1", sourceArchiveStreamIndex: 1 };
    apiMocks.listProjectMedia.mockResolvedValue([archived, child]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("channel-b"));
    fireEvent.click(screen.getByRole("button", { name: "open OBS footage" }));
    fireEvent.click(screen.getByRole("button", { name: "select second imported track" }));
    expect(screen.getByTestId("script-track")).toHaveTextContent("channel-b");
    fireEvent.click(screen.getByRole("button", { name: "select Timeline overlap" }));
    expect(screen.getByTestId("script-track")).toHaveTextContent("none");
    expect(screen.getByTestId("obs-overlap-selection")).toHaveTextContent("2-5");
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("OBS LiveLink · take-one");
  });

  it("switches from an archived asset to provisional OBS footage and its live track", async () => {
    const first = mediaAsset("complete", "Archived text", "2026-08-30T00:00:02Z");
    apiMocks.listProjectMedia.mockResolvedValue([first]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent(first.id));
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    expect(screen.getByTestId("script-value")).toHaveTextContent("Archived text");
    fireEvent.click(screen.getByRole("button", { name: "open live OBS take" }));
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống");
    expect(screen.getByTestId("script-value")).toBeEmptyDOMElement();
    expect(screen.getByTestId("obs-recording")).toHaveTextContent("live-take:true");
    fireEvent.click(screen.getByRole("button", { name: "open live OBS track" }));
    expect(screen.getByTestId("obs-track-request")).toHaveTextContent("mic-1:true");
  });

  it("adds a newly archived OBS recording to Media Pool without reloading the project", async () => {
    const archived = { ...mediaAsset("skipped", "", "2026-09-29T00:00:00Z"),
      id: "archive-new", name: "OBS LiveLink · take-new", sourceExtension: ".mka", obsRecordingId: "take-new" };
    apiMocks.listProjectMedia.mockResolvedValueOnce([]).mockResolvedValue([archived]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(apiMocks.listProjectMedia).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("media-ids")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "open new OBS take" }));
    expect(screen.getByTestId("obs-recording")).toHaveTextContent("take-new:true");
    fireEvent.click(screen.getByRole("button", { name: "archive ready" }));
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("archive-new"));
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("OBS LiveLink · take-new");
  });

  it("opens an imported multitrack parent with channel Script and saves edits to the selected child", async () => {
    const archive = { ...mediaAsset("not-applicable", "", "2026-09-29T00:00:00Z"),
      id: "archive", name: "interview.mkv", sourceExtension: ".mkv", mediaKind: "video" as const };
    const first = { ...mediaAsset("complete", "First transcript", "2026-09-29T00:00:01Z"),
      id: "channel-a", name: "Desk", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 1 };
    const second = { ...mediaAsset("complete", "Second transcript", "2026-09-29T00:00:02Z"),
      id: "channel-b", name: "Mic", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 2 };
    apiMocks.listProjectMedia.mockResolvedValue([archive, first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.updateMediaScript.mockImplementation(async (_projectId: string, id: string, text: string) => ({ ...second, id, text }));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("archive"));
    fireEvent.click(screen.getByRole("button", { name: "open imported parent" }));
    await waitFor(() => expect(screen.getByTestId("script-track")).toHaveTextContent("none"));
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("interview.mkv");
    fireEvent.click(screen.getByRole("button", { name: "select second imported track" }));
    expect(screen.getByTestId("script-value")).toHaveTextContent("Second transcript");
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("Mic");
    fireEvent.click(screen.getByRole("button", { name: "edit imported script" }));
    await waitFor(() => expect(apiMocks.updateMediaScript).toHaveBeenCalledWith(project.id, "channel-b", "Edited channel B", "user"), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "open imported parent" }));
    expect(screen.getByTestId("script-track")).toHaveTextContent("none");
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("interview.mkv");
  });

  it("withdraws unchecked tracks from the open Script and restores them when Import is ticked", async () => {
    const archive = { ...mediaAsset("not-applicable", "", "2026-09-29T00:00:00Z"), id: "archive", name: "interview.mkv", sourceExtension: ".mkv", mediaKind: "video" as const };
    const first = { ...mediaAsset("complete", "Desk text", "2026-09-29T00:00:01Z"), id: "channel-a", name: "Desk", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 1 };
    const second = { ...mediaAsset("complete", "Mic text", "2026-09-29T00:00:02Z"), id: "channel-b", name: "Mic", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 2 };
    const assets = [archive, first, second];
    apiMocks.listProjectMedia.mockResolvedValue(assets);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.setMediaImportSelected.mockImplementation(async (_projectId: string, id: string, selected: boolean) => ({ ...assets.find((asset) => asset.id === id), importSelected: selected }));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("archive"));
    fireEvent.click(screen.getByRole("button", { name: "open imported parent" }));
    await waitFor(() => expect(screen.getByTestId("script-track")).toHaveTextContent("none"));
    fireEvent.click(screen.getByRole("button", { name: "withdraw first track" }));
    await waitFor(() => expect(screen.getByTestId("script-track")).toHaveTextContent("none"));
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("interview.mkv");
    fireEvent.click(screen.getByRole("button", { name: "withdraw second track" }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống"));
    expect(screen.getByTestId("media-ids")).toHaveTextContent("archive,channel-a,channel-b");
    fireEvent.click(screen.getByRole("button", { name: "restore imported parent" }));
    await waitFor(() => expect(apiMocks.setMediaImportSelected).toHaveBeenCalledWith(project.id, "channel-b", true));
    fireEvent.click(screen.getByRole("button", { name: "open imported parent" }));
    await waitFor(() => expect(screen.getByTestId("script-track")).toHaveTextContent("none"));
  });

  it("opens Voice Training and Voice Changer directly onto their modules", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    const { container } = render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);
    expect(container.querySelector(".workspace-brand__logo")).toHaveAttribute("src", "/pro4bro-logo.png");
    fireEvent.click(screen.getByRole("button", { name: /Voice Training/ }));
    await waitFor(() => expect(container.querySelector(".workspace-stage")).toHaveClass("is-compact-heading"));
    expect(container.querySelector(".stage-heading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Voice Changer/ }));
    await waitFor(() => expect(container.querySelector(".workspace-stage")).toHaveClass("is-compact-heading"));
    expect(container.querySelector(".stage-heading")).toBeNull();
  });

  it("recycles every selected Media Pool asset through the project API", async () => {
    const first = mediaAsset("complete", "one", "2026-08-30T00:00:01Z");
    const second = { ...mediaAsset("complete", "two", "2026-08-30T00:00:02Z"), id: "asset-2", name: "second.wav" };
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.recycleProjectMedia.mockImplementation(async (_projectId: string, assetId: string) => ({ ...(assetId === first.id ? first : second), deletedAt: "2026-09-29T00:00:00Z" }));
    render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("speech.wav"));
    fireEvent.click(screen.getByRole("button", { name: "remove selected footage" }));
    await waitFor(() => expect(apiMocks.recycleProjectMedia).toHaveBeenCalledTimes(2));
    expect(apiMocks.recycleProjectMedia).toHaveBeenNthCalledWith(1, project.id, first.id);
    expect(apiMocks.recycleProjectMedia).toHaveBeenNthCalledWith(2, project.id, second.id);
    await waitFor(() => expect(screen.getByText("Đã chuyển vào Recycle Bin 2 footage.")).toBeInTheDocument());
  });

  it("restores selected Recycle Bin footage through the project API", async () => {
    const first = { ...mediaAsset("complete", "one", "2026-08-30T00:00:01Z"), deletedAt: "2026-09-29T00:00:00Z" };
    const second = { ...first, id: "asset-2", name: "second.wav" };
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.restoreProjectMedia.mockImplementation(async (_projectId: string, assetId: string) => ({ ...(assetId === first.id ? first : second), deletedAt: null }));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project} onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống"));
    fireEvent.click(await screen.findByRole("button", { name: "restore selected footage" }));
    await waitFor(() => expect(apiMocks.restoreProjectMedia).toHaveBeenCalledTimes(2));
    expect(apiMocks.restoreProjectMedia).toHaveBeenNthCalledWith(1, project.id, first.id);
    expect(apiMocks.restoreProjectMedia).toHaveBeenNthCalledWith(2, project.id, second.id);
    await waitFor(() => expect(screen.getByText("Đã restore 2 footage.")).toBeInTheDocument());
  });

  it("confirms once and permanently deletes selected Recycle Bin footage", async () => {
    const first = { ...mediaAsset("complete", "one", "2026-08-30T00:00:01Z"), deletedAt: "2026-09-29T00:00:00Z" };
    const second = { ...first, id: "asset-2", name: "second.wav" };
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.removeProjectMedia.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project} onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
      await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1,asset-2"));
      fireEvent.click(screen.getByRole("button", { name: "delete selected bin footage" }));
      await waitFor(() => expect(apiMocks.removeProjectMedia).toHaveBeenCalledTimes(2));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(apiMocks.removeProjectMedia).toHaveBeenNthCalledWith(1, project.id, "asset-1");
      expect(apiMocks.removeProjectMedia).toHaveBeenNthCalledWith(2, project.id, "asset-2");
      await waitFor(() => expect(screen.getByTestId("media-ids")).toBeEmptyDOMElement());
      expect(screen.getByText("Đã xóa hẳn 2 footage.")).toBeInTheDocument();
    } finally { confirm.mockRestore(); }
  });

  it("keeps failed permanent-delete rows visible for retry", async () => {
    const first = { ...mediaAsset("complete", "one", "2026-08-30T00:00:01Z"), deletedAt: "2026-09-29T00:00:00Z" };
    const second = { ...first, id: "asset-2", name: "second.wav" };
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.removeProjectMedia.mockImplementation(async (_projectId: string, assetId: string) => {
      if (assetId === "asset-2") throw new Error("File đang bận");
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project} onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
      await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1,asset-2"));
      fireEvent.click(screen.getByRole("button", { name: "delete selected bin footage" }));
      await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-2"));
      expect(screen.getByTestId("media-ids")).not.toHaveTextContent("asset-1");
      expect(screen.getByText(/Đã xử lý 1\/2 footage.*File đang bận/)).toBeInTheDocument();
    } finally { confirm.mockRestore(); }
  });

  it("does not resurrect a deleted footage when an older list response arrives later", async () => {
    const first = { ...mediaAsset("complete", "one", "2026-08-30T00:00:01Z"), deletedAt: "2026-09-29T00:00:00Z" };
    const staleList = deferred<ProjectMediaAsset[]>();
    apiMocks.listProjectMedia.mockResolvedValueOnce([first]).mockReturnValueOnce(staleList.promise);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.removeProjectMedia.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project} onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
      await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
      fireEvent.click(screen.getByRole("button", { name: "refresh footage list" }));
      await waitFor(() => expect(apiMocks.listProjectMedia).toHaveBeenCalledTimes(2));
      fireEvent.click(screen.getByRole("button", { name: "delete first bin footage" }));
      await waitFor(() => expect(screen.getByTestId("media-ids")).toBeEmptyDOMElement());
      await act(async () => staleList.resolve([first]));
      expect(screen.getByTestId("media-ids")).toBeEmptyDOMElement();
    } finally { confirm.mockRestore(); }
  });

it("keeps what each page has open: footage in Speech to Text, the generated voice in Voice Manipulator", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([mediaAsset("complete", "Transcript của footage", "2026-08-30T00:00:02Z")]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);

    render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);

    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("speech.wav"));

    fireEvent.click(screen.getByRole("button", { name: /Voice Manipulator/ }));
    // Nothing generated is open yet: the Manipulator timeline does not borrow the footage.
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống"));
    fireEvent.click(screen.getByRole("button", { name: "mở voice output" }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("Script · 35 đoạn"));

    fireEvent.click(screen.getByRole("button", { name: /Input/ }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("speech.wav"));
    expect(screen.getByTestId("script-value")).toHaveTextContent("Transcript của footage");

    fireEvent.click(screen.getByRole("button", { name: /Voice Manipulator/ }));
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("Script · 35 đoạn"));
  });

  it("waits for the authoritative asset before stopping terminal STT polling", async () => {
    const processing = mediaAsset("processing", "", "2026-08-30T00:00:01Z");
    const completed = mediaAsset("complete", "Transcript STT phải luôn xuất hiện", "2026-08-30T00:00:02Z");
    const fullRefresh = deferred<ProjectMediaAsset[]>();
    apiMocks.listProjectMedia
      .mockResolvedValueOnce([processing])
      .mockReturnValueOnce(fullRefresh.promise);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([{
      id: processing.id,
      transcriptionStatus: "complete",
      transcriptionProgress: 100,
      transcriptionError: null,
    }]);

    render(<WorkspaceShell
      engine={null}
      onBack={vi.fn()}
      onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)}
      onToggleTheme={vi.fn()}
      project={project}
      runtime={null}
      theme="dark"
    />);

    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    await waitFor(() => expect(apiMocks.listProjectMediaTranscriptionStatus).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.listProjectMedia).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { fullRefresh.resolve([completed]); });

    await waitFor(() => expect(screen.getByTestId("script-value")).toHaveTextContent(completed.text));
  });
  it("refreshes added tracks without resetting the selected child's edited script", async () => {
    const archive = { ...mediaAsset("not-applicable", "", "2026-09-29T00:00:00Z"), id: "archive", name: "interview.mkv" };
    const second = { ...mediaAsset("complete", "Mic text", "2026-09-29T00:00:02Z"), id: "channel-b", name: "Mic", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 2 };
    const added = { ...second, id: "channel-c", text: "", sourceArchiveStreamIndex: 3 };
    apiMocks.listProjectMedia.mockResolvedValue([archive, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.importExistingAudioTrack.mockResolvedValue(added);
    apiMocks.updateMediaScript.mockImplementation(async (_projectId: string, id: string, text: string) => ({ ...second, id, text }));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("archive"));
    fireEvent.click(screen.getByRole("button", { name: "open imported parent" }));
    fireEvent.click(screen.getByRole("button", { name: "select second imported track" }));
    fireEvent.click(screen.getByRole("button", { name: "edit imported script" }));
    apiMocks.listProjectMedia.mockResolvedValue([archive, second, added]);
    fireEvent.click(screen.getByRole("button", { name: "add omitted track" }));
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("channel-c"));
    expect(apiMocks.importExistingAudioTrack).toHaveBeenCalledWith(project.id, "archive", 3);
    expect(screen.getByTestId("script-track")).toHaveTextContent("channel-b");
    expect(screen.getByTestId("script-value")).toHaveTextContent("Edited channel B");
  });

});
