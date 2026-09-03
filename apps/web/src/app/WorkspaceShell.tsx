import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { api } from "../api/client";
import { DEFAULT_EMOTION_STYLE } from "../domain/emotion-style";
import { EMOTION_OPTIONS } from "../domain/emotions";
import { EMPTY_SELECTION, type WordSelection } from "../domain/word-selection";
import { buildReadingPlan, coverageFor, nextCardIndex } from "../domain/reading-plan";
import type { ReadingMode, ReadingPlan } from "../domain/reading-plan";
import type {
  AppPreferences,
  EmotionLabel,
  EngineProfileSchema,
  EngineStatus,
  ManipulatorMode,
  MediaImportChoice,
  MediaTranscriptionProgress,
  Project,
  ProjectMediaAsset,
  ReadingPackSummary,
  RecordingWaveformPreview,
  RuntimeAction,
  RuntimeWorkloadState,
  StudioAudioItem,
  StudioWord,
  ThemeMode,
  SystemMetrics,
  TimelineEditRange,
  TimelineGainKeyframe,
  TrainingCatalog,
  WorkspacePage,
} from "../domain/types";
import { ModuleRegistry, type StudioContext } from "../modules/registry/ModuleRegistry";
import { WorkspaceStatusBar } from "../modules/workspace-status/WorkspaceStatusBar";
import type { CapturedAudio } from "../modules/recorder/Recorder";
import type { ActiveTake } from "../modules/timeline/Timeline";
import { workspaceManifest } from "../pages/workspaceManifest";
import { Icon, type IconName } from "../ui/Icon";
import { RuntimeMenuItems } from "./RuntimeMenuItems";

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
  { id: "speech-to-text", label: "Speech to Text", short: "STT", icon: "mic" },
  { id: "voice-training", label: "Voice Training", short: "TRAIN", icon: "training" },
  { id: "voice-manipulator", label: "Voice Manipulator", short: "VOICE", icon: "wrench" },
];

const modeLabels: Record<ManipulatorMode, string> = {
  "voice-over": "Voice Over",
  "voice-isolator": "Voice Isolator",
  "voice-changer": "Voice Changer",
  "voice-dubber": "Voice Dubber",
  "voice-patch": "Voice Patch",
};

/**
 * A guided reading run, held for as long as the workspace is open.
 *
 * `secondsSinceBreak` counts speech, not wall clock: a session left open over
 * lunch has not tired anyone's voice, and speech time is what the break warning
 * is actually about.
 */
interface ReadingSessionState {
  plan: ReadingPlan;
  packTitle: string;
  cardIndex: number;
  recordedSecondsByCard: Record<string, number>;
  secondsSinceBreak: number;
}

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
    },
    updatedAt: new Date().toISOString(),
  };
}
function defaultPreferences(): AppPreferences {
  return {
    aiReview: { enabled: false, baseUrl: "", model: "", apiKey: null, apiKeyConfigured: false },
    diarization: { enabled: true, model: "pyannote/speaker-diarization-community-1", huggingfaceToken: null, huggingfaceTokenConfigured: false },
    emotionStyle: { ...DEFAULT_EMOTION_STYLE, emotionColors: { ...DEFAULT_EMOTION_STYLE.emotionColors } },
  };
}

function isBackgroundTranscribing(asset: ProjectMediaAsset) {
  return ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus);
}

export function WorkspaceShell({ project, engine, onBack, onPageChange, runtime, onRuntimeAction, theme, onToggleTheme }: WorkspaceShellProps) {
  const [activePage, setActivePage] = useState<WorkspacePage>(project.lastPage);
  const [activeMode, setActiveMode] = useState<ManipulatorMode>("voice-over");
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(340);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [speed, setSpeed] = useState(1);
  const [gain, setGain] = useState(0);
  const [take, setTake] = useState<ActiveTake | null>(null);
  const [mediaAssets, setMediaAssets] = useState<ProjectMediaAsset[]>([]);
  const mediaAssetsRef = useRef<ProjectMediaAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  // Owned here rather than in either module, so Script and Timeline agree on
  // what is selected instead of each keeping a private answer.
  const [wordSelection, setWordSelection] = useState<WordSelection>(EMPTY_SELECTION);
  const selectedAssetIdRef = useRef<string | null>(null);
  const scriptDirtyRef = useRef(false);
  const liveTranscriptActiveRef = useRef(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recordingPreview, setRecordingPreview] = useState<RecordingWaveformPreview | null>(null);
  const [liveTranscriptActive, setLiveTranscriptActive] = useState(false);
  const [aiReviewBusy, setAiReviewBusy] = useState(false);
  const [trainingCatalog, setTrainingCatalog] = useState<TrainingCatalog>(emptyTrainingCatalog);
  const [profileSchema, setProfileSchema] = useState<EngineProfileSchema | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [readingPacks, setReadingPacks] = useState<ReadingPackSummary[]>([]);
  const [readingSession, setReadingSession] = useState<ReadingSessionState | null>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [windowsMenuOpen, setWindowsMenuOpen] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const catalogRevisionRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [scriptDirty, setScriptDirty] = useState(false);
  const scriptRef = useRef("");
  const scratchStorageKey = `pro4bro:${project.id}:scratch-script`;
  const legacyScriptStorageKey = `pro4bro:${project.id}:script`;
  const [script, setScript] = useState(() => localStorage.getItem(scratchStorageKey) ?? localStorage.getItem(legacyScriptStorageKey) ?? "");
  const manifest = workspaceManifest(activePage);

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
  scriptDirtyRef.current = scriptDirty;
  liveTranscriptActiveRef.current = liveTranscriptActive;

  useEffect(() => {
    if (!selectedAssetId) localStorage.setItem(scratchStorageKey, script);
  }, [script, scratchStorageKey, selectedAssetId]);

  // Selections are word positions, so they mean nothing once another asset's
  // words are loaded - carrying them over would highlight unrelated words.
  useEffect(() => {
    setWordSelection(EMPTY_SELECTION);
  }, [selectedAssetId]);

  useEffect(() => {
    let cancelled = false;
    setMediaBusy(true);
    void Promise.all([
      api.listProjectMedia(project.id),
      api.getTrainingCatalog(project.id),
      api.getOmniVoiceProfileSchema(),
      api.getPreferences(),
    ]).then(([assets, catalog, schema, savedPreferences]) => {
      if (cancelled) return;
      setMediaAssets(assets);
      setTrainingCatalog(catalog);
      setProfileSchema(schema);
      setPreferences(savedPreferences);
      if (catalog.speakers[0]) setSelectedVoice((current) => current || catalog.speakers[0].id);
      if (assets[0]) applyMediaAsset(assets[0]);
    }).catch((error: unknown) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : "Không đọc được dữ liệu workspace");
    }).finally(() => {
      if (!cancelled) setMediaBusy(false);
    });

    api.listReadingPacks()
      .then((packs) => { if (!cancelled) setReadingPacks(packs); })
      .catch(() => { /* HQ mode simply offers nothing to read. */ });
    return () => { cancelled = true; };
  }, [project.id]);

  const hasBackgroundTranscription = mediaAssets.some(isBackgroundTranscribing);
  const hasBackgroundDiarization = mediaAssets.some((asset) => ["queued", "processing"].includes(asset.diarizationStatus ?? "idle"));

  useEffect(() => {
    if (!hasBackgroundTranscription) return;
    let cancelled = false;
    let fullMediaRefreshInFlight = false;

    const refreshFullMedia = () => {
      if (fullMediaRefreshInFlight) return;
      fullMediaRefreshInFlight = true;
      void api.listProjectMedia(project.id).then((assets) => {
        if (cancelled) return;
        const currentAssets = mediaAssetsRef.current;
        const activeAssetId = selectedAssetIdRef.current;
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
      void api.listProjectMedia(project.id).then((assets) => {
        if (cancelled) return;
        setMediaAssets((current) => current.length === assets.length && current.every((asset, index) => asset.id === assets[index]?.id && asset.updatedAt === assets[index]?.updatedAt) ? current : assets);
        const selected = assets.find((asset) => asset.id === selectedAssetIdRef.current);
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
      void api.saveTrainingCatalog(project.id, snapshot).then((saved) => {
        if (catalogRevisionRef.current === revision) {
          setTrainingCatalog(saved);
          setCatalogRevision(0);
        }
      }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Không lưu được Sound Library"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [catalogRevision, project.id, trainingCatalog]);

  useEffect(() => {
    if (!scriptDirty || !selectedAssetId || liveTranscriptActive) return;
    const pendingAssetId = selectedAssetId;
    const pendingText = script;
    const timer = window.setTimeout(() => {
      void api.updateMediaScript(project.id, pendingAssetId, pendingText, "user").then((updated) => {
        setMediaAssets((current) => current.map((asset) => asset.id !== updated.id ? asset : scriptRef.current === pendingText ? updated : { ...updated, text: asset.text }));
        if (scriptRef.current === pendingText) setScriptDirty(false);
      }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Không lưu được revision Script"));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [project.id, script, scriptDirty, selectedAssetId, liveTranscriptActive]);

  useEffect(() => () => {
    if (take?.url?.startsWith("blob:")) URL.revokeObjectURL(take.url);
  }, [take?.url]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function selectPage(page: WorkspacePage) {
    setActivePage(page);
    try { await onPageChange(page); } catch { setNotice("Không lưu được trang đang mở. Nội dung Script vẫn được giữ cục bộ."); }
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

  function applyStudioItem(item: StudioAudioItem) {
    setTake({ id: item.id, name: item.name, url: item.url, duration: item.duration, text: item.text, words: item.words });
    if (item.text) setScript(item.text);
  }

  function applyMediaAsset(asset: ProjectMediaAsset) {
    setSelectedAssetId(asset.id);
    setScript(asset.text);
    setScriptDirty(false);
    setTake(asset.url ? { id: asset.studioItemId ?? asset.id, name: asset.name, url: asset.url, duration: asset.duration, text: asset.text, words: asset.words, wordTimingQuality: asset.wordTimingQuality, wordTimingNote: asset.wordTimingNote } : null);
  }

  function storeMediaAsset(asset: ProjectMediaAsset) {
    setMediaAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
  }

  function flushCurrentMediaDraft() {
    if (!scriptDirty || !selectedAssetId) return;
    const assetId = selectedAssetId;
    const text = scriptRef.current;
    void api.updateMediaScript(project.id, assetId, text, "user").then(storeMediaAsset).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Không lưu được revision Script trước khi đổi asset"));
  }

  function selectMediaAsset(assetId: string) {
    const asset = mediaAssets.find((item) => item.id === assetId);
    if (asset && asset.id !== selectedAssetId) {
      flushCurrentMediaDraft();
      applyMediaAsset(asset);
    }
  }

  function changeScript(value: string) {
    setScript(value);
    if (!selectedAssetId || liveTranscriptActive) return;
    setMediaAssets((current) => current.map((asset) => asset.id === selectedAssetId ? { ...asset, text: value } : asset));
    setScriptDirty(true);
  }

  function changeCatalog(catalog: TrainingCatalog) {
    catalogRevisionRef.current += 1;
    setTrainingCatalog(catalog);
    setCatalogRevision(catalogRevisionRef.current);
  }

  async function updateTimelineEdits(ranges: TimelineEditRange[], gainKeyframes?: TimelineGainKeyframe[]) {
    if (!selectedAssetId) return;
    const previous = mediaAssets.find((asset) => asset.id === selectedAssetId);
    if (!previous) return;
    const nextKeyframes = gainKeyframes ?? previous.gainKeyframes ?? [];
    setMediaAssets((current) => current.map((asset) => asset.id === selectedAssetId ? { ...asset, removedRanges: ranges, gainKeyframes: nextKeyframes } : asset));
    try {
      const updated = await api.updateMediaTimelineEdits(project.id, selectedAssetId, ranges, nextKeyframes);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
      setNotice(nextKeyframes.length ? `Đã lưu ${nextKeyframes.length} keyframe Auto Calibration.` : ranges.length ? `${ranges.length} đoạn đã được loại khỏi audio xử lý STT/training.` : "Đã reset timeline; STT/training sẽ dùng lại toàn bộ audio.");
    } catch (error) {
      setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? previous : asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được timeline edits");
    }
  }
  async function updateMediaAnnotations(assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) {
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, speakerProfileIds, environmentProfileIds, emotion } : asset));
    try {
      const updated = await api.updateMediaAnnotations(project.id, assetId, speakerProfileIds, environmentProfileIds, emotion);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
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

  async function changeWordAnnotations(words: StudioWord[], text?: string) {
    if (!selectedAssetId) return;
    const asset = mediaAssets.find((item) => item.id === selectedAssetId);
    if (!asset) return;
    const wordSpeakerIds = words.map((word) => word.speakerId).filter((id): id is string => Boolean(id));
    const wordEnvironmentIds = words.flatMap((word) => word.environmentProfileIds ?? []);
    const speakerProfileIds = [...new Set([...asset.speakerProfileIds, ...wordSpeakerIds])];
    const environmentProfileIds = [...new Set([...asset.environmentProfileIds, ...wordEnvironmentIds])];
    const emotions = [...new Set(words.map((word) => word.emotion ?? asset.emotion))];
    const emotion = emotions.length > 1 ? "mix" : emotions[0] ?? asset.emotion;
    const nextText = text ?? scriptRef.current;
    if (text !== undefined) {
      setScript(nextText);
      scriptRef.current = nextText;
      setScriptDirty(false);
    }
    setTake((current) => current ? { ...current, text: nextText, words } : current);
    setMediaAssets((current) => current.map((item) => item.id === asset.id ? { ...item, text: nextText, words, speakerProfileIds, environmentProfileIds, emotion } : item));
    try {
      await api.updateMediaScript(project.id, asset.id, nextText, "user", words);
      const updated = await api.updateMediaAnnotations(project.id, asset.id, speakerProfileIds, environmentProfileIds, emotion);
      setMediaAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`Đã gán ${speakerProfileIds.length} speaker · ${environmentProfileIds.length} environment.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không lưu được nhãn theo từ");
    }
  }

  async function controlTranscriptions(action: "pause" | "resume" | "stop", assetIds?: string[]) {
    try {
      const updated = await api.controlMediaTranscriptions(project.id, action, assetIds);
      if (updated.length) {
        const byId = new Map(updated.map((asset) => [asset.id, asset]));
        setMediaAssets((current) => current.map((asset) => byId.get(asset.id) ?? asset));
      }
      const scope = assetIds?.length ? `${assetIds.length} footage` : "toàn bộ hàng đợi";
      // Recognition runs in a worker thread that cannot be interrupted, so say
      // plainly that the file already being transcribed still finishes.
      setNotice(action === "resume"
        ? `Đã chạy tiếp ${scope}.`
        : `Đã ${action === "pause" ? "tạm dừng" : "dừng"} ${scope}. File đang nhận dạng vẫn chạy nốt.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không điều khiển được hàng đợi STT");
    }
  }

  async function startReadingSession(packId: string, emotions: EmotionLabel[], mode: ReadingMode) {
    setReadingBusy(true);
    try {
      const pack = await api.getReadingPack(packId);
      const plan = buildReadingPlan(pack, emotions, mode);
      if (!plan.cards.length) {
        setNotice("Bộ bài đọc này không có thẻ nào cho các cảm xúc đã chọn.");
        return;
      }
      setReadingSession({
        plan,
        packTitle: pack.title,
        cardIndex: 0,
        recordedSecondsByCard: {},
        secondsSinceBreak: 0,
      });
      setNotice(`Phiên đọc mở với ${plan.cards.length} thẻ. Script đang hiện bài để đọc theo.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không mở được bộ bài đọc");
    } finally {
      setReadingBusy(false);
    }
  }

  function skipReadingCard() {
    setReadingSession((current) => {
      if (!current) return current;
      const next = nextCardIndex(current.plan, current.recordedSecondsByCard, current.cardIndex + 1);
      return { ...current, cardIndex: next === -1 ? current.plan.cards.length : next };
    });
  }

  async function processCapturedAudio(captured: CapturedAudio) {
    setTake(captured);
    setMediaBusy(true);
    try {
      // A recording is an ordinary file that happens to arrive with a live
      // transcript. Running STT on it unasked spent GPU time on takes the user
      // was going to discard, so it queues like anything else: tick it in Media
      // Pool and press Speech to text.
      // In HQ mode the card is the transcript, not a guess, and the take
      // is filed as guided. Verification stays a later, deliberate pass.
      const knownText = captured.knownText ?? "";
      const result = await api.importProjectMedia(
        project.id,
        captured.file,
        "record",
        knownText || captured.realtimeText,
        false,
        false,
        captured.readingCardId ? "guided" : null,
      );
      if (captured.readingCardId) {
        const cardId = captured.readingCardId;
        setReadingSession((current) => {
          if (!current) return current;
          const recordedSecondsByCard = { ...current.recordedSecondsByCard, [cardId]: captured.duration };
          const next = nextCardIndex(current.plan, recordedSecondsByCard, current.cardIndex + 1);
          return {
            ...current,
            recordedSecondsByCard,
            cardIndex: next === -1 ? current.plan.cards.length : next,
            secondsSinceBreak: current.secondsSinceBreak + captured.duration,
          };
        });
      }
      flushCurrentMediaDraft();
      let asset = result.asset;
      if (captured.words.length) {
        // The live transcript is the recording's subtitle until STT replaces it.
        asset = await api.updateMediaScript(project.id, asset.id, captured.realtimeText, "record", captured.words);
      }
      storeMediaAsset(asset);
      applyMediaAsset(asset);
      setNotice("Bản thu đã vào Media Pool cùng live transcript. Tick STT rồi bấm Speech to text khi muốn chạy nhận dạng kỹ.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không xử lý được audio");
    } finally {
      setMediaBusy(false);
    }
  }

  async function importMedia(choices: MediaImportChoice[]) {
    setMediaBusy(true);
    let imported = 0;
    let lastAsset: ProjectMediaAsset | null = null;
    try {
      for (const choice of choices) {
        const result = await api.importProjectMedia(project.id, choice.file, "import", "", false, false);
        const asset = choice.transcribe ? await api.setMediaTranscriptionSelected(project.id, result.asset.id, true) : result.asset;
        storeMediaAsset(asset);
        lastAsset = asset;
        imported += 1;
      }
      if (lastAsset) {
        flushCurrentMediaDraft();
        applyMediaAsset(lastAsset);
      }
      setNotice(`Đã import ${imported} asset. Các footage đã tick STT sẵn sàng trong hàng chờ.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Import media thất bại";
      setNotice(imported ? `Đã import ${imported}/${choices.length} asset. File tiếp theo lỗi: ${detail}` : detail);
    } finally {
      setMediaBusy(false);
    }
  }

  async function importLocalMedia() {
    setMediaBusy(true);
    try {
      const picked = await api.pickMediaFile();
      if (!picked.path) return;
      const cacheLocal = window.confirm(
        "Bật Local File Caching?\n\nOK: copy file vào project để xử lý nhanh.\nCancel: giữ file gốc làm nguồn xử lý.",
      );
      const result = await api.importLocalProjectMedia(project.id, picked.path, cacheLocal);
      flushCurrentMediaDraft();
      storeMediaAsset(result.asset);
      applyMediaAsset(result.asset);
      setNotice(cacheLocal
        ? "Đã import và cache file vào project. Chuột phải footage để refresh cache khi file gốc thay đổi."
        : "Đã import theo link file gốc. Bật Local File Caching từ menu chuột phải khi cần.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không import được file gốc");
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
  async function toggleTrainingAsset(assetId: string, selected: boolean) {
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, trainingSelected: selected } : asset));
    try {
      const updated = await api.setMediaTrainingSelected(project.id, assetId, selected);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
    } catch (error) {
      if (previous) setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? previous : asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được lựa chọn Voice Training");
    }
  }

  async function toggleTranscriptionAsset(assetId: string, selected: boolean) {
    const previous = mediaAssets.find((asset) => asset.id === assetId);
    setMediaAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, transcriptionSelected: selected } : asset));
    try {
      const updated = await api.setMediaTranscriptionSelected(project.id, assetId, selected);
      setMediaAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset));
    } catch (error) {
      if (previous) setMediaAssets((current) => current.map((asset) => asset.id === previous.id ? previous : asset));
      setNotice(error instanceof Error ? error.message : "Không lưu được lựa chọn STT");
    }
  }

  async function queueSelectedTranscriptions(model = "large-v3") {
    const assetIds = mediaAssets.filter((asset) => asset.transcriptionSelected && asset.status !== "no-audio" && !["queued", "processing", "reviewing"].includes(asset.transcriptionStatus)).map((asset) => asset.id);
    if (!assetIds.length) {
      setNotice("Hãy tick STT cho ít nhất một footage không đang chạy.");
      return;
    }
    try {
      const queued = await api.enqueueMediaTranscriptions(project.id, assetIds, model);
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
        setMediaAssets((current) => {
          const remaining = current.filter((item) => item.id !== asset.id);
          if (selectedAssetId === asset.id) moveOffAsset(remaining);
          return remaining;
        });
        setNotice(`Đã xóa hẳn ${asset.name}.`);
        return;
      }
      const recycled = await api.recycleProjectMedia(project.id, asset.id);
      setMediaAssets((current) => current.map((item) => item.id === recycled.id ? recycled : item));
      if (selectedAssetId === asset.id) {
        moveOffAsset(mediaAssets.filter((item) => item.id !== asset.id && !item.deletedAt));
      }
      setNotice(`Đã chuyển ${asset.name} vào Recycle Bin. Mở Recycle Bin trong Media Pool để restore.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể remove footage";
      // The server says it is not there; the list saying otherwise is the stale
      // one, so drop it rather than leaving a row nothing can act on.
      if (/not found/i.test(message)) {
        setMediaAssets((current) => {
          const remaining = current.filter((item) => item.id !== asset.id);
          if (selectedAssetId === asset.id) moveOffAsset(remaining);
          return remaining;
        });
        setNotice(`${asset.name} đã không còn trong project.`);
        return;
      }
      setNotice(message);
    }
  }

  function moveOffAsset(remaining: ProjectMediaAsset[]) {
    const next = remaining.find((item) => !item.deletedAt) ?? null;
    if (next) {
      applyMediaAsset(next);
      return;
    }
    setSelectedAssetId(null);
    setTake(null);
    setScript(localStorage.getItem(scratchStorageKey) ?? "");
  }

  async function revealMediaAsset(asset: ProjectMediaAsset) {
    try {
      await api.revealMediaFile(project.id, asset.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không mở được thư mục chứa footage");
    }
  }

  async function setMediaDisabled(asset: ProjectMediaAsset, disabled: boolean) {
    try {
      const updated = await api.setMediaDisabled(project.id, asset.id, disabled);
      setMediaAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${updated.name} ${disabled ? "đã tắt - không vào batch nào nữa" : "đã bật lại"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không đổi được trạng thái footage");
    }
  }

  async function restoreMediaAsset(asset: ProjectMediaAsset) {
    try {
      const restored = await api.restoreProjectMedia(project.id, asset.id);
      setMediaAssets((current) => current.map((item) => item.id === restored.id ? restored : item));
      setNotice(`Đã restore ${restored.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể restore footage");
    }
  }

  function sendSelectedToTraining() {
    const selectedCount = mediaAssets.filter((asset) => asset.trainingSelected).length;
    if (!selectedCount) {
      setNotice("Hãy tick TRAIN cho ít nhất một footage.");
      return;
    }
    void selectPage("voice-training");
    setNotice(`Đã chuyển ${selectedCount} footage đã chọn sang Voice Training.`);
  }

  async function runAccurateTranscription() {
    if (!selectedAssetId) {
      setNotice("Hãy chọn footage trong Media Pool trước khi chạy STT kỹ.");
      return;
    }
    try {
      const selected = await api.setMediaTranscriptionSelected(project.id, selectedAssetId, true);
      const queued = await api.enqueueMediaTranscriptions(project.id, [selectedAssetId]);
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
    if (!selectedAssetId) {
      setNotice("Hãy chọn footage trong Media Pool trước khi nhận diện speaker.");
      return;
    }

    if (!preferences.diarization.huggingfaceTokenConfigured) {
      setPreferencesOpen(true);
      setNotice("Speaker Diarization cần Hugging Face token lần đầu. Hãy chấp nhận model community-1, dán Read token rồi Lưu Preferences.");
      return;
    }
    try {
      const expectedSpeakers = trainingCatalog.speakers.length || null;
      const queued = await api.enqueueMediaDiarization(project.id, selectedAssetId, expectedSpeakers);
      storeMediaAsset(queued);
      setNotice("Đã đưa Speaker Diarization vào hàng chờ GPU. App vẫn dùng bình thường trong lúc xử lý.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể chạy Speaker Diarization.");
    }
  }
  async function exportSubtitles(mode: "sentence" | "word" | "table") {
    if (!selectedAssetId) {
      setNotice("Hãy chọn footage đã có transcript trước khi xuất SRT.");
      return;
    }
    const selected = mediaAssets.find((asset) => asset.id === selectedAssetId);
    if (!selected?.words.length) {
      setNotice("Footage này chưa có word timing. Hãy chạy STT kỹ trước khi xuất SRT.");
      return;
    }
    if (mode !== "table" && selected.wordTimingQuality === "needs-alignment") {
      setNotice(selected.wordTimingNote ?? "Word timing chưa đáng tin; hãy căn chỉnh trước khi xuất SRT.");
      return;
    }
    try {
      await api.exportProjectSubtitles(project.id, selected.id, mode);
      setNotice(mode === "sentence" ? "Đã xuất SRT theo câu, gồm nhãn Speaker và tải file về máy." : mode === "word" ? "Đã xuất SRT từng từ, giữ timestamp chính xác và nhãn Speaker." : "Đã xuất bảng Script CSV theo Speaker và tải file về máy.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể xuất SRT.");
    }
  }
  async function runAiReview() {
    if (!selectedAssetId) {
      setNotice("Hãy chọn footage trong Media Pool trước khi dùng AI fix.");
      return;
    }
    const selected = mediaAssets.find((asset) => asset.id === selectedAssetId);
    if (!selected || selected.transcriptionStatus !== "complete" || !scriptRef.current.trim()) {
      setNotice("AI fix chỉ khả dụng sau khi STT kỹ hoàn tất và đã có transcript.");
      return;
    }
    setAiReviewBusy(true);
    try {
      if (selected.text !== scriptRef.current) {
        const saved = await api.updateMediaScript(project.id, selected.id, scriptRef.current, "user", take?.words);
        storeMediaAsset(saved);
        setScriptDirty(false);
      }
      const reviewed = await api.reviewMediaTranscript(project.id, selected.id);
      storeMediaAsset(reviewed.asset);
      if (reviewed.status === "complete" && reviewed.reviewedText.trim() !== scriptRef.current.trim()) {
        setNotice("AI đã tạo phương án sửa. Chọn từng cụm vàng/xanh trực tiếp trong Script.");
      } else if (reviewed.status === "skipped") {
        setNotice("AI fix chưa được cấu hình. Mở Windows → Preferences để nhập endpoint, model và API key.");
      } else if (reviewed.status === "complete") {
        setNotice("AI không thấy lỗi nhận diện cần sửa.");
      } else {
        setNotice(reviewed.error ?? "AI fix không hoàn tất.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể chạy AI fix.");
    } finally {
      setAiReviewBusy(false);
    }
  }
  async function generateVoice() {
    if (!script.trim()) {
      setNotice("Hãy nhập Script trước khi tạo voice.");
      return;
    }
    setJob("OmniVoice đang render voice...");
    try {
      const result = await api.generateVoice({ text: script, voiceId: selectedVoice, speed, emotion: "natural" });
      applyStudioItem(result.item);
      setNotice(`Render hoàn tất trong ${result.elapsed.toFixed(1)} giây.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Render voice thất bại");
    } finally {
      setJob(null);
    }
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
  const latestAiRevision = [...(selectedMediaAsset?.revisions ?? [])].reverse().find((revision) => revision.source === "ai") ?? null;
  const latestLiveRevision = [...(selectedMediaAsset?.revisions ?? [])].reverse().find((revision) => revision.source === "record") ?? null;
  const canRunAiReview = Boolean(selectedMediaAsset?.text.trim() && selectedMediaAsset.transcriptionStatus === "complete" && !liveTranscriptActive);
  const context = useMemo<StudioContext>(() => ({
    workflow: activePage,
    script,
    selectedVoice,
    speed,
    gain,
    take,
    mediaAssets,
    selectedAssetId,
    mediaBusy,
    recordingPreview,
    liveTranscriptActive,
    liveTranscriptText: latestLiveRevision?.text ?? null,
    emotionStyle: preferences.emotionStyle,
    aiReviewText: latestAiRevision?.text ?? null,
    aiReviewKey: latestAiRevision?.id ?? null,
    aiReviewBusy,
    canRunAiReview,
    trainingCatalog,
    profileSchema,
    readingPacks,
    readingSession: readingSession
      ? {
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
    onStartReadingSession: (packId, emotions, mode) => void startReadingSession(packId, emotions, mode),
    onEndReadingSession: () => setReadingSession(null),
    onSkipCard: skipReadingCard,
    wordSelection,
    onWordSelectionChange: setWordSelection,
    onScriptChange: (value) => { if (!blockedByRecycleBin()) changeScript(value); },
    onVoiceChange: setSelectedVoice,
    onSpeedChange: setSpeed,
    onGainChange: (value) => setGain(Math.max(-96, Math.min(96, value))),
    onTakeChange: (captured) => void processCapturedAudio(captured),
    onImportMedia: (choices) => void importMedia(choices),
    onImportLocalMedia: () => void importLocalMedia(),
    onSetLocalCache: (assetId, enabled) => void setLocalCache(assetId, enabled),
    onSelectAsset: selectMediaAsset,
    onRecordingPreview: setRecordingPreview,
    onLiveTranscript: handleLiveTranscript,
    onTimelineEditsChange: (ranges, gainKeyframes) => { if (!blockedByRecycleBin()) void updateTimelineEdits(ranges, gainKeyframes); },
    onToggleTraining: (assetId, selected) => void toggleTrainingAsset(assetId, selected),
    onToggleTranscription: (assetId, selected) => void toggleTranscriptionAsset(assetId, selected),
    onQueueTranscriptions: (model) => void queueSelectedTranscriptions(model),
    onControlTranscriptions: (action, assetIds) => void controlTranscriptions(action, assetIds),
    onRemoveAsset: (asset) => void removeMediaAsset(asset),
    onRestoreAsset: (asset) => void restoreMediaAsset(asset),
    onRevealAsset: (asset) => void revealMediaAsset(asset),
    onSetAssetDisabled: (asset, disabled) => void setMediaDisabled(asset, disabled),
    readOnlyAsset: previewingRecycled,
    projectLanguage: project.language ?? null,
    onUpdateAnnotations: (assetId, speakerProfileIds, environmentProfileIds, emotion) => { if (!blockedByRecycleBin()) void updateMediaAnnotations(assetId, speakerProfileIds, environmentProfileIds, emotion); },
    onUpdateDiarizationAssignments: (assetId, assignments) => { if (!blockedByRecycleBin()) void updateDiarizationAssignments(assetId, assignments); },
    onWordsChange: (words, text) => { if (!blockedByRecycleBin()) void changeWordAnnotations(words, text); },
    onCatalogChange: changeCatalog,
    onSendToTraining: sendSelectedToTraining,
    onGenerate: () => void generateVoice(),
    onDeferredAction: (action) => {
      if (action === "Export SRT theo câu") void exportSubtitles("sentence");
      else if (action === "Export SRT từng từ") void exportSubtitles("word");
      else if (action === "Export bảng Script") void exportSubtitles("table");
      else setNotice(`${action} chưa có processor phù hợp.`);
    },
    onRunAiReview: () => { if (!blockedByRecycleBin()) void runAiReview(); },
    onRunDiarization: () => { if (!blockedByRecycleBin()) void runDiarization(); },
  }), [activePage, aiReviewBusy, gain, liveTranscriptActive, mediaAssets, mediaBusy, preferences.emotionStyle, previewingRecycled, profileSchema, readingBusy, readingPacks, readingSession, recordingPreview, script, selectedAssetId, selectedVoice, speed, take, trainingCatalog, wordSelection]);

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
<div className="workspace-identity"><button className="workspace-brand" onClick={onBack} type="button"><span>P4B</span><b>VOICE<br />MANIPULATOR</b></button><div className="workspace-project-context" title={project.name}><span>PROJECT</span><b>{project.name}</b></div></div>
        <nav aria-label="Quy trình chính">{pages.map((page, index) => <button className={activePage === page.id ? "is-active" : ""} key={page.id} onClick={() => void selectPage(page.id)} type="button"><span>{String(index + 1).padStart(2, "0")}</span><Icon name={page.icon} /><b>{page.label}</b></button>)}</nav>
        <div className="workspace-meta">
          <span><i />{engine?.installed ? "ENGINE READY" : "ENGINE OFFLINE"}</span>
          <div className="workspace-windows-menu"><button aria-expanded={windowsMenuOpen} className="workspace-windows-button" onClick={() => setWindowsMenuOpen((open) => !open)} type="button"><Icon name="window" />WINDOWS</button>{windowsMenuOpen ? <div role="menu"><button onClick={() => { setWindowsMenuOpen(false); setPreferencesOpen(true); }} role="menuitem" type="button"><Icon name="settings" />Preferences</button><RuntimeMenuItems onAction={runRuntimeAction} runtime={runtime} /></div> : null}</div>
          <button aria-label={theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"} onClick={onToggleTheme} title={theme === "light" ? "Dark mode" : "Light mode"} type="button"><Icon name={theme === "light" ? "moon" : "sun"} /></button>
        </div>
      </header>
      <div className="workspace-body">
        <aside className="project-rail"><button aria-label="Về danh sách project" onClick={onBack} type="button"><Icon name="back" /></button><div className="rail-project"><span>{project.name.slice(0, 2).toUpperCase()}</span><b>{project.name}</b><small>{project.accent}</small></div><div className="rail-spine">PRO4BRO / LOCAL SESSION / {project.id.slice(0, 6).toUpperCase()}</div><button aria-label="Project files" type="button"><Icon name="folder" /></button></aside>
        <section className={`workspace-stage ${activePage === "voice-manipulator" ? "has-modes" : ""} ${activePage === "speech-to-text" ? "is-compact-heading" : ""}`}>
          {activePage !== "speech-to-text" ? <header className="stage-heading"><div><span>{manifest.eyebrow}</span><h1>{manifest.label}</h1></div><div className="stage-lineage"><span>PROJECT</span><b>{project.name}</b><i /><span>TAKE</span><b>{take?.name ?? "Chưa chọn"}</b></div></header> : null}
          {activePage === "voice-manipulator" ? <div className="mode-area"><div className="mode-switcher" role="tablist" aria-label="Chế độ Voice Manipulator">{manifest.modes.map((mode) => { const planned = manifest.plannedModes.includes(mode); return <button aria-selected={activeMode === mode} className={activeMode === mode ? "is-active" : ""} key={mode} onClick={() => setActiveMode(mode)} role="tab" type="button"><span>{modeLabels[mode]}</span>{planned ? <small>PLANNED</small> : null}</button>; })}</div>{manifest.plannedModes.includes(activeMode) ? <div className="processor-banner" role="status"><b>{modeLabels[activeMode]}</b><span>Workspace contract đã sẵn sàng · processor adapter chưa được cài</span></div> : null}</div> : null}
          <div className={`studio-board studio-board--${activePage} ${manifest.columns.left.length ? "" : "is-two-column"}`} style={{ "--left-column": `${leftWidth}px`, "--right-column": `${rightWidth}px` } as CSSProperties}>
            <div className="module-column module-column--left">{manifest.columns.left.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
            <div aria-label="Co kéo cột trái" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => resizeWithKeyboard("left", event)} onPointerDown={(event) => beginResize("left", event)} role="separator" tabIndex={0}><i /></div>
            <div className="module-column module-column--center">{manifest.columns.center.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
            <div aria-label="Co kéo cột phải" aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => resizeWithKeyboard("right", event)} onPointerDown={(event) => beginResize("right", event)} role="separator" tabIndex={0}><i /></div>
            <div className="module-column module-column--right">{manifest.columns.right.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
            <div className="module-column module-column--bottom">{manifest.columns.bottom.map((id) => <ModuleRegistry context={context} id={id} key={id} />)}</div>
          </div>
        </section>
      </div>
      <WorkspaceStatusBar assets={mediaAssets} metrics={systemMetrics} />
      {notice ? <div className="studio-notice" role="status"><i />{notice}</div> : null}
      {job ? <div className="studio-job" role="status"><span><i /><i /><i /></span><b>{job}</b><small>Không đóng app trong khi model đang xử lý.</small></div> : null}
      {preferencesOpen ? <PreferencesDialog preferences={preferences} saving={preferencesSaving} onClose={() => setPreferencesOpen(false)} onSave={(next) => void savePreferences(next)} /> : null}
    </main>
  );
}

function PreferencesDialog({ preferences, saving, onClose, onSave }: { preferences: AppPreferences; saving: boolean; onClose: () => void; onSave: (preferences: AppPreferences) => void }) {
  const [draft, setDraft] = useState(preferences);
  const emotionOptions = EMOTION_OPTIONS.filter((option) => option.id !== "normal" && option.id !== "mix");
  return (
    <div className="preferences-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label="Preferences" aria-modal="true" className="preferences-dialog" role="dialog">
        <header><div><span>WINDOWS / PREFERENCES</span><h2>Transcript & Emotion Display</h2></div><button aria-label="Đóng Preferences" onClick={onClose} type="button">×</button></header>
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
        </section>        <section className="preferences-section preferences-section--emotion"><h3>Emotion text in Script</h3><p>Chữ không có emotion giữ màu theo Light/Dark. Các từ đã gán emotion nhận màu từ gradient hoặc màu riêng.</p>
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
