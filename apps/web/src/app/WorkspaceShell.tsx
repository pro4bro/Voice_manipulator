import { useVoiceGeneratorCatalog } from "../modules/voice-generator/useVoiceGeneratorCatalog";
import { SubtitleTimingProvider } from "../modules/script/SubtitleTimingPreview";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { api } from "../api/client";
import { ScriptEditHistory, type ScriptEditSnapshot } from "../modules/script/script-edit-history";
import { assignProfileToWords } from "../modules/script/script-table";
import { loadResumeSource, saveResumeSource } from "../domain/workspace-resume";
import { editableWordTimings } from "../domain/editable-word-timing";
import { ObsPluginPreferences } from "./ObsPluginPreferences";
import { DEFAULT_EMOTION_STYLE } from "../domain/emotion-style";
import { EMOTION_OPTIONS } from "../domain/emotions";
import { EMPTY_SELECTION, type WordSelection } from "../domain/word-selection";
import { mediaPatchSpan } from "../domain/patch-selection";
import { coverageFor } from "../domain/reading-plan";
import { useReadingSession } from "./useReadingSession";
import { useVoiceScriptDocument } from "./useVoiceScriptDocument";
import { useVoiceVersions } from "./useVoiceVersions";
import { useVoiceEdits } from "./useVoiceEdits";
import { useVoiceRender } from "./useVoiceRender";
import { effectiveScriptSettings, groupLegacyScript, migrateScript } from "../domain/voice-script-document";
import { captureReferenceTargets, referenceSelection, referenceInheritedSettings, type ReferenceBinding, type ReferenceBindingDocument, type ProductionNavigation, type ReferenceContextRequest, type ReferenceSession } from "../domain/reference-bindings";
import { ReferenceAssignmentEditor } from "../modules/library-panel/ReferenceAssignmentEditor";
import type {
  AppPreferences,
  EmotionLabel,
  EngineProfileSchema,
  EngineStatus,
  MediaImportChoice,
  ProjectMediaImportResult,
  ModuleId,
  PendingLocalMedia,
  MediaTranscriptionProgress,
  Project,
  DatasetReadiness,
  ProjectMediaAsset,
  TrainingProgressLine,
  TrainingRuntimeReport,
  TrainingModelOption,
  ProjectAsrAdapter,
  EnvironmentNoiseProfile,
  ActivityEvent,
  ActivityTask,
  ProjectVoice,
  SpeakerProfile,
  VoiceOutput,
  VoiceOutputExportMode,
  VoiceScriptJob,
  VoiceScriptRow,
  VoiceChangerPreflight,
  VoiceChangerRecording,
  VoiceChangerSettings,
  VoiceChangerStatus,
  TrainingParameterValue,
  TrainingRun,
  ReadingPackSummary,
  RecordingWaveformPreview,
  RuntimeAction,
  RuntimeWorkloadState,
  StudioWord,
  ThemeMode,
  SystemMetrics,
  TimelineEditRange,
  TimelineGainKeyframe,
  TrainingCatalog,
  WorkspacePage,
} from "../domain/types";
import type { StudioContext } from "../modules/registry/ModuleRegistry";
import { PreviewMixerProvider } from "../modules/timeline/preview-mixer";
import { ProgressiveModule } from "./ProgressiveModule";
import type { MediaBatchAction, PendingMediaImportRow } from "../modules/media-pool/MediaPool";
import { useObsLiveLinkTranscript } from "../modules/obs-capture/obs-transcript-feed";
import type { ObsOverlapSelection, ObsTimelineSeekRequest } from "../modules/obs-capture/obs-overlap";
import { categoryOf, parameterOverrides, parameterValue, selectedTrainingModel } from "../modules/train/trainingModels";
import { generatorForEngine } from "../modules/voice-generator/VoiceGenerator";
import { resolveRowVoice, rowsFromOutput, scriptReadiness, voiceCategory as categoryForVoice, voicesInCategory, type VoiceCategory } from "../domain/voiceScript";
import { isLive, newestBatch } from "../domain/trainingBatch";
import { WorkspaceStatusBar } from "../modules/workspace-status/WorkspaceStatusBar";
import type { CapturedAudio, RecordingSlotState } from "../modules/recorder/Recorder";
import type { PendingObsRecordingSlot } from "../modules/recorder/ObsCaptureController";
import type { PendingVoiceOutput } from "../modules/voice-output/VoiceOutputPanel";
import type { ActiveTake } from "../modules/timeline/Timeline";
import { workspaceManifest } from "../pages/workspaceManifest";
import { mergeEvents } from "../domain/activity";
import { Icon, type IconName } from "../ui/Icon";
import { RuntimeMenuItems } from "./RuntimeMenuItems";
import { ModuleErrorBoundary } from "./ModuleErrorBoundary";
import { reconcileScriptTextEdit } from "../modules/script/script-text-reconciliation";
import { useProcessingChoice } from "../ui/ProcessingChoice";
import { completedGenerationRows, completedTrainingTargets } from "../domain/processing-results";
import { ManipulatorNavigation } from "../modules/manipulator/ManipulatorNavigation";
import { LipSyncPage } from "../modules/lip-sync/LipSyncPage";
import type { LipSyncSendRequest } from "../domain/lipsync";
import type { SendTarget } from "../ui/SendToMenu";
import type { ManipulatorMode } from "../domain/types";

interface WorkspaceShellProps {
  project: Project;
  engine: EngineStatus | null;
  onBack: () => void;
  onPageChange: (page: WorkspacePage) => Promise<Project>;
  runtime: RuntimeWorkloadState | null;
  onRuntimeAction: (action: RuntimeAction) => Promise<void>;
  theme: ThemeMode;
  onToggleTheme: () => void;
}
const pages: Array<{ id: WorkspacePage; label: string; short: string; icon: IconName }> = [
  { id: "dashboard", label: "Dashboard", short: "DASH", icon: "grid" },
  { id: "speech-to-text", label: "Input", short: "INPUT", icon: "mic" },
  { id: "voice-training", label: "Voice Training", short: "TRAIN", icon: "training" },
  { id: "voice-manipulator", label: "Voice Manipulator", short: "VOICE", icon: "wrench" },
  { id: "voice-changer", label: "Voice Changer", short: "LIVE", icon: "waveform" },
  { id: "lip-sync", label: "LipSync", short: "VIDEO", icon: "project" },
];

const CHANGER_SETTINGS_KEY = "pro4bro:voice-changer:settings";

// Pages that open straight onto their modules. The heading row repeated the
// page name the top navigation already shows, and the Manipulator's mode tabs
// switched nothing (Voice Patch sits in the right column; the rest are planned).
const COMPACT_PAGES = new Set<WorkspacePage>(["dashboard", "speech-to-text", "voice-training", "voice-manipulator", "voice-changer", "lip-sync"]);

function emptyTrainingCatalog(): TrainingCatalog {
  return {
    speakers: [],
    environmentProfiles: [],
    settings: {
      targetSpeakerIds: [],
      maxSteps: 10000,
      checkpointEvery: 1000,
      batchSize: 4,
      learningRate: 0.00002,
      denoiseBeforeTraining: true,
      learnEnvironmentNoise: false,
      environmentProfileId: null,
      modelId: null,
      modelParameters: {},
    },
    updatedAt: new Date().toISOString(),
  };
}
function defaultPreferences(): AppPreferences {
  return {
    aiReview: { enabled: false, baseUrl: "", model: "", apiKey: null, apiKeyConfigured: false },
    diarization: { enabled: true, model: "pyannote/speaker-diarization-community-1", huggingfaceToken: null, huggingfaceTokenConfigured: false },
    speakerSimilarity: { embedderId: "pyannote-community-1" },
    emotionStyle: { ...DEFAULT_EMOTION_STYLE, emotionColors: { ...DEFAULT_EMOTION_STYLE.emotionColors } },
    timeline: { clippingHighlightAutoHide: false, scrubPreviewPosition: "center" },
  };
}

function isBackgroundTranscribing(asset: ProjectMediaAsset) {
  return ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus);
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return <SubtitleTimingProvider key={props.project.id}><PreviewMixerProvider><WorkspaceSession {...props} /></PreviewMixerProvider></SubtitleTimingProvider>;
}

function WorkspaceSession({ project, engine, onBack, onPageChange, runtime, onRuntimeAction, theme, onToggleTheme }: WorkspaceShellProps) {
  const processingChoice = useProcessingChoice();
  const [captureSource, setCaptureSource] = useState<StudioContext["captureSource"]>("microphone");
  const obsCaptureEnabled = captureSource === "obs-livelink";
  const [activePage, setActivePage] = useState<WorkspacePage>(project.lastPage);
  const [manipulatorMode, setManipulatorMode] = useState<ManipulatorMode>("voice-over");
  const [speechToTextHost, setSpeechToTextHost] = useState<HTMLDivElement | null>(null);
  const [voiceScriptSettingsHost, setVoiceScriptSettingsHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Selecting OBS capture owns its target lease; merely viewing an archive
    // or recording a microphone must not start a background OBS session.
    if (!obsCaptureEnabled || typeof api.claimObsLiveLinkTarget !== "function") return;
    const ownerId = crypto.randomUUID();
    let active = true;
    const renew = () => {
      if (active) void api.claimObsLiveLinkTarget(project.id, ownerId).catch(() => {});
    };
    renew();
    const timer = window.setInterval(renew, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      void api.releaseObsLiveLinkTarget(ownerId).catch(() => {});
    };
  }, [project.id, obsCaptureEnabled]);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(340);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [speed, setSpeed] = useState(1);
  const [gain, setGain] = useState(0);
  // What each page has open. Speech to Text works on footage, Voice
  // Manipulator on what it generated, Voice Changer on its recordings; one
  // shared take showed a generated output in the Speech to Text Script and a
  // footage waveform on the Manipulator timeline.
  const [take, setTake] = useState<ActiveTake | null>(null);
  const [outputTake, setOutputTake] = useState<ActiveTake | null>(null);
  const [recordingTake, setRecordingTake] = useState<ActiveTake | null>(null);
  const [mediaAssets, setMediaAssets] = useState<ProjectMediaAsset[]>([]);
  const mediaAssetsRef = useRef<ProjectMediaAsset[]>([]);
  const wordWriteQueues = useRef(new Map<string, Promise<void>>());
  const wordWriteVersions = useRef(new Map<string, number>());
  const wordWriteErrors = useRef(new Map<string, string>());
  const alignmentPreparedVersions = useRef(new Map<string, number>());
  const timelineWriteQueues = useRef(new Map<string, Promise<boolean>>());
  const timelineWriteVersions = useRef(new Map<string, number>());
  // Full-list requests started before a permanent delete must not reinsert it.
  const permanentlyRemovedMediaIds = useRef(new Set<string>());
  // A background list read can finish after a local recycle/restore response.
  // Keep those lifecycle writes authoritative over reads that began earlier.
  const mediaLifecycleRevision = useRef(0);
  const mediaLifecycleWrites = useRef(new Map<string, { revision: number; deletedAt: string | null }>());
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedScriptAssetIds, setSelectedScriptAssetIds] = useState<string[] | null>(null);
  const mediaOpenRevision = useRef(0);
  const scriptEditHistory = useRef(new ScriptEditHistory());
  const scriptSpeakerAssignments = useRef<Array<{ assetId: string; indexes: number[]; profileId: string | null }>>([]);
  const mediaSelectionWrites = useRef(new Map<string, { version: number; selected: boolean | undefined; pending: boolean }>());
  const mediaSelectionRequests = useRef(new Map<string, Promise<ProjectMediaAsset | null>>());
  const [selectedImportedTrackId, setSelectedImportedTrackId] = useState<string | null>(null);
  const scriptAssetId = selectedImportedTrackId ?? selectedAssetId;
  // Owned here rather than in either module, so Script and Timeline agree on
  // what is selected instead of each keeping a private answer.
  const [wordSelection, setWordSelection] = useState<WordSelection>(EMPTY_SELECTION);
  const [patchSourceSelection, setPatchSourceSelection] = useState<WordSelection | null>(null);
  const selectedAssetIdRef = useRef<string | null>(null);
  const scriptAssetIdRef = useRef<string | null>(null);
  const scriptDirtyRef = useRef(false);
  const liveTranscriptActiveRef = useRef(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [outputsLoaded, setOutputsLoaded] = useState(false);
  const resumeRestored = useRef(false);
  const resumeOpenRevision = useRef(0);
  const [pendingLocalMedia, setPendingLocalMedia] = useState<PendingLocalMedia | null>(null);
  const [pendingNativeMediaPaths, setPendingNativeMediaPaths] = useState<string[]>([]);
  const [pendingMediaImports, setPendingMediaImports] = useState<PendingMediaImportRow[]>([]);
  const [pendingObsRecording, setPendingObsRecording] = useState<PendingObsRecordingSlot | null>(null);
  const capturedMediaFailures = useRef(new Map<string, CapturedAudio>());
  const activeMediaProjectId = useRef(project.id);
  const mediaImportQueue = useRef<Promise<void>>(Promise.resolve());
  const failedMediaImports = useRef(new Map<string, {
    name: string;
    run: (taskId: string) => Promise<ProjectMediaImportResult>;
    transcribe: boolean;
    cacheLocal: boolean;
  }>());
  useEffect(() => {
    activeMediaProjectId.current = project.id;
    setPendingNativeMediaPaths([]);
    setPendingMediaImports([]);
    setPendingObsRecording(null);
    capturedMediaFailures.current.clear();
  }, [project.id]);
  const pendingObsImportIds = pendingMediaImports.filter((row) => row.obsSessionId && row.status !== "error")
    .map((row) => row.obsSessionId!).sort().join("\0");
  useEffect(() => {
    if (!pendingObsImportIds) return;
    const ids = new Set(pendingObsImportIds.split("\0"));
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const sessions = (await api.listObsSessions(project.id)).filter((item) => ids.has(item.id));
        if (!active) return;
        const ready = sessions.filter((item) => item.status === "ready" && item.recordingAssetId);
        const assets = ready.length ? await listProjectMediaWithLifecycleFence(project.id) : null;
        if (!active) return;
        const completed = new Set(ready.filter((item) => assets?.some((asset) => asset.id === item.recordingAssetId)).map((item) => item.id));
        if (assets && completed.size) setMediaAssets(assets);
        setPendingMediaImports((current) => current.filter((row) => !row.obsSessionId || !completed.has(row.obsSessionId))
          .map((row) => {
            const failed = sessions.find((item) => item.id === row.obsSessionId && item.status === "error");
            return failed ? { ...row, status: "error", detail: failed.error || "Không nhập được bản ghi OBS." } : row;
          }));
      } catch { /* A reconnect keeps the slot pending; no artifact is invented. */ }
      finally { refreshing = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [project.id, pendingObsImportIds]);
  const [recordingPreview, setRecordingPreview] = useState<RecordingWaveformPreview | null>(null);
  const [obsTimelineActive, setObsTimelineActive] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [obsTimelineRecordingId, setObsTimelineRecordingId] = useState<string | null>(null);
  const [obsPlayheadSeconds, setObsPlayheadSeconds] = useState(0);
  const [obsSeekRequest, setObsSeekRequest] = useState<ObsTimelineSeekRequest | null>(null);
  const [obsOverlapSelection, setObsOverlapSelection] = useState<ObsOverlapSelection | null>(null);
  useEffect(() => setObsOverlapSelection(null), [project.id, obsTimelineRecordingId]);
  const { rows: obsTranscriptRows, error: obsTranscriptError } = useObsLiveLinkTranscript(
    project.id, obsTimelineRecordingId, obsTimelineActive && activePage === "speech-to-text");
  const [liveTranscriptActive, setLiveTranscriptActive] = useState(false);
  const [aiReviewBusy, setAiReviewBusy] = useState(false);
  const [trainingCatalog, setTrainingCatalog] = useState<TrainingCatalog>(emptyTrainingCatalog);
  const [profileSchema, setProfileSchema] = useState<EngineProfileSchema | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [datasetReadiness, setDatasetReadiness] = useState<DatasetReadiness | null>(null);
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [trainingRuns, setTrainingRuns] = useState<TrainingRun[]>([]);
  const [trainingProgressByRun, setTrainingProgressByRun] = useState<Record<string, TrainingProgressLine[]>>({});
  const [trainingRuntime, setTrainingRuntime] = useState<TrainingRuntimeReport | null>(null);
  const [trainingModels, setTrainingModels] = useState<TrainingModelOption[]>([]);
  const [voiceGenerators, setVoiceGenerators] = useState<TrainingModelOption[]>([]);
  const [sttEngines, setSttEngines] = useState<TrainingModelOption[]>([]);
  const [asrAdapters, setAsrAdapters] = useState<ProjectAsrAdapter[]>([]);
  const [projectVoices, setProjectVoices] = useState<ProjectVoice[]>([]);
  const [generationCategoryOverride, setGenerationCategoryOverride] = useState<VoiceCategory | null>(null);
  const [generationEngine, setGenerationEngine] = useState<string | null>(null);
  const generationCategoryChoiceMade = useRef(false);
  const generationCategoryInitializedProject = useRef<string | null>(null);
  const generationCategoryProject = useRef(project.id);
  useEffect(() => {
    if (generationCategoryProject.current === project.id) return;
    generationCategoryProject.current = project.id;
    generationCategoryInitializedProject.current = null;
    generationCategoryChoiceMade.current = false;
    setGenerationCategoryOverride(null);
    setGenerationEngine(null);
  }, [project.id]);
  const [voiceOutputs, setVoiceOutputs] = useState<VoiceOutput[]>([]);
  const [generatorParameters, setGeneratorParameters] = useState<Record<string, Record<string, TrainingParameterValue>>>({});
  const [generating, setGenerating] = useState(false);
  const voiceScript = useVoiceScriptDocument(project.id);
  const voiceEdits = useVoiceEdits(project.id, outputTake?.id, voiceScript.document.revision);
  const voiceRender = useVoiceRender(project.id, outputTake?.id, voiceScript.document.revision, voiceEdits.packet?.document.revision ?? 0);
  const editedOutput = voiceRender.packet && voiceRender.packet.output.id === outputTake?.id ? voiceRender.packet.output : voiceEdits.packet && voiceEdits.packet.document.outputId === outputTake?.id ? voiceEdits.packet.output : null;
  const pageTake = activePageTake();
  const voiceScriptRows = voiceScript.document.rows;
  const setVoiceScriptRows = voiceScript.setRows;
  const [referenceDocument, setReferenceDocument] = useState<ReferenceBindingDocument | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [productionNavigation, setProductionNavigation] = useState<ProductionNavigation | null>(null);
  const referenceRead = useRef(0);
  async function reloadReferences() {
    const serial = ++referenceRead.current;
    try { const saved = await api.getReferenceBindings(project.id); if (serial === referenceRead.current) { setReferenceDocument(saved); setReferenceError(null); } }
    catch (reason) { if (serial === referenceRead.current) setReferenceError(String(reason)); }
  }
  useEffect(() => {
    if (activePage === "voice-manipulator" && typeof api.getReferenceBindings === "function") void reloadReferences();
    return () => { referenceRead.current++; };
  }, [project.id, activePage, voiceScript.document.revision, mediaAssets, voiceOutputs]);
  const [referenceSession, setReferenceSession] = useState<ReferenceSession | null>(null);
  const referenceRequestId = useRef<string | null>(null);
  useEffect(() => {
    if (activePage !== "voice-manipulator") { referenceRequestId.current = null; setReferenceSession(null); setProductionNavigation(null); }
  }, [activePage]);
  const [voiceScriptJob, setVoiceScriptJob] = useState<VoiceScriptJob | null>(null);
  const voiceScriptJobRef = useRef<VoiceScriptJob | null>(null);
  const [pendingVoiceOutput, setPendingVoiceOutput] = useState<PendingVoiceOutput | null>(null);
  const generationStartInFlight = useRef(false);
  const completedVersionJobs = useRef(new Set<string>());
  const [voiceChangers, setVoiceChangers] = useState<TrainingModelOption[]>([]);
  const [changerPreflight, setChangerPreflight] = useState<VoiceChangerPreflight | null>(null);
  const [changerStatus, setChangerStatus] = useState<VoiceChangerStatus | null>(null);
  const [changerBusy, setChangerBusy] = useState(false);
  const [changerRecordings, setChangerRecordings] = useState<VoiceChangerRecording[]>([]);
  const [changerSettings, setChangerSettings] = useState<VoiceChangerSettings>(() => {
    const fallback: VoiceChangerSettings = { engineId: null, voiceId: null, inputDevice: null, virtualDevice: null, speakerDevice: null, monitor: false, parameters: {} };
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(CHANGER_SETTINGS_KEY) ?? "{}"), monitor: false };
    } catch {
      return fallback;
    }
  });
  const [readingPacks, setReadingPacks] = useState<ReadingPackSummary[]>([]);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [windowsMenuOpen, setWindowsMenuOpen] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const catalogRevisionRef = useRef(0);
  const catalogWrites = useRef<Promise<unknown>>(Promise.resolve());
  const catalogSaveTimer = useRef<number | null>(null);
  const currentCatalog = useRef(trainingCatalog);
  currentCatalog.current = trainingCatalog;
  const [notice, setNotice] = useState<string | null>(null);
  const reading = useReadingSession(project.id, setNotice);
  const readingSession = reading.session;
  const readingBusy = reading.busy;
  const [job, setJob] = useState<string | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  // What the whole app is doing, and its log: one stream from the API.
  const [activityTasks, setActivityTasks] = useState<ActivityTask[]>([]);
  const [queueTasks, setQueueTasks] = useState<ActivityTask[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const activitySeq = useRef(0);
  const [scriptDirty, setScriptDirty] = useState(false);
  const scriptRef = useRef("");
  const scriptDraftBases = useRef(new Map<string, { text: string; words: StudioWord[] }>());
  const scratchStorageKey = `pro4bro:${project.id}:scratch-script`;
  const [script, setScript] = useState("");
  const manifest = workspaceManifest(activePage);

  function withoutPermanentlyRemoved(assets: ProjectMediaAsset[]) {
    return assets.filter((asset) => !permanentlyRemovedMediaIds.current.has(asset.id));
  }

  async function listProjectMediaWithLifecycleFence(projectId: string) {
    const requestRevision = mediaLifecycleRevision.current;
    const selectionVersions = new Map([...mediaSelectionWrites.current].map(([key, write]) => [key, write.version]));
    const assets = withoutPermanentlyRemoved(await api.listProjectMedia(projectId));
    return assets.map((asset) => {
      for (const field of ["importSelected", "transcriptionSelected", "diarizationSelected", "trainingSelected"] as const) {
        const key = `${asset.id}:${field}`, write = mediaSelectionWrites.current.get(key);
        if (write && (write.pending || write.version > (selectionVersions.get(key) ?? 0))) asset = { ...asset, [field]: write.selected };
      }
      const write = mediaLifecycleWrites.current.get(asset.id);
      if (!write) return asset;
      if (write.revision > requestRevision) return { ...asset, deletedAt: write.deletedAt };
      // Keep the revision after acknowledgement: an older request can finish
      // after this fresh one and still needs the lifecycle fence.
      return asset;
    });
  }

  function rememberMediaLifecycle(assetId: string, deletedAt: string | null) {
    const revision = ++mediaLifecycleRevision.current;
    for (const relatedId of relatedMediaIds(assetId)) {
      mediaLifecycleWrites.current.set(relatedId, { revision, deletedAt });
    }
    if (!mediaLifecycleWrites.current.has(assetId)) mediaLifecycleWrites.current.set(assetId, { revision, deletedAt });
  }

  function relatedMediaIds(assetId: string) {
    return mediaAssetsRef.current.filter((asset) => asset.id === assetId || asset.sourceArchiveAssetId === assetId).map((asset) => asset.id);
  }

  useEffect(() => {
    permanentlyRemovedMediaIds.current.clear();
    mediaLifecycleRevision.current = 0;
    mediaLifecycleWrites.current.clear();
    mediaSelectionWrites.current.clear();
    resumeOpenRevision.current = ++mediaOpenRevision.current;
    scriptEditHistory.current = new ScriptEditHistory();
  }, [project.id]);

  async function runRuntimeAction(action: RuntimeAction) {
    setWindowsMenuOpen(false);
    setNotice(action === "restart" ? "Đang restart toàn bộ API, STT và background workers…" : action === "stop" ? "Đang tắt toàn bộ workload…" : "Đang bật toàn bộ workload…");
    try {
      await onRuntimeAction(action);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Không điều khiển được runtime");
    }
  }

  scriptRef.current = script;
  mediaAssetsRef.current = mediaAssets;
  // Background polling reads these through refs, never through its dependency
  // array. As dependencies they tore the effect down on the first keystroke -
  // scriptDirty flips false to true - which cancelled the in-flight request
  // carrying the finished transcript. That is the "STT ran but Script stayed
  // empty" report: the work was done, the response was thrown away.
  selectedAssetIdRef.current = selectedAssetId;
  scriptAssetIdRef.current = scriptAssetId;
  scriptDirtyRef.current = scriptDirty;
  liveTranscriptActiveRef.current = liveTranscriptActive;

  useEffect(() => {
    if (!selectedAssetId && script) localStorage.setItem(scratchStorageKey, script);
  }, [script, scratchStorageKey, selectedAssetId]);

  useEffect(() => {
    // Devices belong to the machine, so the choice is remembered across projects;
    // monitoring is never remembered on, it has to be asked for each time.
    try { localStorage.setItem(CHANGER_SETTINGS_KEY, JSON.stringify({ ...changerSettings, monitor: false })); } catch { /* kept in memory */ }
  }, [changerSettings]);

  const changerPageOpen = activePage === "voice-changer";
  const changerRunning = changerStatus?.state === "running";
  useEffect(() => {
    if (!changerPageOpen) return;
    void refreshChanger();
    if (typeof api.listChangerRecordings === "function") api.listChangerRecordings(project.id).then(setChangerRecordings).catch(() => setChangerRecordings([]));
  }, [changerPageOpen, project.id]);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const read = () => {
      if (inFlight || typeof api.getActivity !== "function") return;
      inFlight = true;
      void api.getActivity(activitySeq.current)
        .then((snapshot) => {
          if (cancelled) return;
          activitySeq.current = snapshot.seq;
          setActivityTasks(snapshot.tasks);
          if (snapshot.events.length) setActivityEvents((held) => mergeEvents(held, snapshot.events));
        })
        .catch(() => undefined)
        .finally(() => { inFlight = false; });
    };
    read();
    const timer = window.setInterval(read, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false, inFlight = false;
    setQueueTasks([]);
    const read = async () => {
      if (inFlight || typeof api.getProjectQueue !== "function") return;
      inFlight = true;
      try {
        const snapshot = await api.getProjectQueue(project.id);
        if (!cancelled) setQueueTasks(snapshot.tasks);
      } catch { /* Retain last known progress while the runtime reconnects. */ }
      finally { inFlight = false; }
    };
    void read();
    const timer = window.setInterval(() => void read(), 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [project.id]);

  useEffect(() => {
    if (!changerPageOpen && !changerRunning) return;
    let cancelled = false;
    let inFlight = false;
    // Meters and spectra while running; a slow check otherwise, so a session
    // started elsewhere still shows up.
    const timer = window.setInterval(() => {
      if (inFlight || typeof api.getVoiceChangerStatus !== "function") return;
      inFlight = true;
      void api.getVoiceChangerStatus().then((next) => { if (!cancelled) setChangerStatus(next); }).catch(() => undefined).finally(() => { inFlight = false; });
    }, changerRunning ? 110 : 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [changerPageOpen, changerRunning]);

  useVoiceGeneratorCatalog(project.id, loadAttempt, setVoiceGenerators, setNotice);

  const voiceScriptRunning = voiceScriptJob?.status === "running";
  useEffect(() => {
    if (!voiceScriptRunning || !voiceScriptJob) return;
    const jobId = voiceScriptJob.id;
    let cancelled = false;
    // Rows are read one by one in the background; the Script shows which row is
    // being read and the panel how many are done.
    const timer = window.setInterval(() => {
      void api.getVoiceScriptJob(project.id, jobId).then((job) => {
        if (cancelled) return;
        acceptVoiceScriptJob(job);
      }).catch(() => undefined);
    }, 800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [project.id, voiceScriptRunning, voiceScriptJob?.id]);

  // Selections are word positions, so they mean nothing once another asset's
  // words are loaded - carrying them over would highlight unrelated words.
  useEffect(() => {
    setWordSelection(EMPTY_SELECTION);
  }, [selectedAssetId]);

  useEffect(() => {
    let cancelled = false;
    setMediaBusy(true);
    void listProjectMediaWithLifecycleFence(project.id).then((assets) => {
      if (!cancelled) setMediaAssets(assets);
    }).catch((error: unknown) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : "Không đọc được Media Pool");
    }).finally(() => { if (!cancelled) { setMediaBusy(false); setMediaLoaded(true); } });
    void api.getTrainingCatalog(project.id).then((catalog) => {
      if (cancelled) return;
      setTrainingCatalog(catalog);
      if (catalog.speakers[0]) setSelectedVoice((current) => current || catalog.speakers[0].id);
    }).catch((error: unknown) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : "Không đọc được dữ liệu workspace");
    });
    void api.getOmniVoiceProfileSchema().then((schema) => { if (!cancelled) setProfileSchema(schema); })
      .catch(() => { if (!cancelled) setProfileSchema(null); });
    void api.getPreferences().then((saved) => { if (!cancelled) setPreferences(saved); })
      .catch((error) => { if (!cancelled) setNotice(error instanceof Error ? error.message : "Không đọc được Preferences"); });

    api.listReadingPacks()
      .then((packs) => { if (!cancelled) setReadingPacks(packs); })
      .catch(() => { /* HQ mode simply offers nothing to read. */ });

    api.getDatasetReadiness(project.id)
      .then((readiness) => { if (!cancelled) setDatasetReadiness(readiness); })
      .catch(() => { /* Training Job shows that it could not read it. */ });

    // Older embedded API mocks may not expose the optional runtime probe yet.
    if (typeof api.getTrainingRuntime === "function") {
      api.getTrainingRuntime()
        .then((report) => { if (!cancelled) setTrainingRuntime(report); })
        .catch(() => { if (!cancelled) setTrainingRuntime(null); });
    }
    if (typeof api.getTrainingModels === "function") {
      api.getTrainingModels()
        .then((options) => { if (!cancelled) setTrainingModels(options); })
        .catch(() => { if (!cancelled) setTrainingModels([]); });
    }
    if (typeof api.getSttEngines === "function") {
      api.getSttEngines()
        .then((options) => { if (!cancelled) setSttEngines(options); })
        .catch(() => { if (!cancelled) setSttEngines([]); });
    }
    void refreshProjectVoices();
    if (typeof api.listVoiceOutputs === "function") {
      api.listVoiceOutputs(project.id)
        .then((outputs) => { if (!cancelled) setVoiceOutputs(outputs); })
        .catch(() => { if (!cancelled) setVoiceOutputs([]); })
        .finally(() => { if (!cancelled) setOutputsLoaded(true); });
    }

    if (typeof api.listVoiceOutputs !== "function") setOutputsLoaded(true);
    void refreshTrainingRun();
    return () => { cancelled = true; };
  }, [project.id, loadAttempt]);

  useEffect(() => {
    if (resumeRestored.current || !mediaLoaded || !outputsLoaded) return;
    resumeRestored.current = true;
    // An explicit user open always wins over the asynchronous initial load.
    if (mediaOpenRevision.current !== resumeOpenRevision.current) return;
    const source = loadResumeSource(project.id);
    if (!source) return;
    if (source.kind === "asset") {
      const available = withoutPermanentlyRemoved(mediaAssets).filter((asset) => !asset.deletedAt);
      const asset = available.find((item) => item.id === source.id);
      if (!asset || !isImportedForWork(asset, available)) return;
      if (source.parentId) {
        if (asset.sourceArchiveAssetId !== source.parentId || !available.some((item) => item.id === source.parentId)) return;
        selectImportedTrack(asset.id);
      } else applyMediaAsset(asset, available);
    } else if (source.kind === "output") {
      const output = voiceOutputs.find((item) => item.id === source.id);
      if (output) openVoiceOutput(output, false);
    } else {
      // Only restore a recording that still belongs to this project's archive.
      const revision = mediaOpenRevision.current;
      let cancelled = false;
      if (typeof api.listObsLiveLinkRecordings === "function") {
        void api.listObsLiveLinkRecordings(project.id).then((entries) => {
          if (!cancelled && mediaOpenRevision.current === revision && entries.some((entry) => !entry.deletedAt && entry.recording.recordingId === source.id)) openObsRecording(source.id);
        }).catch(() => { /* A missing archive leaves the workspace empty. */ });
      }
      return () => { cancelled = true; };
    }
  }, [project.id, mediaLoaded, outputsLoaded]);

  const trainingBatch = useMemo(() => newestBatch(trainingRuns), [trainingRuns]);
  const trainingLive = trainingBatch.some(isLive);
  useEffect(() => {
    // A batch that just finished has published its voices.
    if (!trainingLive) void refreshProjectVoices();
  }, [project.id, trainingLive]);
  useEffect(() => {
    if (!trainingLive) return;
    // A run lasts hours and reports through its journal; without polling the
    // flow, log and progress bar would show the moment the run started, forever.
    const timer = window.setInterval(() => void refreshTrainingRun(), 2000);
    return () => window.clearInterval(timer);
  }, [project.id, trainingLive]);

  const hasBackgroundTranscription = mediaAssets.some(isBackgroundTranscribing);
  const hasBackgroundDiarization = mediaAssets.some((asset) => ["queued", "processing"].includes(asset.diarizationStatus ?? "idle"));
  const followedMkvIds = mediaAssets.filter((asset) => asset.growingMkvFollow && !asset.deletedAt
    && !asset.sourcePath.endsWith("source-final.mkv")).map((asset) => asset.id).join(",");

  useEffect(() => {
    if (!followedMkvIds) return;
    let cancelled = false;
    let inFlight = false;
    const refresh = () => {
      if (inFlight) return;
      inFlight = true;
      void Promise.all(followedMkvIds.split(",").map((id) => api.getGrowingMkvAssets(project.id, id)))
        .then((groups) => {
          if (cancelled) return;
          const refreshed = groups.flat();
          const byId = new Map(refreshed.map((asset) => [asset.id, asset]));
          setMediaAssets((current) => {
            const changed = current.some((asset) => {
              const updated = byId.get(asset.id);
              return updated && updated.updatedAt !== asset.updatedAt;
            });
            return changed ? current.map((asset) => byId.get(asset.id) ?? asset) : current;
          });
          const selected = byId.get(scriptAssetIdRef.current ?? "");
          const previous = mediaAssetsRef.current.find((asset) => asset.id === selected?.id);
          if (selected && selected.updatedAt !== previous?.updatedAt
            && !scriptDirtyRef.current && !liveTranscriptActiveRef.current) {
            setScript(selected.text);
            setTake(selected.url ? { id: selected.studioItemId ?? selected.id, name: selected.name, url: selected.url, duration: selected.duration, text: selected.text, words: selected.words, wordTimingQuality: selected.wordTimingQuality, wordTimingNote: selected.wordTimingNote } : null);
          }
        }).catch(() => undefined).finally(() => { inFlight = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [project.id, followedMkvIds]);

  useEffect(() => {
    if (!hasBackgroundTranscription) return;
    let cancelled = false;
    let fullMediaRefreshInFlight = false;

    const refreshFullMedia = () => {
      if (fullMediaRefreshInFlight) return;
      fullMediaRefreshInFlight = true;
      void listProjectMediaWithLifecycleFence(project.id).then((response) => {
        if (cancelled) return;
        const assets = response;
        const currentAssets = mediaAssetsRef.current;
        const activeAssetId = scriptAssetIdRef.current;
        const currentSelected = currentAssets.find((asset) => asset.id === activeAssetId);
        const selected = assets.find((asset) => asset.id === activeAssetId);
        const selectedChanged = Boolean(selected && (!currentSelected || selected.updatedAt !== currentSelected.updatedAt));
        setMediaAssets((current) => {
          const unchanged = current.length === assets.length && current.every((asset, index) => asset.id === assets[index]?.id && asset.updatedAt === assets[index]?.updatedAt);
          return unchanged ? current : assets;
        });
        // A deliberate rerun of STT is authoritative: it must replace an older dirty Script.
        // Other background refreshes keep the user's unsaved typing intact.
        const transcriptionJustCompleted = currentSelected?.transcriptionStatus !== "complete" && selected?.transcriptionStatus === "complete";
        if (selected && selectedChanged && (!scriptDirtyRef.current || transcriptionJustCompleted) && !liveTranscriptActiveRef.current) {
          setTake(selected.url ? { id: selected.studioItemId ?? selected.id, name: selected.name, url: selected.url, duration: selected.duration, text: selected.text, words: selected.words, wordTimingQuality: selected.wordTimingQuality, wordTimingNote: selected.wordTimingNote } : null);
          setScript(selected.text);
          if (transcriptionJustCompleted) setScriptDirty(false);
        }
      }).catch(() => undefined).finally(() => { fullMediaRefreshInFlight = false; });
    };

    const refreshStatus = () => {
      void api.listProjectMediaTranscriptionStatus(project.id).then((snapshots) => {
        if (cancelled) return;
        const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
        const currentAssets = mediaAssetsRef.current;
        const hasTerminalTransition = snapshots.some((snapshot: MediaTranscriptionProgress) => {
          const previous = currentAssets.find((asset) => asset.id === snapshot.id);
          return Boolean(previous && isBackgroundTranscribing(previous) && !["queued", "processing", "reviewing"].includes(snapshot.transcriptionStatus));
        });
        setMediaAssets((current) => current.map((asset) => {
          const snapshot = byId.get(asset.id);
          if (!snapshot) return asset;
          // A terminal snapshot only says the worker stopped; it does not carry
          // the transcript, words, revisions, or the new updatedAt. Keep the
          // asset in its background state until refreshFullMedia has fetched
          // that authoritative payload. Otherwise this state update makes
          // hasBackgroundTranscription false, cleans up this effect, and can
          // cancel the very request that puts the completed STT into Script.
          const terminalTransition = isBackgroundTranscribing(asset)
            && !["queued", "processing", "reviewing"].includes(snapshot.transcriptionStatus);
          if (terminalTransition) return asset;
          const changed = asset.transcriptionStatus !== snapshot.transcriptionStatus
            || asset.transcriptionProgress !== snapshot.transcriptionProgress
            || asset.transcriptionError !== snapshot.transcriptionError;
          return changed ? {
            ...asset,
            transcriptionStatus: snapshot.transcriptionStatus,
            transcriptionProgress: snapshot.transcriptionProgress,
            transcriptionError: snapshot.transcriptionError,
          } : asset;
        }));
        if (hasTerminalTransition) refreshFullMedia();
      }).catch(() => undefined);
    };

    refreshStatus();
    // A progress bar does not need seven updates a second. At 150 ms this issued
    // over 1,200 requests in a two-minute session, each one re-rendering every
    // asset in the workspace.
    const timer = window.setInterval(refreshStatus, 900);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [project.id, hasBackgroundTranscription]);

  useEffect(() => {
    if (!hasBackgroundDiarization) return;
    let cancelled = false;
    let fullMediaRefreshInFlight = false;

    // Diarization rewrites word labels, so its result needs the full asset. Its
    // *progress* does not, and polling the full media list for it shipped every
    // transcript in the project on every tick.
    const refreshFullMedia = () => {
      if (fullMediaRefreshInFlight) return;
      fullMediaRefreshInFlight = true;
      void listProjectMediaWithLifecycleFence(project.id).then((response) => {
        if (cancelled) return;
        const assets = response;
        setMediaAssets((current) => current.length === assets.length && current.every((asset, index) => asset.id === assets[index]?.id && asset.updatedAt === assets[index]?.updatedAt) ? current : assets);
        const selected = assets.find((asset) => asset.id === scriptAssetIdRef.current);
        if (selected && selected.diarizationStatus === "complete" && !scriptDirtyRef.current && !liveTranscriptActiveRef.current) {
          setTake(selected.url ? { id: selected.studioItemId ?? selected.id, name: selected.name, url: selected.url, duration: selected.duration, text: selected.text, words: selected.words, wordTimingQuality: selected.wordTimingQuality, wordTimingNote: selected.wordTimingNote } : null);
        }
      }).catch(() => undefined).finally(() => { fullMediaRefreshInFlight = false; });
    };

    const refreshStatus = () => {
      void api.listProjectMediaDiarizationStatus(project.id).then((snapshots) => {
        if (cancelled) return;
        const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
        const currentAssets = mediaAssetsRef.current;
        const reachedTerminal = snapshots.some((snapshot) => {
          const previous = currentAssets.find((asset) => asset.id === snapshot.id);
          return Boolean(previous
            && ["queued", "processing"].includes(previous.diarizationStatus ?? "idle")
            && !["queued", "processing"].includes(snapshot.diarizationStatus));
        });
        setMediaAssets((current) => current.map((asset) => {
          const snapshot = byId.get(asset.id);
          if (!snapshot) return asset;
          // Same contract as STT: a terminal snapshot only says the worker
          // stopped. Hold the background state until the authoritative words
          // arrive, so cleanup cannot discard the response that carries them.
          if (["queued", "processing"].includes(asset.diarizationStatus ?? "idle")
            && !["queued", "processing"].includes(snapshot.diarizationStatus)) return asset;
          const changed = asset.diarizationStatus !== snapshot.diarizationStatus
            || asset.diarizationProgress !== snapshot.diarizationProgress
            || asset.diarizationError !== snapshot.diarizationError;
          return changed ? {
            ...asset,
            diarizationStatus: snapshot.diarizationStatus,
            diarizationProgress: snapshot.diarizationProgress,
            diarizationError: snapshot.diarizationError,
          } : asset;
        }));
        if (reachedTerminal) refreshFullMedia();
      }).catch(() => undefined);
    };

    refreshStatus();
    const timer = window.setInterval(refreshStatus, 900);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [project.id, hasBackgroundDiarization]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void api.getSystemStatus().then((metrics) => { if (!cancelled) setSystemMetrics(metrics); }).catch(() => undefined);
    };
    refresh();
    // System metrics feed a status bar readout, not a control loop.
    const timer = window.setInterval(refresh, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!catalogRevision) return;
    const revision = catalogRevision;
    const snapshot = trainingCatalog;
    const timer = window.setTimeout(() => {
      if (catalogSaveTimer.current === timer) catalogSaveTimer.current = null;
      const write = catalogWrites.current.catch(() => undefined).then(() => api.saveTrainingCatalog(project.id, snapshot));
      catalogWrites.current = write;
      void write.then((saved) => {
        if (catalogRevisionRef.current === revision) {
          setTrainingCatalog(saved);
          setCatalogRevision(0);
        }
      }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Không lưu được Sound Library"));
    }, 350);
    catalogSaveTimer.current = timer;
    return () => { window.clearTimeout(timer); if (catalogSaveTimer.current === timer) catalogSaveTimer.current = null; };
  }, [catalogRevision, project.id, trainingCatalog]);

  useEffect(() => {
    if (!scriptDirty || !scriptAssetId || liveTranscriptActive) return;
    const pendingAssetId = scriptAssetId;
    const pendingText = script;
    const timer = window.setTimeout(() => {
      saveScriptDraft(pendingAssetId, pendingText);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [project.id, script, scriptDirty, scriptAssetId, liveTranscriptActive]);

  useEffect(() => () => {
    if (take?.url?.startsWith("blob:")) URL.revokeObjectURL(take.url);
  }, [take?.url]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (activePage !== "voice-training") return;
    const selected = mediaAssets.find((asset) => asset.id === (selectedImportedTrackId ?? selectedAssetId));
    const children = selected ? mediaAssets.filter((asset) => asset.sourceArchiveAssetId === selected.id) : [];
    if (selected && !(children.length ? children.some((asset) => asset.trainingSelected) : selected.trainingSelected)) clearMediaSelection();
  }, [activePage, mediaAssets, selectedAssetId, selectedImportedTrackId]);

  const lipSyncNavigation = useRef<(() => Promise<boolean>) | null>(null);
  const [lipSyncIncoming, setLipSyncIncoming] = useState<LipSyncSendRequest | null>(null);
  async function sendMediaTo(target: SendTarget, ids: string[]) {
    const sources = mediaAssets.filter((asset) => ids.includes(asset.id) && !asset.deletedAt && !asset.disabled);
    if (target === "lip-sync") {
      const videos = sources.filter((asset) => asset.mediaKind === "video" && asset.duration > 0);
      if (!videos.length) { setNotice("Chọn footage video để gửi tới LipSync."); return; }
      setLipSyncIncoming({ id: crypto.randomUUID(), projectId: project.id, kind: "media", ids: videos.map((asset) => asset.id) });
      await selectPage(target);
    } else if (target === "voice-training") {
      try {
        const saved: ProjectMediaAsset[] = [];
        const targets = [...new Map(sources.flatMap((asset) => {
          const tracks = mediaAssets.filter((item) => item.sourceArchiveAssetId === asset.id);
          return tracks.length ? tracks : [asset];
        }).filter((asset) => !asset.deletedAt && !asset.disabled && asset.status !== "no-audio" && asset.importSelected !== false).map((asset) => [asset.id, asset])).values()];
        if (!targets.length) { setNotice("Chọn footage có audio để gửi tới Training."); return; }
        for (const asset of targets) saved.push(await api.setMediaTrainingSelected(project.id, asset.id, true));
        setMediaAssets((current) => current.map((asset) => saved.find((item) => item.id === asset.id) ?? asset));
        await selectPage(target);
        setNotice(`Đã chọn ${saved.length} footage cho Training.`);
      } catch (reason) { setNotice(String(reason)); }
    } else {
      const source = sources[0];
      if (!source || sources.length !== 1) { setNotice("Chọn một footage để mở trong Voice Manipulation."); return; }
      selectMediaAsset(source.id);
      await selectPage(target);
      const selection: WordSelection = { indexes: source.words.map((_, index) => index), anchor: source.words.length ? 0 : null,
        scope: { kind: "asset", id: source.id, revision: source.updatedAt } };
      setPatchSourceSelection(mediaPatchSpan(source, selection) ? selection : null);
      setManipulatorMode("voice-patch");
      if (!source.words.length) setNotice("Đã mở footage cho Voice Patch. Chạy STT tại Input để có lời thoại và timing trước khi sửa voice.");
    }
  }
  async function sendOutputTo(target: SendTarget, outputs: VoiceOutput[]) {
    const available = outputs.filter((output) => output.audioAvailable !== false && output.duration > 0);
    if (!available.length) { setNotice("Voice Output không còn audio khả dụng."); return; }
    if (target === "lip-sync") {
      setLipSyncIncoming({ id: crypto.randomUUID(), projectId: project.id, kind: "voice", ids: available.map((output) => output.id) });
      await selectPage(target);
    } else if (target === "voice-manipulator") {
      if (available.length !== 1) { setNotice("Mở từng Voice Output trong Voice Manipulation."); return; }
      openVoiceOutput(available[0]); await selectPage(target);
    }
  }
  async function backToProjects() {
    if (activePage === "lip-sync" && lipSyncNavigation.current && !await lipSyncNavigation.current()) return;
    onBack();
  }
  async function selectPage(page: WorkspacePage) {
    if (activePage === "lip-sync" && page !== activePage && lipSyncNavigation.current && !await lipSyncNavigation.current()) return;
    if (page === "voice-manipulator" && activePage === "speech-to-text") {
      const source = mediaAssets.find((asset) => asset.id === scriptAssetId);
      const scoped = source && (!selectedScriptAssetIds || selectedScriptAssetIds.length <= 1)
        ? { ...wordSelection, scope: { kind: "asset" as const, id: source.id, revision: source.updatedAt } } : null;
      const patchSelection = source && scoped && mediaPatchSpan(source, scoped) ? scoped : null;
      setPatchSourceSelection(patchSelection);
      if (patchSelection) setManipulatorMode("voice-patch");
    }
    if (page === "voice-training") {
      const selected = mediaAssets.find((asset) => asset.id === (selectedImportedTrackId ?? selectedAssetId));
      const children = selected ? mediaAssets.filter((asset) => asset.sourceArchiveAssetId === selected.id) : [];
      if (selected && !(children.length ? children.some((asset) => asset.trainingSelected) : selected.trainingSelected)) clearMediaSelection();
      setSelectedScriptAssetIds(null);
    }
    setActivePage(page);
    // Word indexes point into one take's words; carried to another page they
    // would highlight unrelated words.
    if (page !== activePage) setWordSelection(EMPTY_SELECTION);
    // The Dashboard is a reading of the current footage; a count from before
    // the last STT or assignment would be the one number on it that is wrong.
    // Both pages are read against the dataset; a count from before the last STT
    // or speaker assignment is the one number on them that is wrong.
    if (page === "dashboard" || page === "voice-training") void refreshDatasetReadiness();
    if (page === "voice-manipulator") void refreshProjectVoices();
    try { await onPageChange(page); } catch { setNotice("Không lưu được trang đang mở. Nội dung Script vẫn được giữ cục bộ."); }
  }

  function activePageTake(): ActiveTake | null {
    if (activePage === "voice-manipulator") return editedOutput && outputTake ? { ...outputTake, duration: editedOutput.duration, words: editedOutput.words ?? [], url: voiceRender.packet?.audioUrl ?? voiceEdits.packet?.audioUrl ?? outputTake.url, wordTimingQuality: editedOutput.wordTimingQuality ?? undefined, wordTimingNote: editedOutput.wordTimingNote } : outputTake;
    if (activePage === "voice-changer") return recordingTake;
    return take;
  }

  function beginResize(side: "left" | "right", event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const width = Math.min(540, Math.max(260, startWidth + (side === "left" ? delta : -delta)));
      side === "left" ? setLeftWidth(width) : setRightWidth(width);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.classList.remove("is-resizing");
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  function resizeWithKeyboard(side: "left" | "right", event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 18 : -18;
    if (side === "left") setLeftWidth((width) => Math.min(540, Math.max(260, width + delta)));
    else setRightWidth((width) => Math.min(540, Math.max(260, width - delta)));
  }

  function isImportedForWork(asset: ProjectMediaAsset, available: ProjectMediaAsset[]) {
    if (asset.sourceArchiveAssetId) return asset.importSelected !== false;
    const children = available.filter((item) => item.sourceArchiveAssetId === asset.id);
    return children.length ? children.some((item) => item.importSelected !== false) : asset.importSelected !== false;
  }

  function applyMediaAsset(asset: ProjectMediaAsset, available = mediaAssetsRef.current) {
    saveResumeSource(project.id, { kind: "asset", id: asset.id });
    ++mediaOpenRevision.current;
    setSelectedAssetId(asset.id);
    setSelectedImportedTrackId(null);
    setObsTimelineRecordingId(asset.obsRecordingId ?? null);
    setObsTimelineActive(Boolean(asset.obsRecordingId));
    setScript(asset.text);
    setScriptDirty(false);
    setTake({ id: asset.studioItemId ?? asset.id, name: asset.name, url: asset.url ?? "", duration: asset.duration, text: asset.text, words: asset.words, wordTimingQuality: asset.wordTimingQuality, wordTimingNote: asset.wordTimingNote });
  }

  function selectImportedTrack(assetId: string) {
    ++mediaOpenRevision.current;
    const asset = mediaAssets.find((item) => item.id === assetId && item.sourceArchiveAssetId && item.importSelected !== false);
    if (!asset) return;
    setSelectedScriptAssetIds([assetId]);
    if (asset.id === selectedImportedTrackId) return;
    const parent = mediaAssets.find((item) => item.id === asset.sourceArchiveAssetId);
    if (!parent || !isImportedForWork(parent, mediaAssets)) return;
    flushCurrentMediaDraft();
    saveResumeSource(project.id, { kind: "asset", id: asset.id, parentId: parent.id });
    setSelectedAssetId(parent.id);
    setSelectedImportedTrackId(asset.id);
    setObsTimelineRecordingId(parent.obsRecordingId ?? null);
    setObsTimelineActive(Boolean(parent.obsRecordingId));
    setScript(asset.text);
    setScriptDirty(false);
    setWordSelection(EMPTY_SELECTION);
    setTake(asset.url ? { id: asset.studioItemId ?? asset.id, name: asset.name, url: asset.url, duration: asset.duration, text: asset.text, words: asset.words, wordTimingQuality: asset.wordTimingQuality, wordTimingNote: asset.wordTimingNote } : null);
  }

  function storeMediaAsset(asset: ProjectMediaAsset) {
    setMediaAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
  }

  function flushCurrentMediaDraft() {
    if (!scriptDirty || !scriptAssetId) return;
    saveScriptDraft(scriptAssetId, scriptRef.current);
  }

  function saveScriptDraft(assetId: string, text: string) {
    const base = scriptDraftBases.current.get(assetId);
    if (!base) return;
    const edit = reconcileScriptTextEdit(base.text, text, base.words);
    void changeWordAnnotations(edit.words, edit.text, assetId);
  }

  function selectMediaAsset(assetId: string) {
    ++mediaOpenRevision.current;
    const asset = mediaAssets.find((item) => item.id === assetId);
    if (asset) setSelectedScriptAssetIds([assetId]);
    if (asset && isImportedForWork(asset, mediaAssets) && (asset.id !== selectedAssetId || selectedImportedTrackId !== null)) {
      flushCurrentMediaDraft();
      applyMediaAsset(asset);
    }
  }

  function closeMediaDetails() {
    saveResumeSource(project.id, null);
    ++mediaOpenRevision.current;
    flushCurrentMediaDraft();
    selectedAssetIdRef.current = null;
    scriptAssetIdRef.current = null;
    setSelectedAssetId(null);
    setSelectedImportedTrackId(null);
    setObsTimelineRecordingId(null);
    setObsTimelineActive(false);
    setObsSeekRequest(null);
    setTake(null);
    setRecordingPreview(null);
    setScript("");
    setScriptDirty(false);
    setWordSelection(EMPTY_SELECTION);
  }

  function clearMediaSelection() {
    setSelectedScriptAssetIds([]);
    closeMediaDetails();
  }

  function selectMediaList(assetIds: string[]) {
    setSelectedScriptAssetIds(assetIds);
    if (assetIds.length > 1) {
      const selected = assetIds.map((id) => mediaAssets.find((asset) => asset.id === id));
      const parents = new Set(selected.map((asset) => asset?.sourceArchiveAssetId ?? asset?.id));
      const parent = mediaAssets.find((asset) => asset.id === [...parents][0]);
      if (parents.size === 1 && selected.every(Boolean) && parent &&
          mediaAssets.some((asset) => asset.sourceArchiveAssetId === parent.id)) {
        flushCurrentMediaDraft();
        applyMediaAsset(parent);
        return;
      }
    }
    if (assetIds.length > 1 || !assetIds.length && selectedAssetIdRef.current !== null) closeMediaDetails();
  }

  function openObsRecording(recordingId: string, channelId?: string) {
    saveResumeSource(project.id, { kind: "obs", id: recordingId });
    ++mediaOpenRevision.current;
    flushCurrentMediaDraft();
    setSelectedScriptAssetIds(null);
    selectedAssetIdRef.current = null;
    scriptAssetIdRef.current = null;
    setSelectedAssetId(null);
    setSelectedImportedTrackId(null);
    setTake(null);
    setScript("");
    setScriptDirty(false);
    setWordSelection(EMPTY_SELECTION);
    setObsTimelineRecordingId(recordingId);
    setObsTimelineActive(true);
    if (channelId) setObsSeekRequest((current) => ({ recordingId, channelId, seconds: 0,
      selectOnly: true, serial: (current?.serial ?? 0) + 1 }));
    else setObsSeekRequest(null);
  }

  async function openObsAsset(assetId: string, requireReceipt = false) {
    const revision = ++mediaOpenRevision.current;
    try {
      const assets = await listProjectMediaWithLifecycleFence(project.id);
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) throw new Error("Không tìm thấy track OBS trong Media Pool.");
      if (revision !== mediaOpenRevision.current && !requireReceipt) return;
      setMediaAssets(assets);
      if (revision !== mediaOpenRevision.current) return;
      flushCurrentMediaDraft();
      applyMediaAsset(asset);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không mở được track OBS.");
      if (requireReceipt) throw error;
    }
  }

  function changeScript(value: string) {
    if (!scriptAssetId || activePage === "voice-manipulator") scriptEditHistory.current.record(null, { text: scriptRef.current, words: [] }, { text: value, words: [] });
    setScript(value);
    scriptRef.current = value;
    // In Voice Manipulator the Script is text to speak, not the transcript of
    // whatever footage happens to be selected; typing there must not rewrite it.
    if (!scriptAssetId || liveTranscriptActive || activePage === "voice-manipulator") return;
    const asset = mediaAssetsRef.current.find((item) => item.id === scriptAssetId);
    if (asset && !scriptDraftBases.current.has(asset.id)) scriptDraftBases.current.set(asset.id, { text: asset.text, words: asset.words });
    setMediaAssets((current) => current.map((asset) => asset.id === scriptAssetId ? { ...asset, text: value } : asset));
    setScriptDirty(true);
  }

  function changeCatalog(catalog: TrainingCatalog) {
    // A Collection import may flush the next model before React commits this
    // profile. Publish the same snapshot to the transfer boundary immediately.
    currentCatalog.current = catalog;
    catalogRevisionRef.current += 1;
    setTrainingCatalog(catalog);
    setCatalogRevision(catalogRevisionRef.current);
  }

  async function prepareCollectionOperation() {
    if (catalogSaveTimer.current !== null) {
      window.clearTimeout(catalogSaveTimer.current);
      catalogSaveTimer.current = null;
    }
    const snapshot = currentCatalog.current;
    const revision = catalogRevisionRef.current;
    const write = catalogWrites.current.catch(() => undefined).then(() => api.saveTrainingCatalog(project.id, snapshot));
    catalogWrites.current = write;
    const saved = await write;
    // A debounce may have fired during the flush. Finish that write before the
    // server imports a profile, otherwise its old catalog could overwrite it.
    let pending = catalogWrites.current;
    while (pending !== write) {
      await pending;
      if (pending === catalogWrites.current) break;
      pending = catalogWrites.current;
    }
    if (catalogRevisionRef.current === revision) { setTrainingCatalog(saved); setCatalogRevision(0); }
  }

  function collectionImported(result: import("../domain/types").VoiceCollectionImport) {
    const catalog = currentCatalog.current;
    changeCatalog({ ...catalog, speakers: [...catalog.speakers.filter((speaker) => speaker.id !== result.speaker.id), result.speaker] });
    setProjectVoices((voices) => [...voices.filter((voice) => voice.id !== result.voice.id), result.voice]);
    setSelectedVoice(result.speaker.id);
    if (result.voice.kind !== "vc") {
      generationCategoryChoiceMade.current = true;
      setGenerationCategoryOverride(categoryForVoice(result.voice));
    }
  }

  function chooseGenerationCategory(category: VoiceCategory) {
    generationCategoryChoiceMade.current = true;
    setGenerationCategoryOverride(category);
  }

  async function updateTimelineEdits(ranges: TimelineEditRange[], gainKeyframes?: TimelineGainKeyframe[], assetId = selectedAssetId, workingRange?: TimelineEditRange | null, cutPoints?: number[]) {
    if (!assetId) return false;
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    if (!previous) return false;
    const nextKeyframes = gainKeyframes ?? previous.gainKeyframes ?? [];
    const nextWorking = workingRange === undefined ? previous.workingRange ?? null : workingRange;
    const nextPoints = cutPoints ?? previous.cutPoints ?? [];
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, removedRanges: ranges, gainKeyframes: nextKeyframes, workingRange: nextWorking, cutPoints: nextPoints } : asset));
    const version = (timelineWriteVersions.current.get(assetId) ?? 0) + 1;
    timelineWriteVersions.current.set(assetId, version);
    const predecessor = timelineWriteQueues.current.get(assetId) ?? Promise.resolve(true);
    const write = predecessor.catch(() => false).then(async () => {
      try {
        const updated = await api.updateMediaTimelineEdits(project.id, assetId, ranges, nextKeyframes, nextWorking, nextPoints);
        if (timelineWriteVersions.current.get(assetId) === version) {
          setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? { ...asset, removedRanges: updated.removedRanges, gainKeyframes: updated.gainKeyframes, workingRange: updated.workingRange, cutPoints: updated.cutPoints } : asset));
          setNotice("Đã lưu vùng làm việc và điểm cắt. Phát/STT/diarization/training sẽ bỏ qua vùng gray out.");
        }
        return true;
      } catch (error) {
        if (timelineWriteVersions.current.get(assetId) === version) setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? { ...asset, removedRanges: previous.removedRanges, gainKeyframes: previous.gainKeyframes, workingRange: previous.workingRange, cutPoints: previous.cutPoints } : asset));
        setNotice(error instanceof Error ? error.message : "Không lưu được timeline edits");
        return false;
      }
    });
    timelineWriteQueues.current.set(assetId, write);
    const saved = await write;
    if (timelineWriteQueues.current.get(assetId) === write) timelineWriteQueues.current.delete(assetId);
    return saved;
  }
  async function updateMediaAnnotations(assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) {
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, speakerProfileIds, environmentProfileIds, emotion } : asset));
    try {
      const updated = await api.updateMediaAnnotations(project.id, assetId, speakerProfileIds, environmentProfileIds, emotion);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
      // Who speaks decides which segments a voice target gets, so the count the
      // Train panel gates on is stale the moment this changes.
      void refreshDatasetReadiness();
    } catch (error) {
      if (previous) setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? previous : asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được profile của footage");
    }
  }

  async function updateDiarizationAssignments(assetId: string, assignments: Record<string, string | null>) {
    if (!assetId) return;
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    if (!previous) return;
    const normalized = Object.fromEntries(Object.entries(assignments).map(([label, profileId]) => [label.trim(), profileId || null]).filter(([label]) => Boolean(label)));
    const applyAssignments = (words: StudioWord[]) => words.map((word) => {
      const label = word.diarizationSpeakerId?.trim();
      if (!label || !Object.prototype.hasOwnProperty.call(normalized, label)) return word;
      return { ...word, speakerId: normalized[label], manualDiarizationSpeakerId: null };
    });
    const optimisticWords = applyAssignments(previous.words);
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, words: optimisticWords, diarizationSpeakerAssignments: normalized } : asset));
    if (selectedAssetId === assetId) setTake((current) => current ? { ...current, words: optimisticWords } : current);
    try {
      const updated = await api.updateMediaDiarizationAssignments(project.id, assetId, normalized);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
      if (selectedAssetId === assetId && !scriptDirty && !liveTranscriptActive) {
        setTake((current) => current ? { ...current, words: updated.words } : current);
      }
      setNotice("Đã lưu mapping Speaker Diarization. Có thể sửa từng row hoặc từng word trong Bảng Script.");
    } catch (error) {
      setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? previous : asset));
      if (selectedAssetId === assetId) setTake((current) => current ? { ...current, words: previous.words } : current);
      setNotice(error instanceof Error ? error.message : "Không lưu được mapping Speaker Diarization");
    }
  }

  async function changeWordAnnotations(words: StudioWord[], text?: string, assetId = scriptAssetId, restore?: ScriptEditSnapshot) {
    if (!assetId) return;
    const asset = mediaAssetsRef.current.find((item) => item.id === assetId) ?? mediaAssets.find((item) => item.id === assetId);
    if (!asset) return;
    if (!restore) words = editableWordTimings(words, asset.duration);
    const wordSpeakerIds = words.map((word) => word.speakerId).filter((id): id is string => Boolean(id));
    const wordEnvironmentIds = words.flatMap((word) => word.environmentProfileIds ?? []);
    const speakerProfileIds = restore?.speakerProfileIds ?? [...new Set([...asset.speakerProfileIds, ...wordSpeakerIds])];
    const environmentProfileIds = restore?.environmentProfileIds ?? [...new Set([...asset.environmentProfileIds, ...wordEnvironmentIds])];
    const emotions = [...new Set(words.map((word) => word.emotion ?? asset.emotion))];
    const emotion = restore?.emotion ?? (emotions.length > 1 ? "mix" : emotions[0] ?? asset.emotion);
    const nextText = text ?? (assetId === scriptAssetId ? scriptRef.current : asset.text);
    if (!restore) {
      const base = scriptDraftBases.current.get(assetId) ?? asset;
      scriptEditHistory.current.record(assetId, { text: base.text, words: base.words, speakerProfileIds: asset.speakerProfileIds, environmentProfileIds: asset.environmentProfileIds, emotion: asset.emotion }, { text: nextText, words, speakerProfileIds, environmentProfileIds, emotion });
    }
    scriptDraftBases.current.delete(assetId);
    if (text !== undefined && assetId === scriptAssetId) {
      setScript(nextText);
      scriptRef.current = nextText;
      setScriptDirty(false);
    }
    if (assetId === scriptAssetId) setTake((current) => current ? { ...current, text: nextText, words } : current);
    mediaAssetsRef.current = mediaAssetsRef.current.map((item) => item.id === asset.id ? { ...item, text: nextText, words, speakerProfileIds, environmentProfileIds, emotion } : item);
    setMediaAssets((current) => current.map((item) => item.id === asset.id ? { ...item, text: nextText, words, speakerProfileIds, environmentProfileIds, emotion } : item));
    const version = (wordWriteVersions.current.get(asset.id) ?? 0) + 1;
    wordWriteVersions.current.set(asset.id, version);
    wordWriteErrors.current.delete(asset.id);
    const previousWrite = wordWriteQueues.current.get(asset.id) ?? Promise.resolve();
    const write = previousWrite.catch(() => undefined).then(async () => {
      try {
        await api.updateMediaScript(project.id, asset.id, nextText, "user", words);
        const updated = await api.updateMediaAnnotations(project.id, asset.id, speakerProfileIds, environmentProfileIds, emotion);
        if (wordWriteVersions.current.get(asset.id) !== version) return;
        wordWriteErrors.current.delete(asset.id);
        setMediaAssets((current) => current.map((item) => item.id === updated.id ? { ...item, text: updated.text, words: updated.words, speakerProfileIds: updated.speakerProfileIds, environmentProfileIds: updated.environmentProfileIds, emotion: updated.emotion, wordTimingQuality: updated.wordTimingQuality, wordTimingNote: updated.wordTimingNote, revisions: updated.revisions } : item));
        if (scriptAssetIdRef.current === asset.id) setTake((current) => current ? { ...current, words: updated.words, text: updated.text, wordTimingQuality: updated.wordTimingQuality, wordTimingNote: updated.wordTimingNote } : current);
        void refreshDatasetReadiness();
        setNotice("Đã lưu text, timestamp và nhãn theo từ.");
      } catch (error) {
        if (wordWriteVersions.current.get(asset.id) === version) wordWriteErrors.current.set(asset.id, error instanceof Error ? error.message : "Không lưu được text/timestamp");
        setNotice(error instanceof Error ? error.message : "Không lưu được text/timestamp");
      }
    });
    wordWriteQueues.current.set(asset.id, write);
    await write;
    if (wordWriteQueues.current.get(asset.id) === write) wordWriteQueues.current.delete(asset.id);
  }

  async function assignScriptWords(assetId: string, indexes: number[], speakerProfileId: string | null) {
    const asset = mediaAssetsRef.current.find((item) => item.id === assetId);
    if (!asset || asset.deletedAt) { setNotice("Restore footage trước khi sửa Speaker."); return; }
    if (!indexes.length) return;
    const words = assignProfileToWords(asset.words, indexes, speakerProfileId);
    await changeWordAnnotations(words, asset.text, assetId);
  }

  async function prepareSubtitleAlignment(assetId: string) {
    flushCurrentMediaDraft();
    let pending: Promise<void> | undefined;
    while ((pending = wordWriteQueues.current.get(assetId))) {
      await pending;
      if (wordWriteQueues.current.get(assetId) === pending) break;
    }
    const failure = wordWriteErrors.current.get(assetId);
    if (failure) throw new Error(`Lưu Script trước khi căn chỉnh: ${failure}`);
    alignmentPreparedVersions.current.set(assetId, wordWriteVersions.current.get(assetId) ?? 0);
  }

  function acceptSubtitleAlignment(updated: ProjectMediaAsset) {
    const previous = mediaAssetsRef.current.find((asset) => asset.id === updated.id);
    if (!previous) return;
    if ((wordWriteVersions.current.get(updated.id) ?? 0) !== alignmentPreparedVersions.current.get(updated.id)) {
      setNotice("Script vừa được sửa thêm; giữ thay đổi đang lưu và phân tích lại timing.");
      return;
    }
    const snapshot = (asset: ProjectMediaAsset): ScriptEditSnapshot => ({ text: asset.text, words: asset.words,
      speakerProfileIds: asset.speakerProfileIds, environmentProfileIds: asset.environmentProfileIds, emotion: asset.emotion });
    scriptEditHistory.current.record(updated.id, snapshot(previous), snapshot(updated));
    scriptDraftBases.current.delete(updated.id);
    wordWriteVersions.current.set(updated.id, (wordWriteVersions.current.get(updated.id) ?? 0) + 1);
    mediaAssetsRef.current = mediaAssetsRef.current.map((asset) => asset.id === updated.id ? updated : asset);
    setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
    if (scriptAssetIdRef.current === updated.id) {
      scriptRef.current = updated.text;
      setScript(updated.text);
      setScriptDirty(false);
      setTake((current) => current ? { ...current, text: updated.text, words: updated.words,
        wordTimingQuality: updated.wordTimingQuality, wordTimingNote: updated.wordTimingNote } : current);
    }
    void refreshDatasetReadiness();
    setNotice("Đã lưu căn chỉnh subtitle. Có thể Undo hoặc khôi phục trong bảng căn chỉnh.");
  }

  function restoreScriptEdit(direction: "undo" | "redo") {
    flushCurrentMediaDraft();
    const edit = scriptEditHistory.current[direction]();
    if (!edit) return;
    const targets = [edit, ...(edit.related ?? [])];
    if (targets.some((target) => target.assetId && !mediaAssetsRef.current.some((asset) => asset.id === target.assetId && !asset.deletedAt))) {
      setNotice("Không khôi phục sửa Script của footage đã bị remove.");
      return;
    }
    for (const target of targets) {
      if (target.assetId) void changeWordAnnotations(target.snapshot.words, target.snapshot.text, target.assetId, target.snapshot);
      else if (!scriptAssetId || activePage === "voice-manipulator") {
        setScript(target.snapshot.text);
        scriptRef.current = target.snapshot.text;
      } else localStorage.setItem(scratchStorageKey, target.snapshot.text);
    }
  }

  async function controlTranscriptions(action: "pause" | "resume" | "stop" | "stop-all", assetIds?: string[]) {
    try {
      const updated = await api.controlMediaTranscriptions(project.id, action, assetIds);
      if (updated.length) {
        const byId = new Map(updated.map((asset) => [asset.id, asset]));
        setMediaAssets((current) => current.map((asset) => byId.get(asset.id) ?? asset));
      }
      const scope = assetIds?.length ? `${assetIds.length} footage` : "toàn bộ hàng đợi";
      setNotice(action === "stop-all" ? "Đã yêu cầu dừng toàn bộ STT đang chạy và hàng đợi."
        : action === "resume"
        ? `Đã chạy tiếp ${scope}.`
        : `Đã ${action === "pause" ? "tạm dừng" : "dừng"} ${scope}. File đang nhận dạng vẫn chạy nốt.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không điều khiển được hàng đợi STT");
      if (action === "stop" || action === "stop-all") throw error;
    }
  }

  async function stopDiarization(mode: "queue" | "all") {
    const updated = await api.stopMediaDiarizations(project.id, mode);
    const byId = new Map(updated.map((asset) => [asset.id, asset]));
    setMediaAssets((current) => current.map((asset) => byId.get(asset.id) ?? asset));
    setNotice(mode === "all" ? "Đã yêu cầu dừng toàn bộ Speaker Diarization." : "Đã dừng hàng đợi Speaker Diarization; footage đang chạy sẽ hoàn tất.");
  }

  async function stopTraining(mode: "queue" | "all") {
    await api.stopTrainingRuns(project.id, mode);
    await refreshTrainingRun();
    setNotice(mode === "all" ? "Đã yêu cầu dừng toàn bộ Training; giữ checkpoint đã lưu." : "Đã dừng hàng đợi Training; voice đang chạy sẽ hoàn tất.");
  }

  async function stopGeneration(mode: "queue" | "all") {
    const job = await api.stopGeneration(project.id, mode);
    if (job) acceptVoiceScriptJob(job);
    if (!job?.output) setNotice(mode === "all" ? "Đã yêu cầu dừng toàn bộ Generate Voice." : "Đã dừng hàng đợi Generate Voice; đoạn đang đọc sẽ hoàn tất.");
  }

  function acceptVoiceScriptJob(job: VoiceScriptJob) {
    const previous = voiceScriptJobRef.current;
    // Start/poll responses can arrive after a Stop acknowledgement. A stale
    // running snapshot must not revive a terminal job or its busy UI.
    if (previous?.id === job.id && previous.status !== "running"
      && (job.status === "running" || previous.status === "cancelled" && job.status !== "cancelled")) return;
    voiceScriptJobRef.current = job;
    setVoiceScriptJob(job);
    setGenerating(job.status === "running");
    if ((job.status === "complete" || job.status === "stopped") && job.output) {
      const output = job.output;
      setPendingVoiceOutput(null);
      setVoiceOutputs((current) => [output, ...current.filter((item) => item.id !== output.id)]);
      if (output.parameters.voiceVersion) {
        openVoiceOutput(output, false);
      }
      if (!completedVersionJobs.current.has(job.id)) {
        completedVersionJobs.current.add(job.id);
        if (output.parameters.voiceVersion) void voiceVersions.refreshAfterGeneration();
        else void voiceVersions.adoptOutput(output);
      }
      setNotice(`${job.status === "stopped" ? "Đã dừng sau khi đọc" : "Đã đọc"} ${job.done} đoạn${job.reused ? ` (${job.reused} đoạn dùng lại)` : ""} · ${output.duration.toFixed(1)} giây; file nằm trong Voice Output.`);
    } else {
      setPendingVoiceOutput((current) => current ? {
        ...current, status: job.status === "running" ? "running" : job.status === "cancelled" ? "cancelled" : "error",
        completedRows: job.done, totalRows: job.total,
        detail: job.error ?? job.message ?? undefined,
      } : null);
      if (job.status !== "running") setNotice(job.error ?? job.message ?? "Đọc Script đã dừng.");
    }
  }


  async function refreshProjectVoices() {
    if (typeof api.listAsrAdapters === "function") {
      // Published by the same runs that publish voices, so refreshed with them.
      api.listAsrAdapters(project.id).then(setAsrAdapters).catch(() => setAsrAdapters([]));
    }
    if (typeof api.listProjectVoices !== "function") return;
    try {
      const voices = await api.listProjectVoices(project.id);
      setProjectVoices(voices);
      if (generationCategoryInitializedProject.current !== project.id) {
        generationCategoryInitializedProject.current = project.id;
        if (!generationCategoryChoiceMade.current) {
          const importedVoice = voices.find((voice) => voice.collectionSource && voice.kind !== "vc");
          if (importedVoice) setGenerationCategoryOverride(categoryForVoice(importedVoice));
        }
      }
    } catch {
      setProjectVoices([]);
    }
  }

  async function refreshTrainingRun() {
    try {
      const runs = await api.listTrainingRuns(project.id);
      const batch = newestBatch(runs);
      const progress = await Promise.all(
        batch.map(async (run) => [run.id, await api.getTrainingRunProgress(project.id, run.id)] as const),
      );
      setTrainingRuns(runs);
      setTrainingProgressByRun(Object.fromEntries(progress));
    } catch {
      setTrainingRuns([]);
      setTrainingProgressByRun({});
    }
  }

  async function refreshTrainingOutputs() {
    await Promise.all([refreshTrainingRun(), refreshProjectVoices()]);
  }

  /** Forget a voice everywhere this page still points at it. */
  function forgetVoice(voiceId: string) {
    setVoiceScriptRows((rows) => rows.map((row) => row.voiceId === voiceId ? { ...row, voiceId: null } : row));
    setChangerSettings((settings) => settings.voiceId === voiceId ? { ...settings, voiceId: null } : settings);
  }

  async function deleteProjectVoice(voice: ProjectVoice) {
    const madeByRun = voice.sourceRunId ? ` Weights của nó vẫn nằm trong run ${voice.sourceRunId}; xoá run ở Voice Training → Lịch sử để giải phóng dung lượng.` : "";
    if (!window.confirm(`Xoá voice "${voice.name}"?

Clip mẫu và thông tin voice bị xoá khỏi project.${madeByRun}
Voice Output đã tạo bằng voice này vẫn giữ nguyên. Không khôi phục được.`)) return;
    try {
      await api.deleteProjectVoice(project.id, voice.id);
      forgetVoice(voice.id);
      setNotice(`Đã xoá voice ${voice.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không xoá được voice");
    }
    await refreshProjectVoices();
  }
  async function updateObsTimelineCuts(assetIds: string[], ranges: TimelineEditRange[]): Promise<boolean> {
    if (!assetIds.length) return false;
    try {
      const updated = await api.updateObsTimelineCuts(project.id, assetIds, ranges);
      const byId = new Map(updated.map((asset) => [asset.id, asset]));
      setMediaAssets((current) => [
        ...current.map((asset) => byId.get(asset.id) ?? asset),
        ...updated.filter((asset) => !current.some((item) => item.id === asset.id)),
      ]);
      setNotice(ranges.length ? `Đã áp dụng ${ranges.length} đoạn cắt cho ${updated.length} channel.` : `Đã reset đoạn cắt của ${updated.length} channel.`);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không lưu được các đoạn cắt OBS.");
      return false;
    }
  }

  async function deleteProjectVoices(voices: ProjectVoice[]) {
    const results = await Promise.allSettled(voices.map((voice) => api.deleteProjectVoice(project.id, voice.id)));
    const removed = new Set(voices.filter((_, index) => results[index].status === "fulfilled").map((voice) => voice.id));
    removed.forEach(forgetVoice);
    setNotice(results.every((result) => result.status === "fulfilled")
      ? `Đã xoá ${removed.size} voice.`
      : `Đã xoá ${removed.size}/${voices.length} voice; các mục lỗi vẫn được giữ lại.`);
    await refreshProjectVoices();
  }

  async function deleteSpeakerProfile(speaker: SpeakerProfile) {
    const own = projectVoices.filter((voice) => voice.speakerProfileId === speaker.id);
    const footage = mediaAssets.filter((asset) => !asset.deletedAt && (asset.speakerProfileIds ?? []).includes(speaker.id)).length;
    const lines = [
      `Xoá Speaker Profile "${speaker.name}"?`,
      own.length ? `${own.length} voice của người này bị xoá cùng: ${own.map((voice) => voice.name).join(", ")}.` : "Người này chưa có voice nào.",
      footage ? `${footage} footage đang gán cho người này sẽ thành chưa gán người nói.` : "",
      "Training run cũ vẫn còn trong Lịch sử để xoá riêng. Không khôi phục được.",
    ].filter(Boolean);
    if (!window.confirm(lines.join("\n\n"))) return;
    try {
      for (const voice of own) {
        await api.deleteProjectVoice(project.id, voice.id);
        forgetVoice(voice.id);
      }
      const settings = trainingCatalog.settings;
      changeCatalog({
        ...trainingCatalog,
        speakers: trainingCatalog.speakers.filter((item) => item.id !== speaker.id),
        settings: { ...settings, targetSpeakerIds: settings.targetSpeakerIds.filter((id) => id !== speaker.id) },
      });
      if (selectedVoice === speaker.id) setSelectedVoice("");
      setNotice(`Đã xoá Speaker Profile ${speaker.name}${own.length ? ` và ${own.length} voice` : ""}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không xoá được Speaker Profile");
    }
    await refreshProjectVoices();
  }

  async function deleteSpeakerProfiles(speakers: SpeakerProfile[]) {
    const selectedIds = new Set(speakers.map((speaker) => speaker.id));
    const voices = projectVoices.filter((voice) => voice.speakerProfileId !== undefined && selectedIds.has(voice.speakerProfileId));
    const results = await Promise.allSettled(voices.map((voice) => api.deleteProjectVoice(project.id, voice.id)));
    const removedVoiceIds = new Set(voices.filter((_, index) => results[index].status === "fulfilled").map((voice) => voice.id));
    removedVoiceIds.forEach(forgetVoice);
    const failedSpeakerIds = new Set(voices.filter((voice) => !removedVoiceIds.has(voice.id)).map((voice) => voice.speakerProfileId));
    const removedSpeakers = speakers.filter((speaker) => !failedSpeakerIds.has(speaker.id));
    const removedSpeakerIds = new Set(removedSpeakers.map((speaker) => speaker.id));
    const settings = trainingCatalog.settings;
    changeCatalog({
      ...trainingCatalog,
      speakers: trainingCatalog.speakers.filter((speaker) => !removedSpeakerIds.has(speaker.id)),
      settings: { ...settings, targetSpeakerIds: settings.targetSpeakerIds.filter((id) => !removedSpeakerIds.has(id)) },
    });
    if (selectedVoice && removedSpeakerIds.has(selectedVoice)) setSelectedVoice("");
    setNotice(removedSpeakers.length === speakers.length
      ? `Đã xoá ${removedSpeakers.length} Speaker Profile và ${removedVoiceIds.size} voice.`
      : `Đã xoá ${removedSpeakers.length}/${speakers.length} Speaker Profile và ${removedVoiceIds.size} voice; profile có voice lỗi vẫn được giữ lại.`);
    await refreshProjectVoices();
  }

  function deleteEnvironmentProfile(profile: EnvironmentNoiseProfile) {
    if (!window.confirm(`Xoá Environment Profile "${profile.name}"?

Footage tham chiếu không bị xoá. Không khôi phục được.`)) return;
    const settings = trainingCatalog.settings;
    changeCatalog({
      ...trainingCatalog,
      environmentProfiles: trainingCatalog.environmentProfiles.filter((item) => item.id !== profile.id),
      settings: { ...settings, environmentProfileId: settings.environmentProfileId === profile.id ? null : settings.environmentProfileId },
    });
    setNotice(`Đã xoá Environment Profile ${profile.name}.`);
  }

  function deleteEnvironmentProfiles(profiles: EnvironmentNoiseProfile[]) {
    const selectedIds = new Set(profiles.map((profile) => profile.id));
    const settings = trainingCatalog.settings;
    changeCatalog({
      ...trainingCatalog,
      environmentProfiles: trainingCatalog.environmentProfiles.filter((profile) => !selectedIds.has(profile.id)),
      settings: { ...settings, environmentProfileId: settings.environmentProfileId && selectedIds.has(settings.environmentProfileId) ? null : settings.environmentProfileId },
    });
    setNotice(`Đã xoá ${profiles.length} Environment Profile.`);
  }

  /** Whose voice this footage is. One profile is all the dataset needs. */
  async function assignAssetSpeaker(assetId: string, speakerProfileId: string | null) {
    const asset = mediaAssets.find((item) => item.id === assetId);
    if (!asset) return;
    await updateMediaAnnotations(
      assetId,
      speakerProfileId ? [speakerProfileId] : [],
      asset.environmentProfileIds ?? [],
      asset.emotion ?? "normal",
    );
    const name = trainingCatalog.speakers.find((speaker) => speaker.id === speakerProfileId)?.name;
    setNotice(name ? `${asset.name} là giọng của ${name}. Dataset đã tính lại.` : `${asset.name} chưa gán người nói.`);
  }

  async function refreshDatasetReadiness() {
    try {
      setDatasetReadiness(await api.getDatasetReadiness(project.id));
    } catch {
      setDatasetReadiness(null);
    }
  }

  async function compileDataset() {
    setDatasetBusy(true);
    try {
      const manifest = await api.compileDataset(project.id);
      setNotice(
        `Đã biên dịch ${manifest.stats.segments} đoạn · ` +
        `${manifest.stats.trainSegments} train / ${manifest.stats.devSegments} dev · ` +
        `${(manifest.stats.totalSeconds / 60).toFixed(1)} phút.`,
      );
      await refreshDatasetReadiness();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không biên dịch được dataset");
    } finally {
      setDatasetBusy(false);
    }
  }

  async function startTrainingRun() {
    const model = selectedTrainingModel(trainingModels, trainingCatalog.settings);
    const candidates = trainingCatalog.settings.targetSpeakerIds;
    if (!model || !candidates.length) return;
    const parameters = parameterOverrides(model, trainingCatalog.settings);
    const effectiveParameters = Object.fromEntries(model.parameters.map((spec) => [spec.key, parameterValue(spec, parameters)]));
    const choice = await processingChoice.choose("Training", candidates,
      completedTrainingTargets(candidates, model.id, effectiveParameters, trainingRuns, projectVoices, mediaAssets));
    if (!choice) return;
    const targets = choice.ids;
    setDatasetBusy(true);
    try {
      // Compiled at the moment of starting, so the run trains on the footage
      // and assignments as they are now rather than as they were last compiled.
      const manifest = await api.compileDataset(project.id);
      void refreshDatasetReadiness();
      // Only the model and the values the user changed travel; the API fills
      // the rest from the same descriptor and refuses what it does not allow.
      await api.startTrainingRun(project.id, {
        manifestId: manifest.id,
        config: { modelId: model.id, parameters },
        speakerProfileIds: targets,
      });
      setNotice(`Đã xếp ${targets.length} voice target vào hàng train · ${manifest.stats.segments} đoạn.`);
      await refreshTrainingRun();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không khởi động được training");
    } finally {
      setDatasetBusy(false);
    }
  }

  function updateRecordingSlot(slot: RecordingSlotState) {
    const row: PendingMediaImportRow = { ...slot, origin: "record", retryable: false };
    updatePendingMediaSlot(row);
  }

  function updatePendingMediaSlot(row: PendingMediaImportRow) {
    setPendingMediaImports((current) => current.some((item) => item.id === row.id)
      ? current.map((item) => item.id === row.id ? row : item) : [...current, row]);
  }

  async function processCapturedAudio(captured: CapturedAudio) {
    const projectId = project.id;
    const slotId = captured.captureId ?? `capture-${crypto.randomUUID()}`;
    capturedMediaFailures.current.set(slotId, captured);
    updateRecordingSlot({ id: slotId, name: captured.file.name, status: "saving" });
    setTake(captured);
    setMediaBusy(true);
    let savedReceipt: ProjectMediaAsset | null = null;
    try {
      // A recording is an ordinary file that happens to arrive with a live
      // transcript. Running STT on it unasked spent GPU time on takes the user
      // was going to discard, so it queues like anything else: tick it in Media
      // Pool and press Speech to text.
      // In HQ mode the card is the transcript, not a guess, and the take
      // is filed as guided. Verification stays a later, deliberate pass.
      const guided = Boolean(captured.readingSessionId);
      const assetReceipt = guided
        ? await reading.saveTake(captured)
        : (await api.importProjectMedia(project.id, captured.file, "record", captured.realtimeText, false, false, null)).asset;
      if (!assetReceipt) throw new Error("Chưa lưu được bản thu. Có thể thử lưu lại audio đang giữ trong phiên này.");
      savedReceipt = assetReceipt;
      if (activeMediaProjectId.current !== projectId) return;
      flushCurrentMediaDraft();
      let asset = assetReceipt;
      if (!guided && captured.words.length) {
        // The live transcript is the recording's subtitle until STT replaces it.
        asset = await api.updateMediaScript(project.id, asset.id, captured.realtimeText, "record", captured.words);
      }
      storeMediaAsset(asset);
      applyMediaAsset(asset);
      capturedMediaFailures.current.delete(slotId);
      setPendingMediaImports((current) => current.filter((item) => item.id !== slotId));
      setNotice(guided ? "Đã lưu bản thu theo thẻ, Speaker và cảm xúc. Tiến độ phiên đọc đã lưu." : "Bản thu đã vào Media Pool cùng live transcript. Tick STT rồi bấm Speech to text khi muốn chạy nhận dạng kỹ.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Không xử lý được audio";
      if (activeMediaProjectId.current === projectId) {
        if (savedReceipt) {
          // The audio already exists. Keep that receipt if annotating it fails;
          // retrying the upload would create a second footage for the same take.
          storeMediaAsset(savedReceipt);
          applyMediaAsset(savedReceipt);
          capturedMediaFailures.current.delete(slotId);
          setPendingMediaImports((current) => current.filter((item) => item.id !== slotId));
          setNotice(`Đã lưu audio; chưa cập nhật được transcript: ${detail}`);
        } else {
          setPendingMediaImports((current) => current.map((item) => item.id === slotId
            ? { ...item, status: "error", detail, retryable: true } : item));
          setNotice(detail);
        }
      }
    } finally {
      setMediaBusy(false);
    }
  }

  function queueMediaImports(jobs: Array<{
    name: string;
    run: (taskId: string) => Promise<ProjectMediaImportResult>;
    transcribe: boolean;
    cacheLocal: boolean;
  }>): string[] {
    if (!jobs.length) return [];
    const projectId = project.id;
    const queued = jobs.map((job) => ({ id: `import-${Date.now()}-${Math.random().toString(16).slice(2)}`, ...job }));
    queued.forEach(({ id, name, run, transcribe, cacheLocal }) => {
      failedMediaImports.current.set(id, { name, run, transcribe, cacheLocal });
    });
    setPendingMediaImports((current) => [...current, ...queued.map(({ id, name }) => ({ id, name, status: "queued" as const }))]);
    // Register immediately, even when an earlier upload is holding the serial
    // executor. Convert rejection to a value here so it cannot go unhandled.
    const reservationResult = (async () => {
      try {
        const reservation = await api.reserveMediaImports(projectId, queued.map(({ id, name }) => ({ id, label: name })));
        const reservedIds = new Set(reservation.tasks.map((item) => item.id));
        const missing = queued.filter((job) => !reservedIds.has(job.id));
        if (missing.length) throw new Error(`Queue did not reserve ${missing.map((job) => job.name).join(", ")}`);
        return { error: null };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Không đăng ký được hàng chờ import" };
      }
    })();
    const task = async () => {
      const { error: reservationError } = await reservationResult;
      if (reservationError) {
        if (activeMediaProjectId.current === projectId) setPendingMediaImports((current) => current.map((row) => queued.some((job) => job.id === row.id)
          ? { ...row, status: "error", detail: reservationError, retryable: true }
          : row));
        return;
      }
      let imported = 0;
      for (const job of queued) {
        if (activeMediaProjectId.current === projectId) {
          setPendingMediaImports((current) => current.map((row) => row.id === job.id
            ? { ...row, status: job.cacheLocal ? "caching" : "importing", detail: undefined }
            : row));
        }
        try {
          const result = await job.run(job.id);
          const targetIds = result.trackAssetIds?.length ? result.trackAssetIds : [result.asset.id];
          if (job.transcribe) await Promise.all(targetIds.map((id) => api.setMediaTranscriptionSelected(projectId, id, true)));
          const assets = await listProjectMediaWithLifecycleFence(projectId);
          if (activeMediaProjectId.current === projectId) {
            flushCurrentMediaDraft();
            setMediaAssets(assets);
            setPendingMediaImports((current) => current.filter((row) => row.id !== job.id));
          }
          failedMediaImports.current.delete(job.id);
          imported += 1;
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Import media thất bại";
          if (activeMediaProjectId.current === projectId) {
            setPendingMediaImports((current) => current.map((row) => row.id === job.id
              ? { ...row, status: "error", detail, retryable: true }
              : row));
          }
        }
      }
      if (activeMediaProjectId.current === projectId && imported) {
        setNotice(`Đã import ${imported}/${queued.length} footage. Các footage đã tick STT sẵn sàng trong hàng chờ.`);
      }
    };
    const next = mediaImportQueue.current.then(task, task);
    mediaImportQueue.current = next.catch(() => undefined);
    return queued.map(({ id }) => id);
  }

  async function importMedia(choices: MediaImportChoice[]) {
    queueMediaImports(choices.map((choice) => ({
      name: choice.file.name,
      run: (taskId) => api.importProjectMedia(project.id, choice.file, "import", "", false, false, null, taskId),
      transcribe: choice.transcribe,
      cacheLocal: false,
    })));
  }

  async function importLocalMedia() {
    const projectId = project.id;
    try {
      const picked = await api.pickMediaFiles();
      if (!picked.paths.length) { setNotice("Đã hủy chọn file gốc."); return; }
      if (activeMediaProjectId.current !== projectId) return;
      if (picked.paths.length === 1) {
        const path = picked.paths[0];
        const extension = path.split(".").pop()?.toLowerCase();
        if (["mkv", "mov", "mp4"].includes(extension ?? "")) {
          const probeId = `inspect-${Date.now()}`;
          setPendingMediaImports((current) => [...current, { id: probeId, name: path.split(/[\\/]/).pop() ?? "media", status: "importing", detail: "Đang đọc thông tin file và các track…" }]);
          let inspection;
          try { inspection = await api.inspectLocalMediaTracks(projectId, path); }
          catch (error) {
            if (activeMediaProjectId.current === projectId) setPendingMediaImports((current) => current.map((row) => row.id === probeId
              ? { ...row, status: "error", detail: error instanceof Error ? error.message : "Không đọc được thông tin file" } : row));
            throw error;
          }
          if (activeMediaProjectId.current === projectId) setPendingMediaImports((current) => current.filter((row) => row.id !== probeId));
          if (activeMediaProjectId.current !== projectId) return;
          if (inspection.tracks.length && (inspection.tracks.length > 1 || extension === "mkv")) {
            setPendingLocalMedia({
              sourcePath: path,
              name: path.split(/[\\/]/).pop() ?? "media",
              tracks: inspection.tracks.map((track) => ({ ...track, imported: true, transcribe: false })),
            });
            setNotice("File đang chờ trong Media Pool. Chọn cache nếu cần, rồi chọn track và STT.");
            return;
          }
        }
      }
      if (activeMediaProjectId.current === projectId) setPendingNativeMediaPaths(picked.paths);
    } catch (error) {
      if (activeMediaProjectId.current === projectId)
        setNotice(error instanceof Error ? error.message : "Không mở được trình chọn file gốc");
    }
  }

  function cancelNativeMediaImport() { setPendingNativeMediaPaths([]); }

  function confirmNativeMediaImport(paths: string[], cacheLocal: boolean) {
    setPendingNativeMediaPaths([]);
    queueMediaImports(paths.map((path) => ({
      name: path.split(/[\\/]/).pop() ?? path,
      run: (taskId) => api.importLocalProjectMedia(project.id, path, cacheLocal, undefined, undefined, taskId),
      transcribe: false,
      cacheLocal,
    })));
  }

  function retryPendingMediaImport(id: string) {
    const captured = capturedMediaFailures.current.get(id);
    if (captured) { void processCapturedAudio({ ...captured, captureId: id }); return; }
    const job = failedMediaImports.current.get(id);
    if (!job) return;
    const [newAttemptId] = queueMediaImports([job]);
    setPendingMediaImports((current) => current.map((row) => row.id === id
      ? { ...row, retryable: false, detail: `Đã tạo lần thử mới${newAttemptId ? ` (${newAttemptId})` : ""}.` }
      : row));
  }

  function changePendingLocalTrack(streamIndex: number, field: "imported" | "transcribe", selected: boolean) {
    setPendingLocalMedia((current) => current ? {
      ...current,
      tracks: current.tracks.map((track) => track.streamIndex === streamIndex
        ? field === "imported"
          ? { ...track, imported: selected, transcribe: selected && track.transcribe }
          : { ...track, transcribe: selected && track.imported }
        : track),
    } : null);
  }

  async function confirmPendingLocalMedia(mode: "import" | "follow", sttSegmentSeconds = 60, cacheChoice = true) {
    const pending = pendingLocalMedia;
    if (!pending) return;
    const streamIndexes = pending.tracks.filter((track) => track.imported).map((track) => track.streamIndex);
    const transcribeStreamIndexes = pending.tracks.filter((track) => track.imported && track.transcribe).map((track) => track.streamIndex);
    if (!streamIndexes.length) { setNotice("Hãy chọn ít nhất một track để import."); return; }
    setPendingLocalMedia((current) => current ? { ...current, processing: true, error: undefined } : current);
    setMediaBusy(true);
    try {
      const cacheLocal = mode === "import" ? cacheChoice : true;
      const result = mode === "follow"
        ? await api.startGrowingMkvFollow(project.id, pending.sourcePath, streamIndexes, transcribeStreamIndexes, sttSegmentSeconds)
        : await api.importLocalProjectMedia(project.id, pending.sourcePath, cacheLocal, streamIndexes, transcribeStreamIndexes);
      flushCurrentMediaDraft();
      const assets = await listProjectMediaWithLifecycleFence(project.id);
      setMediaAssets(assets);
      applyMediaAsset(assets.find((asset) => asset.id === result.asset.id) ?? result.asset, assets);
      setPendingLocalMedia(null);
      setNotice(mode === "follow"
        ? `Đang theo dõi MKV với ${streamIndexes.length} track${transcribeStreamIndexes.length ? `; STT nhanh chạy cho ${transcribeStreamIndexes.length} track` : ""}. Bấm Speech to text để bắt đầu STT kỹ. Khi OBS dừng, app tự import bản hoàn chỉnh ở nền và giữ bản nháp. Sau đó có thể nhận diện lại toàn bộ track bằng Speech to text.`
        : `Đã import ${streamIndexes.length} track. Các track đã tick STT sẵn sàng trong hàng chờ.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Không import được track đã chọn";
      setPendingLocalMedia((current) => current?.sourcePath === pending.sourcePath ? { ...current, processing: false, error: detail } : current);
      setNotice(detail);
    } finally {
      setMediaBusy(false);
    }
  }

  async function finishGrowingMkv(assetId: string) {
    setMediaBusy(true);
    try {
      await api.finishGrowingMkvFollow(project.id, assetId);
      const assets = await listProjectMediaWithLifecycleFence(project.id);
      setMediaAssets(assets);
      const selected = assets.find((asset) => asset.id === assetId);
      if (selectedAssetId === assetId && selected) applyMediaAsset(selected, assets);
      setNotice("Đã hoàn tất MKV và giải mã lại các track từ file ghi hình đầy đủ.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không hoàn tất được MKV");
    } finally {
      setMediaBusy(false);
    }
  }

  async function startGrowingMkvDetailedStt(assetId: string, segmentSeconds: number) {
    setMediaBusy(true);
    try {
      const started = await api.startGrowingMkvDetailedStt(project.id, assetId, segmentSeconds);
      setNotice(`STT kỹ đang xử lý ${started.selectedTrackCount} track: lượt đầu là toàn bộ audio đã đọc lúc bấm; sau đó mỗi block ${started.segmentSeconds} giây, thêm 10 giây ngữ cảnh và ghép từ 5 giây trước ranh giới.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không bắt đầu được STT kỹ cho MKV");
    } finally {
      setMediaBusy(false);
    }
  }

  async function setLocalCache(assetId: string, enabled: boolean) {
    const asset = mediaAssets.find((item) => item.id === assetId);
    if (!asset) return;
    setMediaBusy(true);
    try {
      const updated = await api.updateMediaLocalCache(project.id, assetId, enabled);
      storeMediaAsset(updated);
      if (selectedAssetId === assetId) applyMediaAsset(updated);
      setNotice(enabled
        ? "Đã cập nhật Local File Cache và dùng bản trong project để xử lý."
        : "Đã chuyển sang file gốc và tạo lại analysis audio từ nguồn đó.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không cập nhật được Local File Cache");
    } finally {
      setMediaBusy(false);
    }
  }
  async function toggleImportAsset(assetId: string, selected: boolean, streamIndex?: number) {
    if (streamIndex !== undefined) {
      setMediaBusy(true);
      try {
        await api.importExistingAudioTrack(project.id, assetId, streamIndex);
        const assets = await listProjectMediaWithLifecycleFence(project.id);
        setMediaAssets(assets);
        void refreshDatasetReadiness();
        setNotice("Đã thêm track vào footage.");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Không thêm được track. Anh có thể thử lại.");
      } finally {
        setMediaBusy(false);
      }
      return;
    }
    const children = mediaAssets.filter((asset) => asset.sourceArchiveAssetId === assetId);
    const targets = children.length ? children : mediaAssets.filter((asset) => asset.id === assetId);
    const targetIds = new Set(targets.map((asset) => asset.id));
    const nextAssets = mediaAssets.map((asset) => targetIds.has(asset.id) ? { ...asset, importSelected: selected } : asset);
    setMediaAssets(nextAssets);
    const openParent = nextAssets.find((asset) => asset.id === selectedAssetId);
    if (openParent && !isImportedForWork(openParent, nextAssets)) {
      flushCurrentMediaDraft();
      moveOffAsset(nextAssets);
    } else if (!selected && openParent && selectedImportedTrackId && targetIds.has(selectedImportedTrackId)) {
      flushCurrentMediaDraft();
      applyMediaAsset(openParent, nextAssets);
    }
    try {
      const updated = await Promise.all(targets.map((asset) => api.setMediaImportSelected(project.id, asset.id, selected)));
      setMediaAssets((current) => current.map((asset) => updated.find((item) => item.id === asset.id) ?? asset));
      void refreshDatasetReadiness();
    } catch (error) {
      setMediaAssets((current) => current.map((asset) => targets.find((item) => item.id === asset.id) ?? asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được lựa chọn Import");
    }
  }

  async function toggleDiarizationAsset(assetId: string, selected: boolean) {
    const children = mediaAssets.filter((asset) => asset.sourceArchiveAssetId === assetId);
    const targets = children.length ? children : mediaAssets.filter((asset) => asset.id === assetId);
    const targetIds = new Set(targets.map((asset) => asset.id));
    setMediaAssets((current) => current.map((asset) => targetIds.has(asset.id) ? { ...asset, diarizationSelected: selected } : asset));
    try {
      const updated = await Promise.all(targets.map((asset) => api.setMediaDiarizationSelected(project.id, asset.id, selected)));
      setMediaAssets((current) => current.map((asset) => updated.find((item) => item.id === asset.id) ?? asset));
    } catch (error) {
      setMediaAssets((current) => current.map((asset) => targets.find((item) => item.id === asset.id) ?? asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được lựa chọn Speaker Diarization");
    }
  }

  async function toggleTrainingAsset(assetId: string, selected: boolean) {
    const children = mediaAssets.filter((asset) => asset.sourceArchiveAssetId === assetId);
    const targets = children.length ? children : mediaAssets.filter((asset) => asset.id === assetId);
    const targetIds = new Set(targets.map((asset) => asset.id));
    setMediaAssets((current) => current.map((asset) => targetIds.has(asset.id) ? { ...asset, trainingSelected: selected } : asset));
    try {
      const updated = await Promise.all(targets.map((asset) => api.setMediaTrainingSelected(project.id, asset.id, selected)));
      setMediaAssets((current) => current.map((asset) => updated.find((item) => item.id === asset.id) ?? asset));
      // Readiness is derived from the selection, so it is stale the moment the
      // selection changes. Recomputing it is cheap; showing a wrong count is not.
      void refreshDatasetReadiness();
    } catch (error) {
      setMediaAssets((current) => current.map((asset) => targets.find((item) => item.id === asset.id) ?? asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được lựa chọn Voice Training");
    }
  }

  async function toggleTranscriptionAsset(assetId: string, selected: boolean) {
    const children = mediaAssets.filter((asset) => asset.sourceArchiveAssetId === assetId);
    const targets = children.length ? children : mediaAssets.filter((asset) => asset.id === assetId);
    const targetIds = new Set(targets.map((asset) => asset.id));
    setMediaAssets((current) => current.map((asset) => targetIds.has(asset.id) ? { ...asset, transcriptionSelected: selected } : asset));
    try {
      const updated = await Promise.all(targets.map((asset) => api.setMediaTranscriptionSelected(project.id, asset.id, selected)));
      setMediaAssets((current) => current.map((asset) => updated.find((item) => item.id === asset.id) ?? asset));
    } catch (error) {
      setMediaAssets((current) => current.map((asset) => targets.find((item) => item.id === asset.id) ?? asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được lựa chọn STT");
    }
  }

  async function queueSelectedTranscriptions(model = "large-v3") {
    const followedParents = new Set(mediaAssets.filter((asset) => asset.growingMkvFollow && !asset.sourcePath.endsWith("source-final.mkv")).map((asset) => asset.id));
    const targets = mediaAssets.filter((asset) => asset.transcriptionSelected && asset.importSelected !== false && asset.status !== "no-audio"
      && !asset.deletedAt && !asset.disabled && !mediaAssets.some((child) => child.sourceArchiveAssetId === asset.id)
      && !followedParents.has(asset.sourceArchiveAssetId ?? "")
      && !["queued", "processing", "reviewing"].includes(asset.transcriptionStatus));
    if (!targets.length) {
      setNotice("Hãy tick STT cho ít nhất một footage không đang chạy.");
      return;
    }
    const choice = await processingChoice.choose("Speech to text", targets.map((asset) => asset.id),
      new Set(targets.filter((asset) => asset.transcriptionStatus === "complete").map((asset) => asset.id)));
    if (!choice) return;
    try {
      const queued = await api.enqueueMediaTranscriptions(project.id, choice.ids, model);
      setMediaAssets((current) => current.map((asset) => queued.find((item) => item.id === asset.id) ?? asset));
      setNotice(`Đã đưa ${queued.length} footage vào hàng chờ STT. Chạy lần lượt theo thứ tự thêm vào và không khóa UI.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không tạo được hàng chờ STT");
    }
  }

  async function removeMediaAsset(asset: ProjectMediaAsset) {
    // Deleting recycles; deleting something already recycled is the one that
    // cannot be undone, so only that path asks.
    const permanent = Boolean(asset.deletedAt);
    if (permanent && !window.confirm(`Xóa hẳn "${asset.name}"? File và toàn bộ dữ liệu của nó trong project sẽ mất, không khôi phục được.`)) return;
    try {
      if (permanent) {
        await api.removeProjectMedia(project.id, asset.id);
        for (const id of relatedMediaIds(asset.id)) permanentlyRemovedMediaIds.current.add(id);
        setMediaAssets((current) => withoutPermanentlyRemoved(current));
        if (selectedAssetIdRef.current === asset.id) moveOffAsset(withoutPermanentlyRemoved(mediaAssetsRef.current));
        setNotice(`Đã xóa hẳn ${asset.name}.`);
        return;
      }
      const recycled = await api.recycleProjectMedia(project.id, asset.id);
      rememberMediaLifecycle(asset.id, recycled.deletedAt ?? null);
      setMediaAssets((current) => current.map((item) => item.id === recycled.id ? recycled : item.sourceArchiveAssetId === recycled.id ? { ...item, deletedAt: recycled.deletedAt, transcriptionSelected: false, trainingSelected: false } : item));
      if (selectedAssetId === asset.id) {
        moveOffAsset(mediaAssets.filter((item) => item.id !== asset.id && !item.deletedAt));
      }
      setNotice(`Đã chuyển ${asset.name} vào Recycle Bin. Mở Recycle Bin trong Media Pool để restore.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể remove footage";
      // The server says it is not there; the list saying otherwise is the stale
      // one, so drop it rather than leaving a row nothing can act on.
      if (/not found/i.test(message)) {
        for (const id of relatedMediaIds(asset.id)) permanentlyRemovedMediaIds.current.add(id);
        setMediaAssets((current) => withoutPermanentlyRemoved(current));
        if (selectedAssetIdRef.current === asset.id) moveOffAsset(withoutPermanentlyRemoved(mediaAssetsRef.current));
        setNotice(`${asset.name} đã không còn trong project.`);
        return;
      }
      setNotice(message);
    }
  }

  async function batchMediaAction(action: MediaBatchAction) {
    const deleteIds = action.kind === "delete"
      ? [...new Set(action.assetIds)].filter((id) => mediaAssetsRef.current.some((asset) => asset.id === id && asset.deletedAt))
      : [];
    if (action.kind === "delete") {
      if (!deleteIds.length) return;
      if (!window.confirm(`Xóa hẳn ${deleteIds.length} footage khỏi Recycle Bin? File và toàn bộ dữ liệu trong project sẽ mất, không khôi phục được.`)) return;
    }
    const completed: string[] = [];
    const failures: string[] = [];
    const operationIds: string[] = action.kind === "annotations" ? [] : action.kind === "delete" ? deleteIds : action.kind === "selection"
      ? action.assetIds.flatMap((id) => {
          const children = mediaAssetsRef.current.filter((asset) => asset.sourceArchiveAssetId === id);
          return children.length ? children.map((asset) => asset.id) : [id];
        })
      : action.kind === "disabled"
        ? action.assetIds.flatMap((id) => relatedMediaIds(id)) : action.assetIds;
    const changes = action.kind === "annotations" ? action.changes : [...new Set(operationIds)].map((assetId) => ({ assetId }));
    const selectionField = action.kind === "selection" ? ({ import: "importSelected", stt: "transcriptionSelected", training: "trainingSelected", diarization: "diarizationSelected" } as const)[action.target] : null;
    const beforeSelection = new Map(mediaAssetsRef.current.map((asset) => [asset.id, asset]));
    const versions = new Map<string, number>();
    if (action.kind === "selection" && selectionField) {
      const ids = new Set(operationIds);
      for (const assetId of ids) {
        const key = `${assetId}:${selectionField}`;
        const version = (mediaSelectionWrites.current.get(key)?.version ?? 0) + 1;
        versions.set(key, version);
        mediaSelectionWrites.current.set(key, { version, selected: action.selected, pending: true });
      }
      setMediaAssets((current) => current.map((asset) => ids.has(asset.id) ? { ...asset, [selectionField]: action.selected } : asset));
    }
    for (const change of changes) {
      const selectionKey = `${change.assetId}:${selectionField}`;
      const ownsSelection = () => activeMediaProjectId.current === project.id && mediaSelectionWrites.current.get(selectionKey)?.version === versions.get(selectionKey);
      if (selectionField && !ownsSelection()) continue;
      try {
        if (action.kind === "annotations") {
          const annotation = action.changes.find((item) => item.assetId === change.assetId)!;
          const updated = await api.updateMediaAnnotations(project.id, annotation.assetId, annotation.speakerProfileIds, annotation.environmentProfileIds, annotation.emotion);
          setMediaAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
        } else if (action.kind === "disabled") {
          const updated = await api.setMediaDisabled(project.id, change.assetId, action.disabled);
          setMediaAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
        } else if (action.kind === "selection") {
          // Order writes for the same checkbox, even across overlapping bulk clicks.
          const requestKey = `${project.id}:${selectionKey}`;
          const previousRequest = mediaSelectionRequests.current.get(requestKey);
          const request = (async () => {
            if (previousRequest) await previousRequest.catch(() => null);
            if (!ownsSelection()) return null;
            return action.target === "stt"
              ? api.setMediaTranscriptionSelected(project.id, change.assetId, action.selected)
              : action.target === "training"
                ? api.setMediaTrainingSelected(project.id, change.assetId, action.selected)
                : action.target === "import"
                  ? api.setMediaImportSelected(project.id, change.assetId, action.selected)
                  : api.setMediaDiarizationSelected(project.id, change.assetId, action.selected);
          })();
          mediaSelectionRequests.current.set(requestKey, request);
          let updated;
          try { updated = await request; }
          finally { if (mediaSelectionRequests.current.get(requestKey) === request) mediaSelectionRequests.current.delete(requestKey); }
          if (updated && ownsSelection()) {
            const write = mediaSelectionWrites.current.get(selectionKey)!;
            mediaSelectionWrites.current.set(selectionKey, { ...write, pending: false });
            setMediaAssets((current) => current.map((item) => item.id === updated.id && selectionField ? { ...item, [selectionField]: updated[selectionField] } : item));
          }
        } else if (action.kind === "delete") {
          await api.removeProjectMedia(project.id, change.assetId);
          for (const id of relatedMediaIds(change.assetId)) permanentlyRemovedMediaIds.current.add(id);
          setMediaAssets((current) => withoutPermanentlyRemoved(current));
        } else if (action.kind === "restore") {
          const restored = await api.restoreProjectMedia(project.id, change.assetId);
          rememberMediaLifecycle(restored.id, restored.deletedAt ?? null);
          setMediaAssets((current) => current.map((item) => item.id === restored.id ? restored : item.sourceArchiveAssetId === restored.id ? { ...item, deletedAt: null } : item));
        } else {
          const recycled = await api.recycleProjectMedia(project.id, change.assetId);
          rememberMediaLifecycle(recycled.id, recycled.deletedAt ?? null);
          setMediaAssets((current) => current.map((item) => item.id === recycled.id ? recycled : item.sourceArchiveAssetId === recycled.id ? { ...item, deletedAt: recycled.deletedAt, transcriptionSelected: false, trainingSelected: false } : item));
        }
        completed.push(change.assetId);
      } catch (error) {
        if (action.kind === "selection" && selectionField && ownsSelection()) {
          const previous = beforeSelection.get(change.assetId);
          const write = mediaSelectionWrites.current.get(selectionKey)!;
          mediaSelectionWrites.current.set(selectionKey, { ...write, pending: false, selected: previous?.[selectionField] });
          if (previous) setMediaAssets((current) => current.map((item) => item.id === change.assetId ? { ...item, [selectionField]: previous[selectionField] } : item));
        }
        const message = error instanceof Error ? error.message : "Lỗi không xác định";
        if (action.kind === "delete" && /not found/i.test(message)) {
          for (const id of relatedMediaIds(change.assetId)) permanentlyRemovedMediaIds.current.add(id);
          setMediaAssets((current) => withoutPermanentlyRemoved(current));
          completed.push(change.assetId);
        } else failures.push(`${change.assetId}: ${message}`);
      }
    }
    if (action.kind === "delete" && selectedAssetIdRef.current && completed.includes(selectedAssetIdRef.current)) {
      moveOffAsset(withoutPermanentlyRemoved(mediaAssetsRef.current));
    }
    if (action.kind === "recycle" && selectedAssetId && completed.includes(selectedAssetId)) {
      moveOffAsset(mediaAssets.filter((item) => !item.deletedAt && !completed.includes(item.id)));
    }
    if ((action.kind === "annotations" || action.kind === "selection" && ["training", "import"].includes(action.target)) && completed.length) void refreshDatasetReadiness();
    setNotice(failures.length
      ? `Đã xử lý ${completed.length}/${changes.length} footage. Lỗi: ${failures.join("; ")}`
      : `Đã ${action.kind === "delete" ? "xóa hẳn" : action.kind === "restore" ? "restore" : action.kind === "recycle" ? "chuyển vào Recycle Bin" : action.kind === "disabled" ? action.disabled ? "tắt" : "bật" : action.kind === "selection" ? action.selected ? `chọn ${action.target.toUpperCase()} cho` : `bỏ ${action.target.toUpperCase()} của` : "cập nhật nhãn cho"} ${completed.length} footage.`);
  }

  function moveOffAsset(remaining: ProjectMediaAsset[]) {
    const next = remaining.find((item) => !item.deletedAt && !item.sourceArchiveAssetId && isImportedForWork(item, remaining)) ?? null;
    if (next) {
      applyMediaAsset(next, remaining);
      return;
    }
    setSelectedAssetId(null);
    setSelectedImportedTrackId(null);
    setObsTimelineActive(false);
    setTake(null);
    setScript("");
  }

  async function revealMediaAsset(asset: ProjectMediaAsset, location: "original" | "project") {
    try {
      await api.revealMediaFile(project.id, asset.id, location);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không mở được thư mục chứa footage");
    }
  }

  async function setMediaDisabled(asset: ProjectMediaAsset, disabled: boolean) {
    try {
      const updated = await Promise.all(relatedMediaIds(asset.id).map((id) => api.setMediaDisabled(project.id, id, disabled)));
      setMediaAssets((current) => current.map((item) => updated.find((result) => result.id === item.id) ?? item));
      setNotice(`${asset.name} ${disabled ? "đã tắt - không vào batch nào nữa" : "đã bật lại"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không đổi được trạng thái footage");
    }
  }

  async function restoreMediaAsset(asset: ProjectMediaAsset) {
    try {
      const restored = await api.restoreProjectMedia(project.id, asset.id);
      rememberMediaLifecycle(restored.id, restored.deletedAt ?? null);
      setMediaAssets((current) => current.map((item) => item.id === restored.id ? restored : item.sourceArchiveAssetId === restored.id ? { ...item, deletedAt: null } : item));
      setNotice(`Đã restore ${restored.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể restore footage");
    }
  }

  function sendSelectedToTraining() {
    const selectedCount = mediaAssets.filter((asset) => asset.trainingSelected && asset.importSelected !== false && !asset.deletedAt && !asset.disabled).length;
    if (!selectedCount) {
      setNotice("Hãy tick TRAIN cho ít nhất một footage.");
      return;
    }
    void selectPage("voice-training");
    setNotice(`Đã chuyển ${selectedCount} footage đã chọn sang Voice Training.`);
  }

  async function runAccurateTranscription() {
    if (!scriptAssetId) {
      setNotice("Hãy chọn footage trong Media Pool trước khi chạy STT kỹ.");
      return;
    }
    const asset = mediaAssets.find((item) => item.id === scriptAssetId);
    const choice = await processingChoice.choose("Speech to text", [scriptAssetId],
      new Set(asset?.transcriptionStatus === "complete" ? [scriptAssetId] : []));
    if (!choice) return;
    try {
      const selected = await api.setMediaTranscriptionSelected(project.id, scriptAssetId, true);
      const queued = await api.enqueueMediaTranscriptions(project.id, [scriptAssetId]);
      setMediaAssets((current) => current.map((asset) => {
        const replacement = queued.find((item) => item.id === asset.id);
        return replacement ?? (asset.id === selected.id ? selected : asset);
      }));
      setNotice(queued.length ? "Đã đưa footage vào hàng chờ STT nền." : "Footage này đang chạy hoặc đã có transcript.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không tạo được hàng chờ STT");
    }
  }

  async function runDiarization() {
    const targets = mediaAssets.filter((asset) => asset.diarizationSelected && asset.importSelected !== false
      && !asset.deletedAt && !asset.disabled && asset.status !== "no-audio" && asset.analysisPath
      && !["queued", "processing"].includes(asset.diarizationStatus ?? "idle")
      && !mediaAssets.some((child) => child.sourceArchiveAssetId === asset.id));
    if (!targets.length) {
      setNotice("Hãy tick Speaker Diarization cho ít nhất một footage hoặc track đã Import.");
      return;
    }

    if (!preferences.diarization.huggingfaceTokenConfigured) {
      setPreferencesOpen(true);
      setNotice("Speaker Diarization cần Hugging Face token lần đầu. Hãy chấp nhận model community-1, dán Read token rồi Lưu Preferences.");
      return;
    }
    const choice = await processingChoice.choose("Speaker Diarization", targets.map((asset) => asset.id),
      new Set(targets.filter((asset) => asset.diarizationStatus === "complete").map((asset) => asset.id)));
    if (!choice) return;
    try {
      const results = await Promise.allSettled(choice.ids.map((id) => api.enqueueMediaDiarization(project.id, id, null)));
      const queued = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setMediaAssets((current) => current.map((asset) => queued.find((item) => item.id === asset.id) ?? asset));
      const failed = results.length - queued.length;
      setNotice(`Đã đưa ${queued.length} track/footage vào Speaker Diarization.${failed ? ` ${failed} mục không thể bắt đầu; hãy kiểm tra đã hoàn tất STT.` : ""}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể chạy Speaker Diarization.");
    }
  }
  function scriptCommandTargets(assetIds?: string[]) {
    const ids = assetIds ?? (scriptAssetId ? [scriptAssetId] : []);
    const current = mediaAssetsRef.current;
    return [...new Map(ids.flatMap((id) => {
      const children = current.filter((asset) => asset.sourceArchiveAssetId === id && !asset.deletedAt && asset.importSelected !== false);
      return children.length ? children : current.filter((asset) => asset.id === id && !asset.deletedAt);
    }).map((asset) => [asset.id, asset])).values()];
  }
  async function exportSubtitles(mode: "sentence" | "word" | "table", assetIds?: string[]) {
    const targets = scriptCommandTargets(assetIds);
    if (!targets.length) { setNotice("Hãy chọn footage đã có transcript trước khi xuất."); return; }
    const results: string[] = [];
    for (const target of targets) {
      try {
        await wordWriteQueues.current.get(target.id);
        const selected = mediaAssetsRef.current.find((asset) => asset.id === target.id && !asset.deletedAt);
        if (!selected?.words.length) { results.push(`${target.name}: chưa có word timing.`); continue; }
        if (mode !== "table" && selected.wordTimingQuality === "needs-alignment") {
          results.push(`${target.name}: ${selected.wordTimingNote ?? "cần căn chỉnh word timing trước khi xuất SRT."}`); continue;
        }
        await api.exportProjectSubtitles(project.id, selected.id, mode);
        results.push(`${selected.name}: đã xuất ${mode === "table" ? "bảng Script CSV" : "SRT"} và tải file về máy.`);
      } catch (error) { results.push(`${target.name}: ${error instanceof Error ? error.message : "Không thể xuất transcript."}`); }
    }
    setNotice(results.join("\n"));
  }
  async function runAiReview(assetIds?: string[]) {
    if (aiReviewBusy) return;
    const targets = scriptCommandTargets(assetIds).filter((asset) => asset.transcriptionStatus === "complete" && Boolean(asset.text.trim()));
    if (!targets.length) { setNotice("AI fix chỉ khả dụng sau khi STT kỹ hoàn tất và đã có transcript."); return; }
    setAiReviewBusy(true);
    const results: string[] = [];
    try {
      for (const target of targets) {
        try {
          await wordWriteQueues.current.get(target.id);
          let selected = mediaAssetsRef.current.find((asset) => asset.id === target.id && !asset.deletedAt);
          if (!selected) continue;
          if (!assetIds && selected.id === scriptAssetId && selected.text !== scriptRef.current) {
            const saved = await api.updateMediaScript(project.id, selected.id, scriptRef.current, "user", take?.words);
            storeMediaAsset(saved);
            selected = saved;
            setScriptDirty(false);
          }
          const version = wordWriteVersions.current.get(selected.id);
          const reviewed = await api.reviewMediaTranscript(project.id, selected.id);
          // A review is a candidate. An edit or removal while AI is running must
          // never be overwritten by the earlier request's asset snapshot.
          const current = mediaAssetsRef.current.find((asset) => asset.id === selected.id && !asset.deletedAt);
          if (!current) continue;
          const changed = wordWriteVersions.current.get(selected.id) !== version || current.text !== selected.text;
          const aiRevisions = reviewed.asset.revisions.filter((revision) => revision.source === "ai");
          const merged = changed ? { ...current, aiReviewStatus: reviewed.asset.aiReviewStatus,
            revisions: [...current.revisions.filter((revision) => !aiRevisions.some((candidate) => candidate.id === revision.id)), ...aiRevisions] } : reviewed.asset;
          mediaAssetsRef.current = mediaAssetsRef.current.map((asset) => asset.id === merged.id ? merged : asset);
          setMediaAssets(mediaAssetsRef.current);
          if (reviewed.status === "skipped") results.push(`${selected.name}: AI fix chưa được cấu hình. Mở Windows → Preferences để nhập endpoint, model và API key.`);
          else if (reviewed.status === "complete") results.push(`${selected.name}: ${reviewed.reviewedText.trim() !== selected.text.trim() ? "AI đã tạo phương án sửa. Chọn từng cụm vàng/xanh trực tiếp trong Script." : "AI không thấy lỗi nhận diện cần sửa."}`);
          else results.push(`${selected.name}: ${reviewed.error ?? "AI fix không hoàn tất."}`);
        } catch (error) { results.push(`${target.name}: ${error instanceof Error ? error.message : "Không thể chạy AI fix."}`); }
      }
      setNotice(results.join("\n"));
    } finally { setAiReviewBusy(false); }
  }
  async function generateVoice() {
    if (activePage === "voice-manipulator" && manipulatorMode !== "voice-over") {
      setNotice("Chọn Voice Over để tạo lời đọc; Voice Patch có bảng xử lý riêng.");
      return;
    }
    if (generationStartInFlight.current || voiceScriptJobRef.current?.status === "running") return;
    if (!voiceScript.ready || voiceScript.error) { setNotice(voiceScript.error ?? "Đang mở Script trong project…"); return; }
    const mismatch = generationEngine && voiceScriptRows.find((row) => row.text.trim() && row.voiceId && projectVoices.some((voice) => voice.id === row.voiceId && voice.engine !== generationEngine));
    if (mismatch) {
      const voice = projectVoices.find((item) => item.id === mismatch.voiceId);
      setNotice(`Câu “${mismatch.text.slice(0, 40)}” đang gán voice ${voice?.name ?? "khác"} (${voice?.engine ?? "engine không rõ"}). Chọn Tự động hoặc đổi voice cho câu này.`);
      return;
    }
    const selectedGenerator = generationEngine ? generatorForEngine(voiceGenerators, generationEngine) : null;
    if (generationEngine && !selectedGenerator?.available) {
      setNotice(selectedGenerator?.status ?? "Engine tạo giọng này chưa có trong catalog hiện tại.");
      return;
    }
    const offered = voicesInCategory(projectVoices, voiceCategory).filter((voice) => !generationEngine || voice.engine === generationEngine);
    const readiness = scriptReadiness(voiceScriptRows, offered);
    if (readiness.problem) {
      setNotice(readiness.problem);
      return;
    }
    const pendingDirection = voiceScriptRows.find((row) => Object.entries(effectiveScriptSettings(voiceScript.document, row))
      .some(([key, value]) => key !== "locked" && key !== "note" && key !== "duration" && key !== "gainDb" && value != null && !(key === "delivery" && value === "neutral") && !(key === "emotion" && value === "normal")));
    if (pendingDirection) {
      setNotice("Sắc thái/âm lượng đã lưu nhưng chưa có processor đã kiểm chứng. Bỏ các giá trị này để tạo giọng; thời lượng đã được hỗ trợ.");
      return;
    }
    generationStartInFlight.current = true;
    const pendingId = `generation-${crypto.randomUUID()}`;
    setPendingVoiceOutput({ id: pendingId, name: `Script · ${readiness.rows.length} đoạn`,
      text: readiness.rows.map((row) => row.text).join("\n"), status: "starting", totalRows: readiness.rows.length });
    setGenerating(true);
    voiceScriptJobRef.current = null;
    setVoiceScriptJob(null);
    // One generator per engine among the voices the rows use, each with the
    // values set in the panel, and reading speed from Control Rack where the
    // generator has such a setting.
    const parameters: Record<string, Record<string, TrainingParameterValue>> = {};
    const rowParameters: Record<string, Record<string, TrainingParameterValue>> = {};
    for (const row of voiceScriptRows) {
      const voice = row.text.trim() ? resolveRowVoice(row, offered) : null;
      const generator = voice ? generatorForEngine(voiceGenerators, voice.engine) : null;
      if (!generator || !voice) continue;
      parameters[generator.id] ??= {
        ...(generatorParameters[generator.id] ?? {}),
        ...(generator.parameters.some((spec) => spec.key === "speed") ? { speed } : {}),
      };
      const effective = Object.fromEntries(generator.parameters.map((spec) => [spec.key, parameterValue(spec, parameters[generator.id])]));
      rowParameters[row.id] = { ...effective, language: effective.language || voice.language || null, speed: effective.speed ?? null };
    }
    try {
      const savedScript = await voiceScript.flush();
      if (JSON.stringify({ ...savedScript, revision: 0 }) !== JSON.stringify({ ...voiceScript.document, revision: 0 })) throw new Error("Script đã đổi trong lúc lưu. Bấm Tạo voice lại với nội dung hiện tại.");
      const [timingSnapshot, bindingSnapshot] = await Promise.all([api.getTimingPlans(project.id), api.getReferenceBindings(project.id)]);
      const hasDuration = voiceScript.document.settings.duration != null || voiceScript.document.segments.some((segment) => segment.settings.duration != null) || voiceScriptRows.some((row) => row.settings?.duration != null || row.settings?.locked?.includes("duration")) || timingSnapshot.plans.length > 0 || bindingSnapshot.bindings.some((binding) => binding.sources.some((source) => source.properties.includes("timing") && source.strength > 0));
      const versionBook = activePage === "voice-manipulator" ? await voiceVersions.flush({ generatorParameters, generationEngine, generationCategory: voiceCategory, speed, gain }) : null;
      const version = versionBook?.sessions.flatMap((session) => session.versions).find((item) => item.id === versionBook.activeVersionId);
      if (activePage === "voice-manipulator" && !version) throw new Error("Tạo New Session hoặc chọn Version trước khi Generate Full.");
      const choice = activePage === "voice-manipulator" ? { ids: readiness.rows.map((row) => row.id), rerunAll: true } : await processingChoice.choose("Generate Voice", readiness.rows.map((row) => row.id),
        hasDuration ? new Set<string>() : completedGenerationRows(readiness.rows, voiceOutputs, parameters, rowParameters));
      if (!choice) {
        setPendingVoiceOutput(null);
        setGenerating(false);
        return;
      }
      const selectedRows = readiness.rows.filter((row) => choice.ids.includes(row.id));
      setPendingVoiceOutput((current) => current ? { ...current, text: selectedRows.map((row) => row.text).join("\n"), totalRows: selectedRows.length } : current);
      acceptVoiceScriptJob(await api.readVoiceScript(project.id, { ...(version ? { versionId: version.id, versionRevision: version.state.revision } : {}), scriptRevision: savedScript.revision, timingRevision: timingSnapshot.revision, referenceRevision: bindingSnapshot.revision, rows: selectedRows.map((row) => {
        const settings = effectiveScriptSettings(voiceScript.document, voiceScriptRows.find((item) => item.id === row.id)!);
        const hasSettings = Object.entries(settings).some(([key, value]) => key !== "locked" && value != null);
        return { ...row, ...(hasSettings ? { settings } : {}) };
      }), parameters, forceRegenerate: choice.rerunAll }));
    } catch (error) {
      setGenerating(false);
      const detail = error instanceof Error ? error.message : "Không bắt đầu đọc Script được";
      setPendingVoiceOutput((current) => current?.id === pendingId ? { ...current, status: "error", detail } : current);
      setNotice(detail);
    } finally {
      generationStartInFlight.current = false;
    }
  }

  async function generateFixOnly() {
    if (generationStartInFlight.current || generating) return;
    generationStartInFlight.current = true;
    const pendingId = `generation-fix-${crypto.randomUUID()}`;
    try {
      const book = await voiceVersions.flush({ generatorParameters, generationEngine, generationCategory: voiceCategory, speed, gain });
      const version = book?.sessions.flatMap((session) => session.versions).find((item) => item.id === book.activeVersionId);
      if (!version) throw new Error("Chọn Version đã Generate Full trước khi tạo Fix.");
      setPendingVoiceOutput({ id: pendingId, name: "Generate Fix Only", text: "Các đoạn vừa sửa trong Version hiện tại", status: "starting", totalRows: 0 });
      setGenerating(true);
      voiceScriptJobRef.current = null;
      setVoiceScriptJob(null);
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/voice-output-sessions/versions/${version.id}/fix`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: version.state.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Không tạo được đoạn Fix.");
      acceptVoiceScriptJob(result as VoiceScriptJob);
    } catch (error) {
      setGenerating(false);
      const detail = error instanceof Error ? error.message : String(error);
      setPendingVoiceOutput((current) => current?.id === pendingId ? { ...current, status: "error", detail } : current);
      setNotice(detail);
    }
    finally { generationStartInFlight.current = false; }
  }

  function openVoiceOutput(output: VoiceOutput, loadScript = true) {
    ++mediaOpenRevision.current;
    saveResumeSource(project.id, { kind: "output", id: output.id });
    // Opened for listening on the Manipulator's own timeline. The footage open
    // in Speech to Text stays open there. An output read from a Script brings
    // that Script back with it, so rows, timestamps and subtitles all describe
    // the audio being played.
    setOutputTake({ id: output.id, name: output.name, url: `/api/projects/${project.id}/voice-outputs/${output.id}/audio`, duration: output.duration, text: output.text, words: output.words ?? [], wordTimingQuality: output.wordTimingQuality ?? undefined, wordTimingNote: output.wordTimingNote ?? null });
    if (loadScript && output.segments?.length) setVoiceScriptRows(groupLegacyScript({ ...migrateScript(rowsFromOutput(output)),
      turnGroupingVersion: output.parameters.turnGroupingVersion === 1 ? 1 : 0 }).rows);
  }

  async function refreshChanger() {
    if (typeof api.getVoiceChangers !== "function") return;
    try {
      const [engines, preflight, status] = await Promise.all([api.getVoiceChangers(), api.getVoiceChangerPreflight(), api.getVoiceChangerStatus()]);
      setVoiceChangers(engines);
      setChangerPreflight(preflight);
      setChangerStatus(status);
      setChangerSettings((current) => {
        const hostApi = current.hostApi ?? (preflight.devices.some((device) => device.hostApi === "Windows WASAPI") ? "Windows WASAPI" : preflight.devices[0]?.hostApi ?? null);
        const listed = preflight.devices.filter((device) => !hostApi || device.hostApi === hostApi);
        const inputs = listed.filter((device) => device.maxInputChannels > 0);
        const outputs = listed.filter((device) => device.maxOutputChannels > 0);
        // Found again by name first: device numbers shift when a device is plugged in or removed.
        const known = (index: number | null, list: typeof inputs, name?: string | null) => (name ? list.find((device) => device.name === name)?.index : undefined)
          ?? (index !== null && !name && list.some((device) => device.index === index) ? index : null);
        return {
          ...current,
          hostApi,
          engineId: engines.some((engine) => engine.id === current.engineId) ? current.engineId : engines.find((engine) => engine.available)?.id ?? null,
          inputDevice: known(current.inputDevice, inputs, current.inputDeviceName),
          virtualDevice: known(current.virtualDevice, outputs, current.virtualDeviceName) ?? outputs.filter((device) => device.virtualCable).sort((left, right) => Number(/16 ch/iu.test(left.name)) - Number(/16 ch/iu.test(right.name)))[0]?.index ?? null,
          speakerDevice: known(current.speakerDevice, outputs, current.speakerDeviceName),
        };
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không kiểm tra được thiết bị Voice Changer");
    }
  }

  async function startChanger() {
    const engine = voiceChangers.find((item) => item.id === changerSettings.engineId);
    if (!engine || changerSettings.inputDevice === null) return;
    const speakerVoices = projectVoices.filter((voice) => voice.speakerProfileId === selectedVoice);
    const voice = speakerVoices.find((item) => item.id === changerSettings.voiceId) ?? speakerVoices[0] ?? null;
    setChangerBusy(true);
    try {
      setChangerStatus(await api.startVoiceChanger(project.id, {
        engineId: engine.id,
        voiceId: voice?.id ?? null,
        inputDevice: changerSettings.inputDevice,
        virtualDevice: changerSettings.virtualDevice,
        speakerDevice: changerSettings.speakerDevice,
        inputDeviceName: changerSettings.inputDeviceName ?? null,
        virtualDeviceName: changerSettings.virtualDeviceName ?? null,
        speakerDeviceName: changerSettings.speakerDeviceName ?? null,
        hostApi: changerSettings.hostApi ?? null,
        monitor: changerSettings.monitor,
        parameters: changerSettings.parameters[engine.id] ?? {},
      }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không bắt đầu đổi giọng được");
    } finally {
      setChangerBusy(false);
    }
  }

  async function stopChanger() {
    setChangerBusy(true);
    try {
      const { status, recording } = await api.stopVoiceChanger();
      setChangerStatus(status);
      if (recording) adoptChangerRecording(recording);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không dừng được Voice Changer");
    } finally {
      setChangerBusy(false);
    }
  }

  async function startChangerRecording() {
    try {
      setChangerStatus(await api.startChangerRecording(project.id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không bắt đầu ghi được");
    }
  }

  async function stopChangerRecording() {
    setChangerBusy(true);
    try {
      adoptChangerRecording(await api.stopChangerRecording(project.id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không lưu được bản ghi");
    } finally {
      setChangerBusy(false);
    }
  }

  function adoptChangerRecording(recording: VoiceChangerRecording) {
    setChangerRecordings((current) => [recording, ...current.filter((item) => item.id !== recording.id)]);
    openChangerRecording(recording);
    setNotice(`Đã lưu ${recording.duration.toFixed(1)} giây · 2 kênh · đã bù ${Math.round(recording.delayMs + (recording.refinedDelayMs ?? 0))} ms trễ.`);
  }

  function openChangerRecording(recording: VoiceChangerRecording) {
    setRecordingTake({ id: recording.id, name: recording.name, url: `/api/projects/${project.id}/voice-changer/recordings/${recording.id}/audio`, duration: recording.duration, words: [] });
  }

  async function deleteChangerRecording(recording: VoiceChangerRecording) {
    try {
      await api.deleteChangerRecording(project.id, recording.id);
      setChangerRecordings((current) => current.filter((item) => item.id !== recording.id));
      if (recordingTake?.id === recording.id) setRecordingTake(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không xoá được bản ghi");
    }
  }

  async function exportVoiceOutput(output: VoiceOutput, mode: VoiceOutputExportMode) {
    const isActive = output.id === outputTake?.id;
    if (isActive && voiceEdits.packet?.document.cursor && mode !== "audio") {
      setNotice("Bản preview đã giãn chưa được Fix/căn lại lời. Chưa xuất subtitle theo mốc nguồn cũ."); return;
    }
    if (mode === "line" && !output.segments?.length) {
      setNotice("Voice Output này chưa có mốc thời gian từng dòng Script.");
      return;
    }
    if (mode !== "audio" && mode !== "line" && !output.words?.length) {
      setNotice("Voice Output này chưa có word timing để xuất SRT từng từ hoặc theo câu.");
      return;
    }
    try {
      const result = mode === "audio"
        ? isActive && (voiceRender.packet || voiceEdits.packet?.document.cursor)
          ? await api.downloadVoiceArtifact(voiceRender.packet?.audioUrl ?? voiceEdits.packet!.audioUrl, `${output.id}-render.wav`)
          : await api.downloadVoiceOutputAudio(project.id, output.id)
        : await api.exportVoiceOutputSubtitles(project.id, output.id, mode);
      const skipped = result?.skippedCues ? ` Đã bỏ ${result.skippedCues} cue có timing không đáng tin.` : "";
      setNotice((mode === "audio" ? `Đã gửi WAV của ${output.name} tới trình duyệt.`
        : mode === "table" ? "Đã gửi bảng Script CSV tới trình duyệt."
          : `Đã gửi SRT ${mode === "line" ? "từng dòng" : mode === "word" ? "từng từ" : "theo câu"} của ${output.name} tới trình duyệt.`) + skipped);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể xuất Voice Output.");
    }
  }

  async function deleteVoiceOutput(output: VoiceOutput) {
    try {
      await api.deleteVoiceOutput(project.id, output.id);
      setVoiceOutputs((current) => current.filter((item) => item.id !== output.id));
      if (outputTake?.id === output.id) setOutputTake(null);
      setNotice(`Đã xoá ${output.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không xoá được Voice Output");
    }
  }

  async function deleteChangerRecordings(recordings: VoiceChangerRecording[]) {
    const results = await Promise.allSettled(recordings.map((recording) => api.deleteChangerRecording(project.id, recording.id)));
    const removedIds = new Set(recordings.filter((_, index) => results[index].status === "fulfilled").map((recording) => recording.id));
    if (removedIds.size) {
      setChangerRecordings((current) => current.filter((recording) => !removedIds.has(recording.id)));
      if (recordingTake?.id && removedIds.has(recordingTake.id)) setRecordingTake(null);
    }
    const failed = recordings.filter((_, index) => results[index].status === "rejected").map((recording) => recording.name);
    setNotice(failed.length
      ? `Đã xóa ${removedIds.size}/${recordings.length} bản ghi Voice Changer; chưa xóa được: ${failed.join(", ")}.`
      : `Đã xóa ${removedIds.size} bản ghi Voice Changer.`);
  }

  async function deleteVoiceOutputs(outputs: VoiceOutput[]) {
    const results = await Promise.allSettled(outputs.map((output) => api.deleteVoiceOutput(project.id, output.id)));
    const removed = new Set(outputs.filter((_, index) => results[index].status === "fulfilled").map((output) => output.id));
    setVoiceOutputs((current) => current.filter((output) => !removed.has(output.id)));
    const activeOutputId = outputTake?.id;
    if (activeOutputId && removed.has(activeOutputId)) setOutputTake(null);
    setNotice(results.every((result) => result.status === "fulfilled")
      ? `Đã xoá ${removed.size} Voice Output.`
      : `Đã xoá ${removed.size}/${outputs.length} Voice Output; các mục lỗi vẫn được giữ lại.`);
  }

  function handleLiveTranscript(text: string, active: boolean) {
    setLiveTranscriptActive(active);
    if (active) {
      setScript(text);
      setScriptDirty(false);
    }
  }

  async function savePreferences(next: AppPreferences) {
    setPreferencesSaving(true);
    try {
      const saved = await api.savePreferences(next);
      setPreferences(saved);
      setPreferencesOpen(false);
      setNotice(saved.aiReview.enabled && saved.aiReview.apiKeyConfigured ? "Đã lưu Preferences: AI review và hiển thị cảm xúc trong Script đã được cập nhật." : "Đã lưu Preferences. AI review sẽ bỏ qua cho đến khi đủ endpoint, model và API key.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không lưu được Preferences");
    } finally {
      setPreferencesSaving(false);
    }
  }

  const selectedMediaAsset = mediaAssets.find((asset) => asset.id === selectedAssetId) ?? null;
  // Recycled footage can be played, read and zoomed, but not changed. One gate
  // in front of every write is worth more than a disabled attribute on each
  // control: a control that is added later is guarded by default.
  const previewingRecycled = Boolean(selectedMediaAsset?.deletedAt);
  function blockedByRecycleBin() {
    if (!previewingRecycled) return false;
    setNotice("Footage này đang ở Recycle Bin - chỉ xem được. Restore trước khi sửa.");
    return true;
  }
  const scriptMediaAsset = mediaAssets.find((asset) => asset.id === scriptAssetId) ?? selectedMediaAsset;
  const latestAiRevision = [...(scriptMediaAsset?.revisions ?? [])].reverse().find((revision) => revision.source === "ai") ?? null;
  const latestLiveRevision = [...(selectedMediaAsset?.revisions ?? [])].reverse().find((revision) => revision.source === "record") ?? null;
  // Voice Manipulator follows Voice Training until the user or an imported
  // Collection voice chooses a generation category of its own.
  const voiceCategory = generationCategoryOverride ?? categoryOf(selectedTrainingModel(trainingModels, trainingCatalog.settings));
  const voiceVersions = useVoiceVersions({ projectId: project.id, script: voiceScript,
    config: { generatorParameters, generationEngine, generationCategory: voiceCategory, speed, gain },
    onRestoreConfig: (config) => {
      setGeneratorParameters((config.generatorParameters ?? {}) as Record<string, Record<string, TrainingParameterValue>>);
      setGenerationEngine(typeof config.generationEngine === "string" ? config.generationEngine : null);
      setGenerationCategoryOverride(config.generationCategory === "train" || config.generationCategory === "clone" ? config.generationCategory : null);
      setSpeed(typeof config.speed === "number" ? config.speed : 1);
      setGain(typeof config.gain === "number" ? config.gain : 0);
    },
    onOpenOutput: (output) => {
      if (output) { setVoiceOutputs((current) => [output, ...current.filter((item) => item.id !== output.id)]); openVoiceOutput(output, false); }
      else setOutputTake(null);
      void api.listVoiceOutputs(project.id).then((items) => { if (activeMediaProjectId.current === project.id) setVoiceOutputs(items); }).catch(() => undefined);
    },
  });
  const canRunAiReview = Boolean(scriptMediaAsset?.text.trim() && scriptMediaAsset.transcriptionStatus === "complete" && !liveTranscriptActive);
  function scopeVoiceSelection(selection: WordSelection): WordSelection {
    if (activePage !== "voice-manipulator" || (!selection.indexes.length && !selection.ranges?.length && !selection.rowIds?.length)) return selection;
    const output = voiceOutputs.find((item) => item.id === outputTake?.id);
    const untimed = Boolean(selection.rowIds?.length && !selection.ranges?.length && !selection.indexes.length);
    if (selection.scope?.kind === "voice-output" && output && selection.scope.id !== output.id) return EMPTY_SELECTION;
    return { ...selection, wordIds: output && !untimed ? selection.indexes.map((index) => `${output.id}:word:${index}`) : [], scope: output && !untimed
      ? { kind: "voice-output", id: output.id, revision: output.createdAt }
      : { kind: "script", id: project.id, revision: String(voiceScript.document.revision) } };
  }

  function openReferenceContext(request: ReferenceContextRequest) {
    try {
      if (voiceEdits.packet?.document.cursor && request.selection.scope?.kind !== "script") throw new Error("Vùng đang dùng thời gian preview đã giãn. Gán reference theo câu trong Script hoặc Undo giãn trước khi chọn mốc nguồn.");
      const selection = scopeVoiceSelection(request.selection);
      const targets = captureReferenceTargets(selection, voiceOutputs.find((output) => output.id === outputTake?.id) ?? null, voiceScript.document);
      if (!targets.length || !selection.scope) throw new Error("Quét chọn một vùng waveform, subtitle hoặc Script trước khi gán reference.");
      if (selection.scope.kind === "script" && !voiceScript.isSaved) throw new Error(voiceScript.error ?? "Script đang lưu vào project. Mở lại menu sau khi lưu xong.");
      const id = crypto.randomUUID();
      referenceRequestId.current = id;
      setWordSelection(selection);
      const frozen: ReferenceSession = structuredClone({ id, scope: selection.scope, targets, request: { ...request, selection }, expectedRevision: null, existing: [], inherited: referenceInheritedSettings(targets, voiceScript.document) });
      setReferenceSession(frozen);
      void api.getReferenceBindings(project.id).then((document) => {
        if (referenceRequestId.current !== id) return;
        setReferenceSession({ ...frozen, expectedRevision: document.revision, existing: document.bindings });
      }).catch((reason) => {
        if (referenceRequestId.current === id) { referenceRequestId.current = null; setReferenceSession(null); setNotice(String(reason)); }
      });
    } catch (reason) { setNotice(String(reason)); }
  }

  const context = useMemo<StudioContext>(() => ({
    onPatchedVoiceOutput: (output: VoiceOutput) => {
      setVoiceOutputs((current) => [output, ...current.filter((item) => item.id !== output.id)]);
      setWordSelection(EMPTY_SELECTION);
      void voiceVersions.adoptOutput(output);
      setNotice("Đã lưu bản vá vào Voice Output; Script của Version hiện tại được giữ nguyên.");
    },
    onDerivedVoiceOutput: (output: VoiceOutput) => {
      setVoiceOutputs((current) => [output, ...current.filter((item) => item.id !== output.id)]);
      setWordSelection(EMPTY_SELECTION);
      void voiceVersions.adoptOutput(output);
      setNotice("Đã mở bản Fix mới; nguồn vẫn nằm trong Voice Output.");
    },
    onNavigateVoiceOutput: (id: string, loadScript = false) => {
      const source = voiceOutputs.find((item) => item.id === id);
      if (!source) { setNotice("Nguồn không còn trong Voice Output."); return; }
      setWordSelection(EMPTY_SELECTION); openVoiceOutput(source, loadScript);
    },
    voiceRender,
    voiceEdits,
    editedVoiceOutput: editedOutput,
    workflow: activePage,
    script,
    selectedVoice,
    speed,
    gain,
    take: pageTake,
    mediaAssets,
    selectedAssetId,
    selectedImportedTrackId,
    selectedScriptAssetIds,
    onScriptSelectionChange: selectMediaList,
    onAssignScriptWords: (assetId, indexes, profileId) => {
      scriptSpeakerAssignments.current.push({ assetId, indexes, profileId });
      if (scriptSpeakerAssignments.current.length === 1) queueMicrotask(() => {
        const assignments = scriptSpeakerAssignments.current.splice(0);
        if (activeMediaProjectId.current !== project.id) return;
        scriptEditHistory.current.batch(() => assignments.forEach((assignment) => { void assignScriptWords(assignment.assetId, assignment.indexes, assignment.profileId); }));
      });
    },
    onSelectImportedTrack: selectImportedTrack,
    mediaBusy,
    recordingPreview,
    obsTimelineActive,
    obsCaptureEnabled,
    captureSource,
    obsTimelineRecordingId,
    obsTranscriptRows,
    obsTranscriptError,
    obsPlayheadSeconds,
    obsSeekRequest,
    obsOverlapSelection,
    onObsTimelineRecordingChange: (recordingId) => {
      setObsTimelineRecordingId(recordingId);
      if (!selectedAssetId && recordingId) saveResumeSource(project.id, { kind: "obs", id: recordingId });
    },
    onObsTranscriptSeek: (row, seconds) => {
      if (seconds === undefined) setObsOverlapSelection(null);
      setObsSeekRequest((current) => ({
        recordingId: row.recordingId, channelId: row.channelId, seconds: seconds ?? row.startSeconds,
        serial: (current?.serial ?? 0) + 1,
      }));
    },
    onObsOverlapSelect: (selection) => {
      setObsOverlapSelection(selection);
      if (selection && selectedImportedTrackId) {
        const parent = mediaAssets.find((asset) => asset.id === selectedAssetId);
        if (parent?.obsRecordingId === selection.recordingId) {
          flushCurrentMediaDraft();
          applyMediaAsset(parent, mediaAssets);
        }
      }
    },
    onObsArchivedOverlapSelect: (trackId, selection) => {
      setObsOverlapSelection(selection);
      setObsSeekRequest((current) => ({ recordingId: selection.recordingId, assetId: trackId,
        seconds: selection.startSeconds, serial: (current?.serial ?? 0) + 1 }));
    },
    onObsPlayheadChange: (seconds) => setObsPlayheadSeconds(seconds),
    onObsTimelineCutsChange: (assetIds, ranges) => blockedByRecycleBin() ? Promise.resolve(false) : updateObsTimelineCuts(assetIds, ranges),
    onObsTimelineSourceChange: (source) => {
      setCaptureSource(source);
      setObsTimelineActive(source === "obs-livelink");
      if (source !== "obs-livelink") setObsOverlapSelection(null);
    },
    onOpenObsRecording: (recordingId) => openObsRecording(recordingId),
    onOpenObsTrack: (recordingId, channelId) => openObsRecording(recordingId, channelId),
    onObsArchiveReady: async (recordingId) => {
      const assets = await listProjectMediaWithLifecycleFence(project.id);
      const archived = assets.find((asset) => asset.obsRecordingId === recordingId && asset.sourceExtension === ".mka");
      if (!archived) {
        throw new Error(`OBS archive ${recordingId} is not in Media Pool yet`);
      }
      setPendingObsRecording((current) => current?.recordingId === recordingId ? null : current);
      setMediaAssets((current) => {
        const known = new Set(current.map((asset) => asset.id));
        const added = assets.filter((asset) => !known.has(asset.id));
        return added.length ? [...added, ...current] : current;
      });
      if (obsTimelineActive && obsTimelineRecordingId === recordingId && selectedAssetId === null)
        applyMediaAsset(archived, assets);
    },
    liveTranscriptActive,
    liveTranscriptText: latestLiveRevision?.text ?? null,
    emotionStyle: preferences.emotionStyle,
    clippingHighlightAutoHide: preferences.timeline?.clippingHighlightAutoHide ?? false,
    scrubPreviewPosition: preferences.timeline?.scrubPreviewPosition ?? "center",
    aiReviewText: latestAiRevision?.text ?? null,
    aiReviewKey: latestAiRevision?.id ?? null,
    aiReviewBusy,
    canRunAiReview,
    trainingCatalog,
    profileSchema,
    datasetReadiness,
    datasetBusy,
    projectId: project.id,
    projectName: project.name,
    voiceOutputs,
    activeOutputId: voiceOutputs.some((output) => output.id === outputTake?.id) ? outputTake?.id ?? null : null,
    onOpenVoiceOutput: openVoiceOutput,
    voiceVersions,
    onGenerateFixOnly: () => void generateFixOnly(),
    onVoiceOutputVersionCreated: (output) => setVoiceOutputs((current) => [output, ...current]),
    onVoiceOutputSessionCreated: () => setOutputTake(null),
    onDeleteVoiceOutput: (output) => void deleteVoiceOutput(output),
    onDeleteVoiceOutputs: (outputs) => void deleteVoiceOutputs(outputs),
    sttEngines,
    asrAdapters,
    projectVoices,
    voiceGenerators,
    generationEngine,
    onGenerationEngineChange: setGenerationEngine,
    generatorParameters,
    generating,
    onGeneratorParametersChange: (generatorId, parameters) => setGeneratorParameters((current) => ({ ...current, [generatorId]: parameters })),
    onVoiceCategoryChange: chooseGenerationCategory,
    voiceScriptRows,
    onVoiceScriptRowsChange: setVoiceScriptRows,
    onReferenceChange: async (ids, selected) => {
      const updated = await api.setMediaReferenceSelected(project.id, ids, selected);
      if (activeMediaProjectId.current !== project.id) return;
      const byId = new Map(updated.map((asset) => [asset.id, asset]));
      setMediaAssets((current) => current.map((asset) => {
        const changed = byId.get(asset.id);
        return changed ? { ...asset, referenceSelected: changed.referenceSelected, updatedAt: changed.updatedAt } : asset;
      }));
    },
    voiceScriptDocument: voiceScript.document,
    manipulatorMode, speechToTextHost,
    onSpeechToTextHostChange: setSpeechToTextHost,
    voiceScriptSettingsHost,
    onVoiceScriptSettingsHostChange: setVoiceScriptSettingsHost,
    onVoiceScriptDocumentChange: voiceScript.update,
    voiceScriptSaveError: voiceScript.error,
    onReloadVoiceScript: voiceScript.reload,
    voiceCategory,
    voiceScriptJob,
    pendingVoiceOutput,
    onDismissPendingVoiceOutput: (id) => setPendingVoiceOutput((current) => current?.id === id && current.status !== "starting" && current.status !== "running" ? null : current),
    onExportVoiceOutput: (output, mode) => void exportVoiceOutput(output, mode),
    voiceChangers,
    changerPreflight,
    changerSettings,
    onChangerSettingsChange: setChangerSettings,
    changerStatus,
    changerBusy,
    changerRecordings,
    onStartChanger: () => void startChanger(),
    onStopChanger: () => void stopChanger(),
    onRefreshChanger: () => void refreshChanger(),
    onStartChangerRecording: () => void startChangerRecording(),
    onStopChangerRecording: () => void stopChangerRecording(),
    onOpenChangerRecording: openChangerRecording,
    onDeleteChangerRecording: (recording) => void deleteChangerRecording(recording),
    onDeleteChangerRecordings: (recordings) => void deleteChangerRecordings(recordings),
    trainingRuns,
    activityTasks,
    activityEvents,
    trainingBatch,
    trainingProgressByRun,
    trainingRuntime,
    trainingModels,
    onTrainingOutputsChanged: () => void refreshTrainingOutputs(),
    onDeleteVoice: (voice) => void deleteProjectVoice(voice),
    onDeleteVoices: (voices) => void deleteProjectVoices(voices),
    onDeleteSpeaker: (speaker) => void deleteSpeakerProfile(speaker),
    onDeleteSpeakers: (speakers) => void deleteSpeakerProfiles(speakers),
    onDeleteEnvironment: (profile) => deleteEnvironmentProfile(profile),
    onDeleteEnvironments: (profiles) => deleteEnvironmentProfiles(profiles),
    onAssignAssetSpeaker: (assetId, speakerProfileId) => void assignAssetSpeaker(assetId, speakerProfileId),
    onSelectPage: (page) => void selectPage(page),
    onCompileDataset: () => void compileDataset(),
    onStartTrainingRun: () => void startTrainingRun(),
    readingPacks,
    readingSession: readingSession
      ? {
          id: readingSession.id, revision: readingSession.revision, speakerName: readingSession.speakerName,
          packTitle: readingSession.packTitle,
          mode: readingSession.plan.mode,
          card: readingSession.plan.cards[readingSession.cardIndex] ?? null,
          cardNumber: Math.min(readingSession.cardIndex + 1, readingSession.plan.cards.length),
          cardTotal: readingSession.plan.cards.length,
          coverage: coverageFor(readingSession.plan, readingSession.recordedSecondsByCard),
          secondsSinceBreak: readingSession.secondsSinceBreak,
        }
      : null,
    readingBusy,
    readingPending: Boolean(reading.pendingTake),
    onRetryReadingTake: () => { if (reading.pendingTake) void processCapturedAudio(reading.pendingTake); },
    onStartReadingSession: (packId, emotions, mode, speakerProfileId) => void reading.start(packId, emotions, mode, speakerProfileId),
    onEndReadingSession: () => void reading.end(),
    onSkipCard: () => void reading.skip(),
    wordSelection,
    patchSourceSelection,
    onWordSelectionChange: (selection) => {
      setWordSelection(scopeVoiceSelection(selection));
    },
    referenceDocument, referenceError, productionNavigation, voiceScriptSaved: voiceScript.isSaved,
    onResolveReference: async (binding) => { if (!referenceDocument) throw new Error("Reference đang tải."); return api.resolveReferenceBinding(project.id, binding.id, referenceDocument.revision); },
    onReloadReferences: () => void reloadReferences(),
    onNavigateReference: (binding) => {
      if (binding.scope.kind === "voice-output") {
        const output = voiceOutputs.find((item) => item.id === binding.scope.id);
        if (!output || output.createdAt !== binding.scope.revision) { setNotice("Không tìm thấy Voice Output của vùng này."); return; }
        // Navigation never replaces the current Script draft with old output text.
        const rowIds = binding.target.rowIds.length ? binding.target.rowIds : output.segments?.filter((segment) => binding.target.start !== null && segment.end > binding.target.start && segment.start < binding.target.end!).map((segment) => segment.rowId) ?? [];
        if (rowIds.some((id) => !voiceScriptRows.some((row) => row.id === id))) { setNotice("Câu đích đã bị xóa hoặc tách/gộp. Gán lại reference vào câu hiện tại."); return; }
        const changedText = rowIds.some((id) => {
          const segment = output.segments?.find((part) => part.rowId === id), row = voiceScriptRows.find((part) => part.id === id);
          return segment && row && segment.text.trim().replace(/\s+/gu, " ") !== row.text.trim().replace(/\s+/gu, " ");
        });
        if (changedText) { setNotice("Lời thoại đã khác vùng audio được gán. Gán lại reference vào Script hiện tại."); return; }
        openVoiceOutput(output, false);
        const selection = referenceSelection(binding); selection.rowIds = rowIds; setWordSelection(selection);
        setProductionNavigation({ serial: Date.now(), scope: binding.scope, start: binding.target.start, rowIds });
      } else if (binding.scope.kind === "script") {
        try { if (captureReferenceTargets(referenceSelection(binding), null, voiceScript.document)[0]?.text !== binding.target.text) throw new Error("Nội dung vùng đích đã đổi. Chọn lại vùng để gán."); }
        catch (reason) { setNotice(String(reason)); return; }
        setWordSelection(referenceSelection(binding));
        setProductionNavigation({ serial: Date.now(), scope: binding.scope, start: null, rowIds: binding.target.rowIds });
      }
    },
    onDeleteReference: async (binding) => {
      if (!referenceDocument) return;
      referenceRead.current++;
      try { setReferenceDocument(await api.deleteReferenceBinding(project.id, binding.id, referenceDocument.revision)); }
      catch (reason) { void reloadReferences(); throw reason; }
    },
    onReferenceContext: openReferenceContext,
    onScriptChange: (value) => { if (!blockedByRecycleBin()) changeScript(value); },
    // Picking a person in Sound Library makes them who reads a new Script row.
    onVoiceChange: setSelectedVoice,
    onSpeedChange: setSpeed,
    onGainChange: (value) => setGain(Math.max(-96, Math.min(96, value))),
    onTakeChange: (captured) => void processCapturedAudio(captured),
    onRecordingSlotChange: updateRecordingSlot,
    pendingObsRecording,
    onObsRecordingSlotChange: setPendingObsRecording,
    onImportMedia: (choices) => void importMedia(choices),
    onImportLocalMedia: () => void importLocalMedia(),
    pendingLocalMedia,
    pendingNativeMediaPaths,
    pendingMediaImports,
    onConfirmNativeMediaImport: confirmNativeMediaImport,
    onCancelNativeMediaImport: cancelNativeMediaImport,
    onRetryPendingImport: retryPendingMediaImport,
    onDismissPendingImport: (id) => {
      const row = pendingMediaImports.find((item) => item.id === id);
      if (!row || row.status !== "error" && row.status !== "choosing") return;
      capturedMediaFailures.current.delete(id);
      failedMediaImports.current.delete(id);
      setPendingMediaImports((current) => current.filter((item) => item.id !== id));
    },
    onPendingLocalTrackChange: changePendingLocalTrack,
    onConfirmPendingLocalMedia: (mode, sttSegmentSeconds, cacheLocal) => void confirmPendingLocalMedia(mode, sttSegmentSeconds, cacheLocal),
    onCancelPendingLocalMedia: () => setPendingLocalMedia(null),
    onFinishGrowingMkv: (assetId) => void finishGrowingMkv(assetId),
    onStartGrowingMkvDetailedStt: (assetId, segmentSeconds) => void startGrowingMkvDetailedStt(assetId, segmentSeconds),
    onSetLocalCache: (assetId, enabled) => void setLocalCache(assetId, enabled),
    onSelectAsset: selectMediaAsset,
    onClearMediaSelection: clearMediaSelection,
    onOpenObsAsset: (assetId) => void openObsAsset(assetId),
    onObsImportReady: (assetId) => openObsAsset(assetId, true),
    onObsImportSlotChange: updatePendingMediaSlot,
    onObsImportSlotRemoved: (id) => setPendingMediaImports((current) => current.filter((item) => item.id !== id)),
    onRecordingPreview: setRecordingPreview,
    onLiveTranscript: handleLiveTranscript,
    onAssetTimelineStateChange: async (assetId, state) => { if (blockedByRecycleBin()) throw new Error("Footage đang ở Recycle Bin."); if (!await updateTimelineEdits(state.removedRanges, undefined, assetId, state.workingRange, state.cutPoints)) throw new Error("Không lưu được vùng làm việc."); },
    onTimelineStateChange: (state) => { if (!blockedByRecycleBin()) void updateTimelineEdits(state.removedRanges, undefined, scriptAssetId, state.workingRange, state.cutPoints); },
    onTimelineEditsChange: (ranges, gainKeyframes) => { if (!blockedByRecycleBin()) void updateTimelineEdits(ranges, gainKeyframes); },
    onToggleTraining: (assetId, selected) => void toggleTrainingAsset(assetId, selected),
    onToggleTranscription: (assetId, selected) => void toggleTranscriptionAsset(assetId, selected),
    onToggleImport: (assetId, selected, streamIndex) => void toggleImportAsset(assetId, selected, streamIndex),
    onToggleDiarization: (assetId, selected) => void toggleDiarizationAsset(assetId, selected),
    onQueueTranscriptions: (model) => void queueSelectedTranscriptions(model),
    onControlTranscriptions: (action, assetIds) => controlTranscriptions(action, assetIds),
    onRemoveAsset: (asset) => void removeMediaAsset(asset),
    onBatchMediaAction: (action) => { if (action.kind === "restore" || action.kind === "delete" || !blockedByRecycleBin()) void batchMediaAction(action); },
    onRestoreAsset: (asset) => void restoreMediaAsset(asset),
    onRevealAsset: (asset, location) => void revealMediaAsset(asset, location),
    onSetAssetDisabled: (asset, disabled) => void setMediaDisabled(asset, disabled),
    readOnlyAsset: previewingRecycled,
    projectLanguage: project.language ?? null,
    onUpdateAnnotations: (assetId, speakerProfileIds, environmentProfileIds, emotion) => { if (!blockedByRecycleBin()) void updateMediaAnnotations(assetId, speakerProfileIds, environmentProfileIds, emotion); },
    onUpdateDiarizationAssignments: (assetId, assignments) => { if (!blockedByRecycleBin()) void updateDiarizationAssignments(assetId, assignments); },
    onScriptDocumentsChange: (changes) => {
      if (blockedByRecycleBin()) return;
      scriptEditHistory.current.batch(() => changes.forEach((change) => { void changeWordAnnotations(change.words, change.text, change.assetId); }));
    },
    onPrepareSubtitleAlignment: prepareSubtitleAlignment,
    onSubtitleAlignmentApplied: acceptSubtitleAlignment,
    onAssetWordsChange: (assetId, words, text) => { if (!blockedByRecycleBin()) void changeWordAnnotations(words, text, assetId); },
    onWordsChange: (words, text) => { if (!blockedByRecycleBin()) void changeWordAnnotations(words, text); },
    onScriptUndo: () => restoreScriptEdit("undo"),
    onScriptRedo: () => restoreScriptEdit("redo"),
    onCatalogChange: changeCatalog,
    onCollectionImported: collectionImported,
    onPrepareCollectionExport: prepareCollectionOperation,
    onSendToTraining: sendSelectedToTraining,
    onSendMediaTo: (target, ids) => { void sendMediaTo(target, ids); },
    onSendOutputTo: (target, outputs) => { void sendOutputTo(target, outputs); },
    onGenerate: () => void generateVoice(),
    onStopDiarization: stopDiarization,
    onStopTraining: stopTraining,
    onStopGeneration: stopGeneration,
    onDeferredAction: (action, assetIds) => {
      if (action === "Export SRT theo câu") void exportSubtitles("sentence", assetIds);
      else if (action === "Export SRT từng từ") void exportSubtitles("word", assetIds);
      else if (action === "Export bảng Script") void exportSubtitles("table", assetIds);
      else setNotice(`${action} chưa có processor phù hợp.`);
    },
    onRunAiReview: (assetIds) => { if (!blockedByRecycleBin()) void runAiReview(assetIds); },
    onRunDiarization: () => { if (!blockedByRecycleBin()) void runDiarization(); },
  }), [voiceVersions, manipulatorMode, generationEngine, speechToTextHost, voiceScriptSettingsHost, voiceRender, voiceEdits, editedOutput, referenceDocument, referenceError, productionNavigation, activePage, aiReviewBusy, datasetBusy, datasetReadiness, trainingBatch, trainingModels, trainingProgressByRun, trainingRuns, projectVoices, voiceOutputs, sttEngines, asrAdapters, voiceGenerators, generatorParameters, generating, voiceScriptRows, voiceScript.document, voiceScript.error, voiceScript.ready, voiceScript.isSaved, voiceCategory, voiceScriptJob, pendingVoiceOutput, pendingObsRecording, voiceChangers, changerPreflight, changerSettings, changerStatus, changerBusy, changerRecordings, gain, captureSource, obsCaptureEnabled, liveTranscriptActive, mediaAssets, mediaBusy, pendingLocalMedia, pendingNativeMediaPaths, pendingMediaImports, preferences.emotionStyle, preferences.timeline, previewingRecycled, profileSchema, readingBusy, readingPacks, readingSession, reading.pendingTake, recordingPreview, obsTimelineActive, obsTimelineRecordingId, obsTranscriptRows, obsTranscriptError, obsPlayheadSeconds, obsSeekRequest, obsOverlapSelection, script, selectedAssetId, selectedImportedTrackId, selectedScriptAssetIds, selectedVoice, speed, pageTake, outputTake, trainingCatalog, trainingRuntime, wordSelection, patchSourceSelection]);

  const renderModule = (id: ModuleId) => {
    if (activePage === "voice-manipulator" && ((id === "voice-generator" && manipulatorMode !== "voice-over")
      || (id === "voice-patch" && manipulatorMode !== "voice-patch"))) return null;
    return <ModuleErrorBoundary key={id} name={id}
    onClearSelection={clearMediaSelection} resetKey={`${project.id}:${selectedAssetId ?? ""}:${selectedImportedTrackId ?? ""}`}>
    <ProgressiveModule context={context} id={id} />
  </ModuleErrorBoundary>;
  };

  return (
    <main className="workspace-shell">
      {referenceSession ? <ReferenceAssignmentEditor key={referenceSession.id} session={referenceSession} assets={mediaAssets} projectId={project.id} onClose={() => { referenceRequestId.current = null; setReferenceSession(null); }} onApply={async (assignment) => {
        if (activePage !== "voice-manipulator" || referenceRequestId.current !== referenceSession.id) throw new Error("Vùng đích đang mở đã thay đổi. Chọn lại vùng để gán.");
        if (assignment.scope.kind === "voice-output" && outputTake?.id !== assignment.scope.id) throw new Error("Voice Output đã thay đổi. Mở lại editor từ vùng mới.");
        if (assignment.scope.kind === "script" && (!voiceScript.isSaved || String(voiceScript.document.revision) !== assignment.scope.revision)) throw new Error("Script đã thay đổi hoặc đang lưu. Mở lại menu để chụp vùng mới.");
        const saved = await api.assignReferences(project.id, assignment);
        referenceRead.current++; setReferenceDocument(saved); setReferenceError(null);
        if (referenceRequestId.current === referenceSession.id) setNotice(`Đã lưu reference cho ${assignment.targets.length} vùng · ${saved.bindings.length} vùng đã gán. Các đặc tính đang chờ phân tích và áp dụng vào audio.`);
      }} /> : null}
      <header className="workspace-topbar">
<div className="workspace-identity"><button className="workspace-brand" onClick={() => void backToProjects()} type="button"><img alt="" className="workspace-brand__logo" src="/pro4bro-logo.png" /><b>VOICE<br />MANIPULATOR</b></button><div className="workspace-project-context" title={project.name}><span>PROJECT</span><b>{project.name}</b></div></div>
        <nav aria-label="Quy trình chính">{pages.map((page, index) => <button className={activePage === page.id ? "is-active" : ""} key={page.id} onClick={() => void selectPage(page.id)} type="button"><span>{String(index).padStart(2, "0")}</span><Icon name={page.icon} /><b>{page.label}</b></button>)}</nav>
        <div className="workspace-meta">
          <span><i />{engine?.installed ? "ENGINE READY" : "ENGINE OFFLINE"}</span>
          <div className="workspace-windows-menu"><button aria-expanded={windowsMenuOpen} className="workspace-windows-button" onClick={() => setWindowsMenuOpen((open) => !open)} type="button"><Icon name="window" />WINDOWS</button>{windowsMenuOpen ? <div role="menu"><button onClick={() => { setWindowsMenuOpen(false); setPreferencesOpen(true); }} role="menuitem" type="button"><Icon name="settings" />Preferences</button><RuntimeMenuItems onAction={runRuntimeAction} runtime={runtime} /></div> : null}</div>
          <button aria-label={theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"} onClick={onToggleTheme} title={theme === "light" ? "Dark mode" : "Light mode"} type="button"><Icon name={theme === "light" ? "moon" : "sun"} /></button>
        </div>
      </header>
      <div className="workspace-body">
        <aside className={`project-rail ${activePage === "voice-manipulator" ? "project-rail--manipulator" : ""}`}><button aria-label="Về danh sách project" onClick={() => void backToProjects()} type="button"><Icon name="back" /></button><div className="rail-project"><span>{project.name.slice(0, 2).toUpperCase()}</span><b>{project.name}</b><small>{project.accent}</small></div>{activePage === "voice-manipulator" ? <ManipulatorNavigation mode={manipulatorMode} onChange={setManipulatorMode} /> : null}<div className="rail-spine">PRO4BRO / LOCAL SESSION / {project.id.slice(0, 6).toUpperCase()}</div><button aria-label="Project files" type="button"><Icon name="folder" /></button></aside>
        <section id={activePage === "voice-manipulator" ? "manipulator-workspace" : undefined} role={activePage === "voice-manipulator" ? "tabpanel" : undefined} aria-labelledby={activePage === "voice-manipulator" ? `manipulator-tab-${manipulatorMode}` : undefined} className={`workspace-stage ${COMPACT_PAGES.has(activePage) ? "is-compact-heading" : ""}`}>
          {!COMPACT_PAGES.has(activePage) ? <header className="stage-heading"><div><span>{manifest.eyebrow}</span><h1>{manifest.label}</h1></div><div className="stage-lineage"><span>PROJECT</span><b>{project.name}</b><i /><span>TAKE</span><b>{pageTake?.name ?? "Chưa chọn"}</b></div></header> : null}
          {activePage === "lip-sync" ? <LipSyncPage key={project.id} navigationRef={lipSyncNavigation} incoming={lipSyncIncoming} onIncomingConsumed={(id) => setLipSyncIncoming((current) => current?.id === id ? null : current)} projectId={project.id} assets={mediaAssets} outputs={voiceOutputs} leftWidth={leftWidth} rightWidth={rightWidth} onResizeStart={beginResize} onResizeKeyDown={resizeWithKeyboard} /> : <div inert={activePage === "voice-manipulator" && (voiceVersions.transitioning || !voiceVersions.ready && !voiceVersions.error) || undefined} className={`studio-board studio-board--${activePage} ${activePage === "voice-manipulator" && voiceVersions.state?.composition ? "has-voice-layers" : ""} ${manifest.columns.left.length ? "" : "is-two-column"} ${manifest.columns.bottom.length ? "" : "is-no-bottom"} ${activePage === "speech-to-text" && obsTimelineActive ? "has-obs-timeline" : ""}`} style={{ "--left-column": `${leftWidth}px`, "--right-column": `${rightWidth}px` } as CSSProperties}>
            <div className="module-column module-column--left">{manifest.columns.left.map(renderModule)}</div>
            <div aria-label="Co kéo cột trái" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => resizeWithKeyboard("left", event)} onPointerDown={(event) => beginResize("left", event)} role="separator" tabIndex={0}><i /></div>
            <div className="module-column module-column--center">{manifest.columns.center.map(renderModule)}</div>
            <div aria-label="Co kéo cột phải" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => resizeWithKeyboard("right", event)} onPointerDown={(event) => beginResize("right", event)} role="separator" tabIndex={0}><i /></div>
            <div className="module-column module-column--right">{manifest.columns.right.map(renderModule)}</div>
            <div className="module-column module-column--bottom">{manifest.columns.bottom.map(renderModule)}</div>
          </div>}
        </section>
      </div>
      <WorkspaceStatusBar metrics={systemMetrics} tasks={activityTasks} queueTasks={queueTasks} projectId={project.id} projectName={project.name} assets={mediaAssets} />
      {notice ? <div className="studio-notice" role="status"><i />{notice}<button type="button" onClick={() => { setNotice(null); setLoadAttempt((value) => value + 1); }}>Tải lại dữ liệu</button></div> : null}
      {job ? <div className="studio-job" role="status"><span><i /><i /><i /></span><b>{job}</b><small>Không đóng app trong khi model đang xử lý.</small></div> : null}
      {preferencesOpen ? <PreferencesDialog preferences={preferences} saving={preferencesSaving} onClose={() => setPreferencesOpen(false)} onSave={(next) => void savePreferences(next)} /> : null}
      {processingChoice.dialog}
    </main>
  );
}

function PreferencesDialog({ preferences, saving, onClose, onSave }: { preferences: AppPreferences; saving: boolean; onClose: () => void; onSave: (preferences: AppPreferences) => void }) {
  const [draft, setDraft] = useState(preferences);
  const emotionOptions = EMOTION_OPTIONS.filter((option) => option.id !== "normal" && option.id !== "mix");
  return (
    <div className="preferences-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label="Preferences" aria-modal="true" className="preferences-dialog" role="dialog">
        <header><div><span>WINDOWS / PREFERENCES</span><h2>Preferences</h2></div><button aria-label="Đóng Preferences" onClick={onClose} type="button">×</button></header>
        <ObsPluginPreferences />
        <section className="preferences-section"><h3>Timeline</h3>
          <label><span>Vị trí playhead trong đoạn nghe thử</span><select value={draft.timeline?.scrubPreviewPosition ?? "center"} onChange={(event) => setDraft({ ...draft, timeline: { clippingHighlightAutoHide: draft.timeline?.clippingHighlightAutoHide ?? false, ...draft.timeline, scrubPreviewPosition: event.target.value as "start" | "center" | "end" } })}>
            <option value="start">Đầu — nghe sau playhead</option><option value="center">Giữa — nghe quanh playhead</option><option value="end">Cuối — nghe trước playhead</option>
          </select></label>
          <small className="preferences-note">Đoạn nghe thử 120 ms lặp lại khi giữ chuột trên waveform hoặc kéo playhead. Highlight mờ chỉ phạm vi đang nghe; thả chuột để dừng.</small>
          <label className="preferences-switch"><input checked={draft.timeline?.clippingHighlightAutoHide ?? false} onChange={(event) => setDraft({ ...draft, timeline: { ...draft.timeline, clippingHighlightAutoHide: event.target.checked } })} type="checkbox" /><span>Tự ẩn highlight quá âm lượng sau 5 giây</span></label>
        </section>
        <section className="preferences-section"><h3>AI Transcript Review</h3><p>STT kỹ chạy local ở background. AI fix chỉ gửi transcript tới API tương thích OpenAI khi bạn bấm nút AI fix trong Script.</p>
          <label className="preferences-switch"><input checked={draft.aiReview.enabled} onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, enabled: event.target.checked } })} type="checkbox" /><span>Bật AI check transcript</span></label>
          <label><span>Base URL</span><input onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, baseUrl: event.target.value } })} placeholder="https://api.openai.com/v1" value={draft.aiReview.baseUrl} /></label>
          <label><span>Model</span><input onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, model: event.target.value } })} placeholder="gpt-4.1-mini" value={draft.aiReview.model} /></label>
          <label><span>API key {draft.aiReview.apiKeyConfigured ? "(đã lưu)" : ""}</span><input onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, apiKey: event.target.value || null } })} placeholder={draft.aiReview.apiKeyConfigured ? "Để trống để giữ key hiện tại" : "Nhập API key"} type="password" value={draft.aiReview.apiKey ?? ""} /></label>
          <small className="preferences-note">Key chỉ được giữ trong dữ liệu runtime cục bộ, không ghi vào project hay Git.</small>
        </section>
        <section className="preferences-section"><h3>Speaker Diarization</h3><p>Chạy local trên GPU sau STT để xác định ai nói khi nào. Lần đầu model community-1 cần token Hugging Face và chấp nhận điều khoản model.</p>
          <label className="preferences-switch"><input checked={draft.diarization.enabled} onChange={(event) => setDraft({ ...draft, diarization: { ...draft.diarization, enabled: event.target.checked } })} type="checkbox" /><span>Bật Speaker Diarization</span></label>
          <label><span>Model</span><input onChange={(event) => setDraft({ ...draft, diarization: { ...draft.diarization, model: event.target.value } })} value={draft.diarization.model} /></label>
          <label><span>Hugging Face token {draft.diarization.huggingfaceTokenConfigured ? "(đã lưu)" : ""}</span><input onChange={(event) => setDraft({ ...draft, diarization: { ...draft.diarization, huggingfaceToken: event.target.value || null } })} placeholder={draft.diarization.huggingfaceTokenConfigured ? "Để trống để giữ token hiện tại" : "Nhập access token"} type="password" value={draft.diarization.huggingfaceToken ?? ""} /></label>
          <small className="preferences-note">Trước lần chạy đầu: mở model community-1 trên Hugging Face, chấp nhận điều khoản, tạo Read token rồi dán vào đây. Token chỉ nằm trong dữ liệu runtime cục bộ.</small>
        </section>
        <section className="preferences-section"><h3>Speaker identity gate</h3><p>Model này so giọng được tạo với clip tham chiếu trước khi một Voice Model Set được publish.</p>
          <label><span>Embedding model</span><select aria-label="Speaker embedding model" onChange={(event) => setDraft({ ...draft, speakerSimilarity: { embedderId: event.target.value as AppPreferences["speakerSimilarity"]["embedderId"] } })} value={draft.speakerSimilarity.embedderId}><option value="pyannote-community-1">Pyannote Community-1 (đã cache)</option><option value="wespeaker-resnet34-lm">WeSpeaker ResNet34-LM (cài riêng)</option></select></label>
          <small className="preferences-note">Threshold hiện là provisional và không thể publish cho tới khi được hiệu chuẩn bằng bộ mẫu thật.</small>
        </section>
        <section className="preferences-section preferences-section--emotion"><h3>Emotion text in Script</h3><p>Chữ không có emotion giữ màu theo Light/Dark. Các từ đã gán emotion nhận màu từ gradient hoặc màu riêng.</p>
          <label><span>Color mode</span><select aria-label="Emotion color mode" onChange={(event) => setDraft({ ...draft, emotionStyle: { ...draft.emotionStyle, colorMode: event.target.value as "gradient" | "per-emotion" } })} value={draft.emotionStyle.colorMode}><option value="gradient">Gradient theo dải màu</option><option value="per-emotion">Màu riêng từng emotion</option></select></label>
          {draft.emotionStyle.colorMode === "gradient" ? <div className="preferences-color-row"><label><span>Gradient from</span><input aria-label="Gradient from" onChange={(event) => setDraft({ ...draft, emotionStyle: { ...draft.emotionStyle, gradientStart: event.target.value } })} type="color" value={draft.emotionStyle.gradientStart} /></label><label><span>Gradient to</span><input aria-label="Gradient to" onChange={(event) => setDraft({ ...draft, emotionStyle: { ...draft.emotionStyle, gradientEnd: event.target.value } })} type="color" value={draft.emotionStyle.gradientEnd} /></label></div> : <div className="preferences-emotion-colors">{emotionOptions.map((option) => <label key={option.id}><span>{option.label}</span><input aria-label={`Màu ${option.label}`} onChange={(event) => setDraft({ ...draft, emotionStyle: { ...draft.emotionStyle, emotionColors: { ...draft.emotionStyle.emotionColors, [option.id]: event.target.value } } })} type="color" value={draft.emotionStyle.emotionColors[option.id] ?? "#ffffff"} /></label>)}</div>}
          <label className="preferences-switch"><input checked={draft.emotionStyle.backgroundEnabled} onChange={(event) => setDraft({ ...draft, emotionStyle: { ...draft.emotionStyle, backgroundEnabled: event.target.checked } })} type="checkbox" /><span>Gắn nền cho chữ có emotion</span></label>
          {draft.emotionStyle.backgroundEnabled ? <div className="preferences-color-row"><label><span>Background color</span><input aria-label="Emotion background color" onChange={(event) => setDraft({ ...draft, emotionStyle: { ...draft.emotionStyle, backgroundColor: event.target.value } })} type="color" value={draft.emotionStyle.backgroundColor} /></label><label><span>Opacity {Math.round(draft.emotionStyle.backgroundOpacity * 100)}%</span><input aria-label="Emotion background opacity" max="1" min="0" onChange={(event) => setDraft({ ...draft, emotionStyle: { ...draft.emotionStyle, backgroundOpacity: Number(event.target.value) } })} step="0.05" type="range" value={draft.emotionStyle.backgroundOpacity} /></label></div> : null}
        </section>
        <footer><button className="button button--quiet" disabled={saving} onClick={onClose} type="button">Hủy</button><button className="button button--accent" disabled={saving} onClick={() => onSave(draft)} type="button">{saving ? "Đang lưu..." : "Lưu Preferences"}</button></footer>
      </section>
    </div>
  );
}
