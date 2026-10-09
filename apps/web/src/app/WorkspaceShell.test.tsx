import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Profiler } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectMediaAsset, ReadingSession, VoiceScriptJob } from "../domain/types";
import type { StudioContext } from "../modules/registry/ModuleRegistry";
import { WorkspaceShell } from "./WorkspaceShell";
const collectionContext = vi.hoisted(() => ({ current: null as StudioContext | null }));

const apiMocks = vi.hoisted(() => ({
  listProjectVoices: vi.fn(),
  listVoiceOutputs: vi.fn(),
  getTrainingModels: vi.fn(),
  compileDataset: vi.fn(),
  setMediaTrainingSelected: vi.fn(),
  startTrainingRun: vi.fn(),
  readVoiceScript: vi.fn(),
  getVoiceScriptJob: vi.fn(),
  stopGeneration: vi.fn(),
  getOmniVoiceProfileSchema: vi.fn(),
  getPreferences: vi.fn(),
  getSystemStatus: vi.fn(),
  getTrainingCatalog: vi.fn(),
  saveTrainingCatalog: vi.fn(),
  listProjectMedia: vi.fn(),
  enqueueMediaTranscriptions: vi.fn().mockResolvedValue([]),
  enqueueMediaDiarization: vi.fn().mockResolvedValue({}),
  listProjectMediaTranscriptionStatus: vi.fn(),
  listReadingPacks: vi.fn(),
  listReadingSessions: vi.fn(),
  appendReadingTake: vi.fn(),
  importProjectMedia: vi.fn(),
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
  updateMediaAnnotations: vi.fn(),
  pickMediaFiles: vi.fn(),
  inspectLocalMediaTracks: vi.fn(),
  startGrowingMkvFollow: vi.fn(),
  getGrowingMkvAssets: vi.fn().mockResolvedValue([]),
  importLocalProjectMedia: vi.fn(),
  setMediaImportSelected: vi.fn(),
  importExistingAudioTrack: vi.fn(),
}));

vi.mock("../api/client", () => ({ api: apiMocks }));
vi.mock("../modules/registry/ModuleRegistry", () => ({
  ModuleRegistry: ({ id, context }: { id: string; context: { script: string; onScriptSelectionChange?: (ids: string[]) => void; selectedScriptAssetIds?: string[]; pendingMediaImports?: Array<{ name: string; status: string }>; take: { name: string } | null; mediaAssets: ProjectMediaAsset[]; selectedImportedTrackId: string | null; onSelectImportedTrack: (id: string) => void; onSelectAsset: (id: string) => void; onToggleImport: (id: string, selected: boolean, streamIndex?: number) => void; onScriptChange: (value: string) => void; obsTimelineActive: boolean; obsTimelineRecordingId: string | null; obsSeekRequest: { channelId: string; selectOnly?: boolean } | null; onOpenObsRecording: (id: string) => void; onOpenObsTrack: (id: string, channelId: string) => void; onOpenVoiceOutput: (output: unknown) => void; onBatchMediaAction: (action: unknown) => void; onRemoveAsset: (asset: ProjectMediaAsset) => void; onOpenObsAsset: (id: string) => void; onImportLocalMedia: () => void; pendingLocalMedia: { tracks: Array<{ streamIndex: number; imported: boolean; transcribe: boolean }> } | null; onPendingLocalTrackChange: (streamIndex: number, field: "imported" | "transcribe", selected: boolean) => void; onConfirmPendingLocalMedia: (mode: "import" | "follow") => void } }) => {
    collectionContext.current = context as unknown as StudioContext;
    if (id === "library-panel") return <><button onClick={() => (context as unknown as StudioContext).onQueueTranscriptions("large-v3")} type="button">queue selected STT</button><button onClick={() => (context as unknown as StudioContext).onRunDiarization()} type="button">queue selected diarization</button><button onClick={() => (context as unknown as { onClearMediaSelection: () => void }).onClearMediaSelection()} type="button">clear footage selection</button><button onClick={() => context.onSelectAsset("asset-1")} type="button">open first footage</button><button onClick={() => context.onSelectAsset("archive-1")} type="button">open OBS footage</button><button onClick={() => context.onToggleImport("channel-a", false)} type="button">withdraw first track</button><button onClick={() => context.onToggleImport("channel-b", false)} type="button">withdraw second track</button><button onClick={() => context.onToggleImport("archive", true)} type="button">restore imported parent</button><button onClick={() => context.onToggleImport("archive", true, 3)} type="button">add omitted track</button><button onClick={() => context.onSelectAsset("archive")} type="button">open imported parent</button><button onClick={() => context.onBatchMediaAction({ kind: "recycle", assetIds: ["asset-1", "asset-2"] })} type="button">remove selected footage</button><button onClick={() => context.onBatchMediaAction({ kind: "restore", assetIds: ["asset-1", "asset-2"] })} type="button">restore selected footage</button><button onClick={() => context.onBatchMediaAction({ kind: "delete", assetIds: ["asset-1", "asset-2"] })} type="button">delete selected bin footage</button><button onClick={() => { const asset = context.mediaAssets.find((item) => item.id === "asset-1"); if (asset) context.onRemoveAsset(asset); }} type="button">delete first bin footage</button><button onClick={() => context.onOpenObsAsset("asset-1")} type="button">refresh footage list</button><button onClick={() => context.onScriptSelectionChange?.(["asset-1", "asset-2"])} type="button">select multiple footage</button><button onClick={() => context.onBatchMediaAction({ kind: "selection", target: "training", assetIds: ["asset-1", "asset-2"], selected: true })} type="button">bulk training on</button><button onClick={() => context.onBatchMediaAction({ kind: "selection", target: "training", assetIds: ["asset-1", "asset-2"], selected: false })} type="button">bulk training off</button><output data-testid="media-ticks">{context.mediaAssets.map((asset) => `${asset.id}:${asset.trainingSelected}`).join(",")}</output><output data-testid="pending-imports">{context.pendingMediaImports?.map((row) => `${row.name}:${row.status}`).join(",")}</output><output data-testid="media-selection">{context.selectedScriptAssetIds?.join(",")}</output><output data-testid="media-ids">{context.mediaAssets.map((item) => item.id).join(",")}</output><output data-testid="recycled-ids">{context.mediaAssets.filter((item) => item.deletedAt).map((item) => item.id).join(",")}</output><button onClick={context.onImportLocalMedia} type="button">pick native media</button><output data-testid="pending-tracks">{context.pendingLocalMedia?.tracks.map((track) => `${track.streamIndex}:${track.imported}:${track.transcribe}`).join(",") ?? "none"}</output><button onClick={() => context.onPendingLocalTrackChange(1, "imported", false)} type="button">omit first track</button><button onClick={() => context.onPendingLocalTrackChange(2, "transcribe", true)} type="button">stt second track</button><button onClick={() => context.onConfirmPendingLocalMedia("follow")} type="button">start follow</button></>;
    if (id === "media-pool") return <><button onClick={context.onImportLocalMedia} type="button">pick native media</button><button onClick={() => context.onOpenObsRecording("live-take")} type="button">open live OBS take</button><button onClick={() => context.onOpenObsTrack("live-take", "mic-1")} type="button">open live OBS track</button><output data-testid="pending-tracks">{context.pendingLocalMedia?.tracks.map((track) => `${track.streamIndex}:${track.imported}:${track.transcribe}`).join(",") ?? "none"}</output><button onClick={() => context.onPendingLocalTrackChange(1, "imported", false)} type="button">omit first track</button><button onClick={() => context.onPendingLocalTrackChange(2, "transcribe", true)} type="button">stt second track</button><button onClick={() => context.onConfirmPendingLocalMedia("follow")} type="button">start follow</button></>;
    if (id === "script") {
      const overlap = context as unknown as { obsOverlapSelection: { startSeconds: number; endSeconds: number } | null;
        onObsArchivedOverlapSelect: (trackId: string, selection: { recordingId: string; startSeconds: number;
          endSeconds: number; sourceIds: string[] }) => void };
      const commands = context as unknown as StudioContext;
      return <><button onClick={() => { const words = commands.take?.words; if (words?.length) commands.onWordsChange([{ ...words[0], text: "edited", start: .2, end: .7, speakerId: "speaker-new" }, ...words.slice(1)], "edited"); }} type="button">edit timed word</button><button onClick={commands.onScriptUndo} type="button">undo script edit</button><button onClick={commands.onScriptRedo} type="button">redo script edit</button><output data-testid="history-word">{commands.take?.words?.[0] ? JSON.stringify(commands.take.words[0]) : "none"}</output><output data-testid="script-value">{context.script}</output><output data-testid="script-track">{context.selectedImportedTrackId ?? "none"}</output><output data-testid="obs-overlap-selection">{overlap.obsOverlapSelection ? `${overlap.obsOverlapSelection.startSeconds}-${overlap.obsOverlapSelection.endSeconds}` : "none"}</output><button onClick={() => overlap.onObsArchivedOverlapSelect("asset-b", { recordingId: "take-one", startSeconds: 2, endSeconds: 5, sourceIds: ["asset-a", "asset-b"] })} type="button">select archived overlap</button><button onClick={() => context.onSelectImportedTrack("channel-b")} type="button">select second imported track</button><button onClick={() => context.onScriptChange("Edited channel B")} type="button">edit imported script</button></>;
    }
    if (id === "timeline") {
      const request = context.obsSeekRequest as { assetId?: string; channelId?: string; selectOnly?: boolean } | null;
      const overlap = context as unknown as { onObsOverlapSelect: (selection: { recordingId: string;
        startSeconds: number; endSeconds: number; sourceIds: string[] }) => void };
      return <><output data-testid="timeline-take">{context.take?.name ?? "trống"}</output><output data-testid="obs-recording">{context.obsTimelineRecordingId ?? "none"}:{String(context.obsTimelineActive)}</output><output data-testid="obs-track-request">{request?.channelId ?? "none"}:{String(request?.selectOnly ?? false)}</output><output data-testid="obs-asset-request">{request?.assetId ?? "none"}</output><button onClick={() => overlap.onObsOverlapSelect({ recordingId: "take-one", startSeconds: 2, endSeconds: 5, sourceIds: ["asset-a", "asset-b"] })} type="button">select Timeline overlap</button></>;
    }
    if (id === "recorder") return <><button type="button" onClick={() => (context as unknown as { onTakeChange: (capture: unknown) => void }).onTakeChange({ name: "hq.wav", url: "blob:hq", duration: 999, file: new File(["wav"], "hq.wav"), origin: "record", realtimeText: "ASR khác bài đọc", words: [{ text: "ASR", start: 0, end: 1 }], readingSessionId: "session-1", readingSessionRevision: 0, readingCardId: "card-1", captureId: "capture-1", knownText: "Lời bài đọc." })}>deliver HQ take</button><button onClick={() => void (context as unknown as { onObsArchiveReady: (id: string) => Promise<void> }).onObsArchiveReady("take-new")} type="button">archive ready</button><button onClick={() => context.onOpenObsRecording("live-take")} type="button">open live OBS take</button><button onClick={() => context.onOpenObsRecording("take-new")} type="button">open new OBS take</button><button onClick={() => context.onOpenObsTrack("live-take", "mic-1")} type="button">open live OBS track</button></>;
    if (id === "manipulator-library") {
      return <button onClick={() => context.onOpenVoiceOutput(GENERATED)} type="button">mở voice output</button>;
    }
    if (id === "voice-generator") {
      const generation = context as unknown as StudioContext;
      return <><button onClick={generation.onGenerate} type="button">read test script</button>
        <button onClick={() => void generation.onStopGeneration("all")} type="button">stop test generation</button>
        <output data-testid="generation-state">{String(generation.generating)}:{generation.voiceScriptJob?.status ?? "none"}</output>
        <output data-testid="generation-voices">{generation.projectVoices.length}</output></>;
    }
    if (id === "training-job") return <button onClick={() => (context as unknown as StudioContext).onStartTrainingRun()} type="button">start test training</button>;
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
    apiMocks.saveTrainingCatalog.mockImplementation(async (_id, catalog) => catalog);
    localStorage.clear();
    apiMocks.listReadingPacks.mockResolvedValue([]);
    apiMocks.updateMediaAnnotations.mockImplementation(async (_projectId: string, id: string) => {
      const assets = await apiMocks.listProjectMedia();
      return assets.find((asset: ProjectMediaAsset) => asset.id === id);
    });
    apiMocks.listReadingSessions.mockResolvedValue({ items: [], total: 0 });
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
    apiMocks.listProjectVoices.mockResolvedValue([]);
    apiMocks.listVoiceOutputs.mockResolvedValue([]);
    apiMocks.getTrainingModels.mockResolvedValue([]);
    apiMocks.claimObsLiveLinkTarget.mockResolvedValue(undefined);
    apiMocks.releaseObsLiveLinkTarget.mockResolvedValue(undefined);
    apiMocks.getObsLiveLinkTranscriptEvents.mockResolvedValue({ events: [], revision: 0 });
  });

  it("persists an explicit unassigned row without changing neighboring inherited words", async () => {
    let saved = { ...mediaAsset("complete", "xin chào", "2026-10-09T00:00:00Z"), speakerProfileIds: ["speaker-1"],
      words: [{ text: "xin", start: 1, end: 1.4, speakerId: "speaker-1" }, { text: "chào", start: 1.5, end: 2 }] };
    apiMocks.listProjectMedia.mockImplementation(async () => [saved]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.updateMediaScript.mockImplementation(async (_projectId: string, _id: string, text: string, _source: string, words: ProjectMediaAsset["words"]) => { saved = { ...saved, text, words } as typeof saved; return saved; });
    apiMocks.updateMediaAnnotations.mockImplementation(async () => saved);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn()} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    await waitFor(() => expect(collectionContext.current?.take?.words).toHaveLength(2));
    await act(async () => { collectionContext.current?.onAssignScriptWords?.("asset-1", [0], null); });
    await waitFor(() => expect(apiMocks.updateMediaScript).toHaveBeenCalled());
    expect(saved.words[0]).toHaveProperty("speakerId", null);
    expect(saved.words[1]).not.toHaveProperty("speakerId");
    expect(saved.speakerProfileIds).toEqual(["speaker-1"]);
  });

  it("cancels a pending catalog debounce before collection transfer starts", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn()} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await screen.findByTestId("media-ids");
    const schedule = vi.spyOn(window, "setTimeout");
    const clear = vi.spyOn(window, "clearTimeout");
    try {
      const catalog = collectionContext.current!.trainingCatalog;
      act(() => collectionContext.current!.onCatalogChange({ ...catalog, updatedAt: "2026-10-09T00:00:00Z" }));
      const timerIndex = schedule.mock.calls.reduce((last, call, index) => call[1] === 350 ? index : last, -1);
      expect(timerIndex).toBeGreaterThanOrEqual(0);
      const timerId = schedule.mock.results[timerIndex].value;
      let prepared: Promise<void>;
      await act(async () => {
        prepared = collectionContext.current!.onPrepareCollectionExport!();
        // Transfer may start before React's cleanup commits; cancellation must
        // already have happened at the synchronous flush boundary.
        expect(clear).toHaveBeenCalledWith(timerId);
        await prepared;
      });
      expect(apiMocks.saveTrainingCatalog).toHaveBeenCalledTimes(1);
    } finally { schedule.mockRestore(); clear.mockRestore(); }
  });

  it.each(["all", "missing", "cancel"])("asks before enqueueing a mixed STT selection: %s", async (choice) => {
    const done = mediaAsset("complete", "Đã có text", "2026-10-08T00:00:01Z");
    const fresh = { ...mediaAsset("skipped", "", "2026-10-08T00:00:02Z"), id: "asset-2" };
    const removed = { ...fresh, id: "removed", deletedAt: "2026-10-08T00:00:03Z" };
    apiMocks.listProjectMedia.mockResolvedValue([done, fresh, removed]);
    apiMocks.enqueueMediaTranscriptions.mockResolvedValue([]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-2"));
    fireEvent.click(screen.getByRole("button", { name: "queue selected STT" }));
    expect(apiMocks.enqueueMediaTranscriptions).not.toHaveBeenCalled();
    const name = choice === "all" ? "Chạy toàn bộ (2)" : choice === "missing" ? "Chỉ phần chưa có kết quả (1)" : "Hủy";
    fireEvent.click(await screen.findByRole("button", { name }));
    if (choice === "cancel") {
      await act(async () => { await Promise.resolve(); });
      expect(apiMocks.enqueueMediaTranscriptions).not.toHaveBeenCalled();
    } else await waitFor(() => expect(apiMocks.enqueueMediaTranscriptions).toHaveBeenCalledWith(project.id,
      choice === "all" ? ["asset-1", "asset-2"] : ["asset-2"], "large-v3"));
  });

  it("shows media without waiting for unrelated catalog loading", async () => {
    const catalog = deferred<unknown>();
    apiMocks.getTrainingCatalog.mockReturnValue(catalog.promise);
    apiMocks.listProjectMedia.mockResolvedValue([mediaAsset("complete", "Text", "2026-10-08T00:00:01Z")]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
  });

  it("commits selection feedback before loading Script and Timeline, then uses the latest selection", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([mediaAsset("complete", "Đúng footage", "2026-10-08T00:00:01Z")]);
    const commits: string[] = [];
    render(<Profiler id="workspace" onRender={() => commits.push(document.body.textContent ?? "")}>
      <WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
        onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
        project={project} runtime={null} theme="dark" />
    </Profiler>);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    commits.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    expect(commits.some((text) => text.includes("Đang mở footage…"))).toBe(true);
    await waitFor(() => expect(screen.getByTestId("script-value")).toHaveTextContent("Đúng footage"));
    fireEvent.click(screen.getByRole("button", { name: "clear footage selection" }));
    await waitFor(() => expect(screen.getByTestId("script-value")).toBeEmptyDOMElement());
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống");
  });

  it("closes opened data for multi-selection and rejects a late open response", async () => {
    const first = mediaAsset("complete", "first text", "2026-10-08T00:00:01Z");
    const second = { ...first, id: "asset-2", name: "second.wav", text: "second text" };
    const late = deferred<ProjectMediaAsset[]>();
    apiMocks.listProjectMedia.mockResolvedValueOnce([first, second]).mockReturnValueOnce(late.promise);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await screen.findByTestId("media-ids");
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-2"));
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    await waitFor(() => expect(screen.getByTestId("script-value")).toHaveTextContent("first text"));
    fireEvent.click(screen.getByRole("button", { name: "refresh footage list" }));
    fireEvent.click(screen.getByRole("button", { name: "select multiple footage" }));
    await waitFor(() => expect(screen.getByTestId("script-value")).toBeEmptyDOMElement());
    expect(screen.getByTestId("media-selection")).toHaveTextContent("asset-1,asset-2");
    expect(screen.getByTestId("timeline-take")).toHaveTextContent("trống");
    await act(async () => { late.resolve([first, second]); });
    expect(screen.getByTestId("script-value")).toBeEmptyDOMElement();
    expect(screen.getByTestId("media-selection")).toHaveTextContent("asset-1,asset-2");
  });

  it("updates every bulk checkbox immediately while saving to the API", async () => {
    const first = { ...mediaAsset("complete", "first", "2026-10-08T00:00:01Z"), trainingSelected: false };
    const second = { ...first, id: "asset-2", name: "second.wav" };
    const pending = deferred<ProjectMediaAsset>();
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.setMediaTrainingSelected.mockReturnValueOnce(pending.promise).mockResolvedValue({ ...second, trainingSelected: true });
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-2"));
    fireEvent.click(screen.getByRole("button", { name: "bulk training on" }));
    expect(screen.getByTestId("media-ticks")).toHaveTextContent("asset-1:true,asset-2:true");
    await act(async () => pending.resolve({ ...first, trainingSelected: true }));
  });

  it("undoes and redoes text, timing and speaker together through the ordered project saves", async () => {
    const first = { ...mediaAsset("complete", "one", "2026-10-08T00:00:01Z"), words: [{ text: "one", start: .1, end: .6, speakerId: "speaker-original" }] };
    let saved: ProjectMediaAsset = first;
    apiMocks.listProjectMedia.mockResolvedValue([first]);
    apiMocks.updateMediaScript.mockImplementation(async (_projectId: string, _id: string, text: string, _source: string, words: ProjectMediaAsset["words"]) => { saved = { ...saved, text, words }; return saved; });
    apiMocks.updateMediaAnnotations.mockImplementation(async (_projectId: string, _id: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: ProjectMediaAsset["emotion"]) => { saved = { ...saved, speakerProfileIds, environmentProfileIds, emotion }; return saved; });
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    fireEvent.click(screen.getByRole("button", { name: "open first footage" }));
    fireEvent.click(screen.getByRole("button", { name: "edit timed word" }));
    expect(screen.getByTestId("script-value")).toHaveTextContent("edited");
    fireEvent.click(screen.getByRole("button", { name: "undo script edit" }));
    expect(JSON.parse(screen.getByTestId("history-word").textContent!)).toEqual(first.words[0]);
    expect(screen.getByTestId("script-value")).toHaveTextContent("one");
    fireEvent.click(screen.getByRole("button", { name: "redo script edit" }));
    expect(JSON.parse(screen.getByTestId("history-word").textContent!)).toMatchObject({ text: "edited", start: .2, end: .7, speakerId: "speaker-new" });
    await waitFor(() => expect(apiMocks.updateMediaScript).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(apiMocks.updateMediaAnnotations).toHaveBeenCalledTimes(3));
    expect(saved.words[0]).toMatchObject({ text: "edited", start: .2, end: .7, speakerId: "speaker-new" });
  });

  it("shows a host footage slot before delayed track information arrives", async () => {
    const inspection = deferred<{ tracks: unknown[] }>();
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.pickMediaFiles.mockResolvedValue({ paths: ["E:/media/large.mkv"] });
    apiMocks.inspectLocalMediaTracks.mockReturnValue(inspection.promise);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    fireEvent.click(screen.getByRole("button", { name: "pick native media" }));
    await waitFor(() => expect(screen.getByTestId("pending-imports")).toHaveTextContent("large.mkv:importing"));
    await act(async () => inspection.resolve({ tracks: [] }));
  });

  it("orders rapid bulk tick changes and prevents an older save from restoring the earlier value", async () => {
    const first = { ...mediaAsset("complete", "first", "2026-10-08T00:00:01Z"), trainingSelected: false };
    const second = { ...first, id: "asset-2", name: "second.wav" };
    const pending = deferred<ProjectMediaAsset>();
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.setMediaTrainingSelected.mockReturnValueOnce(pending.promise).mockImplementation(async (_projectId: string, id: string, selected: boolean) => ({ ...(id === first.id ? first : second), trainingSelected: selected }));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()} project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-2"));
    fireEvent.click(screen.getByRole("button", { name: "bulk training on" }));
    fireEvent.click(screen.getByRole("button", { name: "bulk training off" }));
    expect(screen.getByTestId("media-ticks")).toHaveTextContent("asset-1:false,asset-2:false");
    expect(apiMocks.setMediaTrainingSelected).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ...first, trainingSelected: true }));
    await waitFor(() => expect(apiMocks.setMediaTrainingSelected).toHaveBeenCalledTimes(3));
    expect(apiMocks.setMediaTrainingSelected.mock.calls.map((call) => [call[1], call[2]])).toEqual([["asset-1", true], ["asset-1", false], ["asset-2", false]]);
    expect(screen.getByTestId("media-ticks")).toHaveTextContent("asset-1:false,asset-2:false");
  });

  function prepareGeneration(rows = [{ id: "row-1", text: "xin chào", voiceId: "voice-1", speakerProfileId: "speaker-1" }]) {
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.listProjectVoices.mockResolvedValue([{ id: "voice-1", name: "Test voice", kind: "lora", engine: "omnivoice", speakerProfileId: "speaker-1", createdAt: "2026-10-07T00:00:00Z" }]);
    localStorage.setItem(`pro4bro:${project.id}:voice-script`, JSON.stringify(rows));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={{ ...project, lastPage: "voice-manipulator" }} runtime={null} theme="dark" />);
  }

  function generationJob(status: VoiceScriptJob["status"]): VoiceScriptJob {
    return { id: "generation-1", projectId: project.id, status, total: 2, done: 1, reused: 0,
      currentRowId: null, message: null, output: null, error: null, startedAt: "2026-10-07T00:00:00Z", finishedAt: null };
  }

  it.each([true, false])("chooses Generate Voice rows before dispatch and requests true regeneration for all: %s", async (all) => {
    apiMocks.listVoiceOutputs.mockResolvedValue([{ ...GENERATED, segments: [{ rowId: "row-1", voiceId: "voice-1", generatorId: "gen", text: "xin chào" }] }]);
    apiMocks.readVoiceScript.mockResolvedValue(generationJob("cancelled"));
    prepareGeneration([{ id: "row-1", text: "xin chào", voiceId: "voice-1", speakerProfileId: "speaker-1" },
      { id: "row-2", text: "từ mới", voiceId: "voice-1", speakerProfileId: "speaker-1" }]);
    await waitFor(() => expect(screen.getByTestId("generation-voices")).toHaveTextContent("1"));
    fireEvent.click(screen.getByRole("button", { name: "read test script" }));
    expect(apiMocks.readVoiceScript).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: all ? "Chạy toàn bộ (2)" : "Chỉ phần chưa có kết quả (1)" }));
    await waitFor(() => expect(apiMocks.readVoiceScript).toHaveBeenCalled());
    const request = apiMocks.readVoiceScript.mock.calls[0][1];
    expect(request.rows.map((row: { id: string }) => row.id)).toEqual(all ? ["row-1", "row-2"] : ["row-2"]);
    expect(request.forceRegenerate).toBe(all);
  });

  it("runs diarization only for unfinished selected footage after the in-app choice", async () => {
    const preferences = await apiMocks.getPreferences();
    apiMocks.getPreferences.mockResolvedValue({ ...preferences, diarization: { ...preferences.diarization, huggingfaceTokenConfigured: true } });
    const done = { ...mediaAsset("complete", "x", "2026-10-08T00:00:01Z"), diarizationSelected: true, diarizationStatus: "complete" };
    const fresh = { ...done, id: "asset-2", diarizationStatus: "idle" };
    apiMocks.listProjectMedia.mockResolvedValue([done, fresh]);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-2"));
    fireEvent.click(screen.getByRole("button", { name: "queue selected diarization" }));
    expect(apiMocks.enqueueMediaDiarization).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Chỉ phần chưa có kết quả (1)" }));
    await waitFor(() => expect(apiMocks.enqueueMediaDiarization).toHaveBeenCalledWith(project.id, "asset-2", null));
    expect(apiMocks.enqueueMediaDiarization).toHaveBeenCalledTimes(1);
  });

  it("starts Training only for targets without a published completed run", async () => {
    const catalog = await apiMocks.getTrainingCatalog();
    apiMocks.getTrainingCatalog.mockResolvedValue({ ...catalog, settings: { ...catalog.settings, targetSpeakerIds: ["a", "b"], modelId: "model" } });
    apiMocks.getTrainingModels.mockResolvedValue([{ id: "model", available: true, parameters: [], category: "train" }]);
    apiMocks.listTrainingRuns.mockResolvedValue([{ id: "run1", status: "complete", speakerProfileId: "a", createdAt: "2026-10-08T12:00:00Z", config: { modelId: "model", parameters: {} }, checkpoints: [] }]);
    apiMocks.listProjectVoices.mockResolvedValue([{ id: "v1", speakerProfileId: "a", sourceRunId: "run1", modelId: "model" }]);
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.compileDataset.mockResolvedValue({ id: "dataset", stats: { segments: 2 } });
    apiMocks.startTrainingRun.mockResolvedValue(undefined);
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={{ ...project, lastPage: "voice-training" }} runtime={null} theme="dark" />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "start test training" }));
    expect(apiMocks.compileDataset).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Chỉ phần chưa có kết quả (1)" }));
    await waitFor(() => expect(apiMocks.startTrainingRun).toHaveBeenCalledWith(project.id, {
      manifestId: "dataset", config: { modelId: "model", parameters: {} }, speakerProfileIds: ["b"],
    }));
  });

  it("does not revive generation when its start response arrives after confirmed Stop", async () => {
    const start = deferred<VoiceScriptJob>();
    apiMocks.readVoiceScript.mockReturnValue(start.promise);
    apiMocks.stopGeneration.mockResolvedValue(generationJob("cancelled"));
    prepareGeneration();
    await waitFor(() => expect(screen.getByTestId("generation-voices")).toHaveTextContent("1"));
    fireEvent.click(screen.getByRole("button", { name: "read test script" }));
    await waitFor(() => expect(apiMocks.readVoiceScript).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "stop test generation" }));
    await waitFor(() => expect(screen.getByTestId("generation-state")).toHaveTextContent("false:cancelled"));
    await act(async () => start.resolve(generationJob("running")));
    expect(screen.getByTestId("generation-state")).toHaveTextContent("false:cancelled");
  });

  it("opens the completed prefix when queue Stop returns a stopped output", async () => {
    apiMocks.readVoiceScript.mockResolvedValue({ ...generationJob("stopped"), output: GENERATED });
    prepareGeneration();
    await waitFor(() => expect(screen.getByTestId("generation-voices")).toHaveTextContent("1"));
    fireEvent.click(screen.getByRole("button", { name: "read test script" }));
    await waitFor(() => expect(screen.getByTestId("generation-state")).toHaveTextContent("false:stopped"));
    expect(await screen.findByTestId("timeline-take")).toHaveTextContent(GENERATED.name);
  });

  it("keeps a guided take's snapshot text instead of replacing it with live ASR", async () => {
    const session: ReadingSession = {
      id: "session-1", schemaVersion: 1, revision: 0, status: "in_progress",
      speakerProfileId: "speaker-1", speakerName: "Người đọc", packTitle: "Bài đọc", packVersion: 1,
      plan: { packId: "pack-1", language: "vi", mode: "take", emotions: ["normal"], cards: [
        { cardId: "card-1", passageId: "passage-1", passageTitle: "Đầu", direction: "Tự nhiên", emotion: "normal", text: "Lời bài đọc.", estimatedSeconds: 2 },
      ] }, cardIndex: 0, recordedSecondsByCard: {}, secondsSinceBreak: 0, skippedCardIds: [], takes: [],
      createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
    };
    apiMocks.listReadingSessions.mockResolvedValue({ items: [session], total: 1 });
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    const asset = { ...mediaAsset("skipped", "Lời bài đọc.", "2026-10-05T00:00:01Z"), name: "hq.wav", speakerProfileIds: ["speaker-1"] };
    apiMocks.appendReadingTake.mockResolvedValue({ session: { ...session, revision: 1, cardIndex: 1, status: "completed", recordedSecondsByCard: { "card-1": 2.25 } }, asset });
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(apiMocks.listReadingSessions).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "deliver HQ take" }));
    await waitFor(() => expect(screen.getByTestId("script-value")).toHaveTextContent("Lời bài đọc."));
    expect(apiMocks.updateMediaScript).not.toHaveBeenCalled();
    expect(apiMocks.importProjectMedia).not.toHaveBeenCalled();
    expect(apiMocks.appendReadingTake).toHaveBeenCalledWith(project.id, "session-1", expect.any(File), "capture-1", "card-1", 0);
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
    apiMocks.pickMediaFiles.mockResolvedValue({ paths: ["C:/captures/recording.mkv"] });
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
    await waitFor(() => expect(screen.getByTestId("script-track")).toHaveTextContent("none"));
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
    fireEvent.click(screen.getByRole("button", { name: "open live OBS take" }));
    expect(screen.getByTestId("obs-track-request")).toHaveTextContent("none:false");
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
    await waitFor(() => expect(screen.getByTestId("timeline-take")).toHaveTextContent("OBS LiveLink · take-new"));
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
    await waitFor(() => expect(apiMocks.updateMediaScript).toHaveBeenCalledWith(project.id, "channel-b", "Edited channel B", "user", expect.arrayContaining([expect.objectContaining({ text: "Edited", timingTrusted: false })])), { timeout: 2000 });
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

  it("does not let an in-flight STT refresh undo a recycle action", async () => {
    const processing = { ...mediaAsset("processing", "partial", "2026-08-30T00:00:01Z") };
    const staleList = deferred<ProjectMediaAsset[]>();
    const status = deferred<Array<{ id: string; transcriptionStatus: ProjectMediaAsset["transcriptionStatus"]; transcriptionProgress: number; transcriptionError: null }>>();
    apiMocks.listProjectMedia.mockResolvedValueOnce([processing]).mockReturnValueOnce(staleList.promise);
    apiMocks.listProjectMediaTranscriptionStatus.mockReturnValue(status.promise);
    apiMocks.recycleProjectMedia.mockResolvedValue({ ...processing, deletedAt: "2026-10-08T01:00:00Z", updatedAt: "2026-10-08T01:00:00Z" });
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1"));
    status.resolve([{ id: processing.id, transcriptionStatus: "complete", transcriptionProgress: 100, transcriptionError: null }]);
    await waitFor(() => expect(apiMocks.listProjectMedia).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "remove selected footage" }));
    await waitFor(() => expect(screen.getByTestId("recycled-ids")).toHaveTextContent("asset-1"));
    // A newer read may acknowledge recycle before the oldest read completes.
    apiMocks.listProjectMedia.mockResolvedValue([{ ...processing, deletedAt: "2026-10-08T01:00:00Z" }]);
    fireEvent.click(screen.getByRole("button", { name: "refresh footage list" }));
    await waitFor(() => expect(apiMocks.listProjectMedia).toHaveBeenCalledTimes(3));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { staleList.resolve([processing]); await staleList.promise; });
    await waitFor(() => expect(screen.getByTestId("recycled-ids")).toHaveTextContent("asset-1"));
  });

  it("restores and permanently deletes footage immediately after recycle without refreshing", async () => {
    const first = mediaAsset("complete", "one", "2026-08-30T00:00:01Z");
    const second = { ...mediaAsset("complete", "two", "2026-08-30T00:00:02Z"), id: "asset-2", name: "second.wav" };
    apiMocks.listProjectMedia.mockResolvedValue([first, second]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.recycleProjectMedia.mockImplementation(async (_projectId: string, assetId: string) => ({
      ...(assetId === first.id ? first : second), deletedAt: "2026-10-08T01:00:00Z",
    }));
    apiMocks.restoreProjectMedia.mockImplementation(async (_projectId: string, assetId: string) => ({
      ...(assetId === first.id ? first : second), deletedAt: null,
    }));
    apiMocks.removeProjectMedia.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
        onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
        project={project} runtime={null} theme="dark" />);
      await waitFor(() => expect(screen.getByTestId("media-ids")).toHaveTextContent("asset-1,asset-2"));

      fireEvent.click(screen.getByRole("button", { name: "remove selected footage" }));
      await waitFor(() => expect(screen.getByTestId("recycled-ids")).toHaveTextContent("asset-1,asset-2"));
      fireEvent.click(screen.getByRole("button", { name: "restore selected footage" }));
      await waitFor(() => expect(apiMocks.restoreProjectMedia).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByTestId("recycled-ids")).toBeEmptyDOMElement());

      fireEvent.click(screen.getByRole("button", { name: "remove selected footage" }));
      await waitFor(() => expect(screen.getByTestId("recycled-ids")).toHaveTextContent("asset-1,asset-2"));
      fireEvent.click(screen.getByRole("button", { name: "delete selected bin footage" }));
      await waitFor(() => expect(screen.getByTestId("media-ids")).toBeEmptyDOMElement());
      expect(apiMocks.removeProjectMedia).toHaveBeenCalledTimes(2);
      expect(apiMocks.listProjectMedia).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledOnce();
    } finally { confirm.mockRestore(); }
  });

  it("shows host picker errors in the workspace so Import never appears inert", async () => {
    apiMocks.listProjectMedia.mockResolvedValue([]);
    apiMocks.listProjectMediaTranscriptionStatus.mockResolvedValue([]);
    apiMocks.pickMediaFiles.mockRejectedValue(new Error("Native file picker is unavailable on this client"));
    render(<WorkspaceShell engine={null} onBack={vi.fn()} onPageChange={async () => project}
      onRuntimeAction={vi.fn().mockResolvedValue(undefined)} onToggleTheme={vi.fn()}
      project={project} runtime={null} theme="dark" />);
    fireEvent.click(await screen.findByRole("button", { name: "pick native media" }));
    expect(await screen.findByText("Native file picker is unavailable on this client")).toHaveClass("studio-notice");
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
