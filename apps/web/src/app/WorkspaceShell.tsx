import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { api } from "../api/client";
import { DEFAULT_EMOTION_STYLE } from "../domain/emotion-style";
import { EMOTION_OPTIONS } from "../domain/emotions";
import type {
  AppPreferences,
  EmotionLabel,
  EngineProfileSchema,
  EngineStatus,
  ManipulatorMode,
  MediaImportChoice,
  Project,
  ProjectMediaAsset,
  RecordingWaveformPreview,
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

interface WorkspaceShellProps {
  project: Project;
  engine: EngineStatus | null;
  onBack: () => void;
  onPageChange: (page: WorkspacePage) => Promise<Project>;
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
  return { aiReview: { enabled: false, baseUrl: "", model: "", apiKey: null, apiKeyConfigured: false }, emotionStyle: { ...DEFAULT_EMOTION_STYLE, emotionColors: { ...DEFAULT_EMOTION_STYLE.emotionColors } } };
}

function isBackgroundTranscribing(asset: ProjectMediaAsset) {
  return ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus);
}

export function WorkspaceShell({ project, engine, onBack, onPageChange, theme, onToggleTheme }: WorkspaceShellProps) {
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
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recordingPreview, setRecordingPreview] = useState<RecordingWaveformPreview | null>(null);
  const [liveTranscriptActive, setLiveTranscriptActive] = useState(false);
  const [aiReviewBusy, setAiReviewBusy] = useState(false);
  const [trainingCatalog, setTrainingCatalog] = useState<TrainingCatalog>(emptyTrainingCatalog);
  const [profileSchema, setProfileSchema] = useState<EngineProfileSchema | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
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

  scriptRef.current = script;
  mediaAssetsRef.current = mediaAssets;

  useEffect(() => {
    if (!selectedAssetId) localStorage.setItem(scratchStorageKey, script);
  }, [script, scratchStorageKey, selectedAssetId]);

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
    return () => { cancelled = true; };
  }, [project.id]);

  const hasBackgroundTranscription = mediaAssets.some(isBackgroundTranscribing);

  useEffect(() => {
    if (!hasBackgroundTranscription) return;
    let cancelled = false;
    const refresh = () => {
      void api.listProjectMedia(project.id).then((assets) => {
        if (cancelled) return;
        const currentAssets = mediaAssetsRef.current;
        const currentSelected = currentAssets.find((asset) => asset.id === selectedAssetId);
        const selected = assets.find((asset) => asset.id === selectedAssetId);
        const selectedChanged = Boolean(selected && (!currentSelected || selected.updatedAt !== currentSelected.updatedAt));
        setMediaAssets((current) => {
          const unchanged = current.length === assets.length && current.every((asset, index) => asset.id === assets[index]?.id && asset.updatedAt === assets[index]?.updatedAt);
          return unchanged ? current : assets;
        });
        if (selected && selectedChanged && !scriptDirty && !liveTranscriptActive) {
          setTake(selected.url ? { id: selected.studioItemId ?? selected.id, name: selected.name, url: selected.url, duration: selected.duration, text: selected.text, words: selected.words } : null);
          setScript(selected.text);
        }
      }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [project.id, hasBackgroundTranscription, selectedAssetId, scriptDirty, liveTranscriptActive]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void api.getSystemStatus().then((metrics) => { if (!cancelled) setSystemMetrics(metrics); }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 1400);
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
    setTake(asset.url ? { id: asset.studioItemId ?? asset.id, name: asset.name, url: asset.url, duration: asset.duration, text: asset.text, words: asset.words } : null);
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

  async function changeWordAnnotations(words: StudioWord[]) {
    if (!selectedAssetId) return;
    const asset = mediaAssets.find((item) => item.id === selectedAssetId);
    if (!asset) return;
    const wordSpeakerIds = words.map((word) => word.speakerId).filter((id): id is string => Boolean(id));
    const wordEnvironmentIds = words.flatMap((word) => word.environmentProfileIds ?? []);
    const speakerProfileIds = [...new Set([...asset.speakerProfileIds, ...wordSpeakerIds])];
    const environmentProfileIds = [...new Set([...asset.environmentProfileIds, ...wordEnvironmentIds])];
    const emotions = [...new Set(words.map((word) => word.emotion ?? asset.emotion))];
    const emotion = emotions.length > 1 ? "mix" : emotions[0] ?? asset.emotion;
    setTake((current) => current ? { ...current, words } : current);
    setMediaAssets((current) => current.map((item) => item.id === asset.id ? { ...item, words, speakerProfileIds, environmentProfileIds, emotion } : item));
    try {
      await api.updateMediaScript(project.id, asset.id, scriptRef.current, "user", words);
      const updated = await api.updateMediaAnnotations(project.id, asset.id, speakerProfileIds, environmentProfileIds, emotion);
      setMediaAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`Đã gán ${speakerProfileIds.length} speaker · ${environmentProfileIds.length} environment.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không lưu được nhãn theo từ");
    }
  }

  async function processCapturedAudio(captured: CapturedAudio) {
    setTake(captured);
    setMediaBusy(true);
    try {
      const result = await api.importProjectMedia(project.id, captured.file, "record", captured.realtimeText, false, true);
      flushCurrentMediaDraft();
      storeMediaAsset(result.asset);
      applyMediaAsset(result.asset);
      setNotice("Bản thu đã vào Media Pool. STT kỹ chạy nền; hoàn tất thì bấm AI fix trong Script để duyệt.");
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

  async function queueSelectedTranscriptions() {
    const assetIds = mediaAssets.filter((asset) => asset.transcriptionSelected && asset.status !== "no-audio" && !["queued", "processing", "reviewing", "complete"].includes(asset.transcriptionStatus)).map((asset) => asset.id);
    if (!assetIds.length) {
      setNotice("Hãy tick STT cho ít nhất một footage chưa có transcript.");
      return;
    }
    try {
      const queued = await api.enqueueMediaTranscriptions(project.id, assetIds);
      setMediaAssets((current) => current.map((asset) => queued.find((item) => item.id === asset.id) ?? asset));
      setNotice(`Đã đưa ${queued.length} footage vào hàng chờ STT. Chạy lần lượt theo thứ tự thêm vào và không khóa UI.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không tạo được hàng chờ STT");
    }
  }

  async function removeMediaAsset(asset: ProjectMediaAsset) {
    if (!window.confirm(`Remove "${asset.name}" khỏi Media Pool? File đã import trong project cũng sẽ bị xóa.`)) return;
    try {
      await api.removeProjectMedia(project.id, asset.id);
      setMediaAssets((current) => {
        const remaining = current.filter((item) => item.id !== asset.id);
        if (selectedAssetId === asset.id) {
          const next = remaining[0] ?? null;
          if (next) applyMediaAsset(next);
          else {
            setSelectedAssetId(null);
            setTake(null);
            setScript(localStorage.getItem(scratchStorageKey) ?? "");
          }
        }
        return remaining;
      });
      setNotice(`Đã remove ${asset.name} khỏi Media Pool.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể remove footage");
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
  const latestAiRevision = [...(selectedMediaAsset?.revisions ?? [])].reverse().find((revision) => revision.source === "ai") ?? null;
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
    emotionStyle: preferences.emotionStyle,
    aiReviewText: latestAiRevision?.text ?? null,
    aiReviewKey: latestAiRevision?.id ?? null,
    aiReviewBusy,
    canRunAiReview,
    trainingCatalog,
    profileSchema,
    onScriptChange: changeScript,
    onVoiceChange: setSelectedVoice,
    onSpeedChange: setSpeed,
    onGainChange: (value) => setGain(Math.max(-96, Math.min(96, value))),
    onTakeChange: (captured) => void processCapturedAudio(captured),
    onImportMedia: (choices) => void importMedia(choices),
    onSelectAsset: selectMediaAsset,
    onRecordingPreview: setRecordingPreview,
    onLiveTranscript: handleLiveTranscript,
    onTimelineEditsChange: (ranges, gainKeyframes) => void updateTimelineEdits(ranges, gainKeyframes),
    onToggleTraining: (assetId, selected) => void toggleTrainingAsset(assetId, selected),
    onToggleTranscription: (assetId, selected) => void toggleTranscriptionAsset(assetId, selected),
    onQueueTranscriptions: () => void queueSelectedTranscriptions(),
    onRemoveAsset: (asset) => void removeMediaAsset(asset),
    onUpdateAnnotations: (assetId, speakerProfileIds, environmentProfileIds, emotion) => void updateMediaAnnotations(assetId, speakerProfileIds, environmentProfileIds, emotion),
    onWordsChange: (words) => void changeWordAnnotations(words),
    onCatalogChange: changeCatalog,
    onSendToTraining: sendSelectedToTraining,
    onGenerate: () => void generateVoice(),
    onDeferredAction: (action) => {
      if (action === "STT kỹ") void runAccurateTranscription();
      else setNotice(`${action} chưa có processor phù hợp.`);
    },
    onRunAiReview: () => void runAiReview(),
  }), [activePage, aiReviewBusy, gain, liveTranscriptActive, mediaAssets, mediaBusy, profileSchema, recordingPreview, script, selectedAssetId, selectedVoice, speed, take, trainingCatalog]);

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
        <button className="workspace-brand" onClick={onBack} type="button"><span>P4B</span><b>VOICE<br />MANIPULATOR</b></button>
        <nav aria-label="Quy trình chính">{pages.map((page, index) => <button className={activePage === page.id ? "is-active" : ""} key={page.id} onClick={() => void selectPage(page.id)} type="button"><span>{String(index + 1).padStart(2, "0")}</span><Icon name={page.icon} /><b>{page.label}</b></button>)}</nav>
        <div className="workspace-meta">
          <span><i />{engine?.installed ? "ENGINE READY" : "ENGINE OFFLINE"}</span>
          <div className="workspace-windows-menu"><button aria-expanded={windowsMenuOpen} className="workspace-windows-button" onClick={() => setWindowsMenuOpen((open) => !open)} type="button"><Icon name="window" />WINDOWS</button>{windowsMenuOpen ? <div role="menu"><button onClick={() => { setWindowsMenuOpen(false); setPreferencesOpen(true); }} role="menuitem" type="button"><Icon name="settings" />Preferences</button></div> : null}</div>
          <button aria-label={theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"} onClick={onToggleTheme} title={theme === "light" ? "Dark mode" : "Light mode"} type="button"><Icon name={theme === "light" ? "moon" : "sun"} /></button>
        </div>
      </header>
      <div className="workspace-body">
        <aside className="project-rail"><button aria-label="Về danh sách project" onClick={onBack} type="button"><Icon name="back" /></button><div className="rail-project"><span>{project.name.slice(0, 2).toUpperCase()}</span><b>{project.name}</b><small>{project.accent}</small></div><div className="rail-spine">PRO4BRO / LOCAL SESSION / {project.id.slice(0, 6).toUpperCase()}</div><button aria-label="Project files" type="button"><Icon name="folder" /></button></aside>
        <section className={`workspace-stage ${activePage === "voice-manipulator" ? "has-modes" : ""}`}>
          <header className="stage-heading"><div><span>{manifest.eyebrow}</span><h1>{manifest.label}</h1></div><div className="stage-lineage"><span>PROJECT</span><b>{project.name}</b><i /><span>TAKE</span><b>{take?.name ?? "Chưa chọn"}</b></div></header>
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
    <div className="preferences-backdrop">
      <section aria-label="Preferences" aria-modal="true" className="preferences-dialog" role="dialog">
        <header><div><span>WINDOWS / PREFERENCES</span><h2>Transcript & Emotion Display</h2></div><button aria-label="Đóng Preferences" onClick={onClose} type="button">×</button></header>
        <section className="preferences-section"><h3>AI Transcript Review</h3><p>STT kỹ chạy local ở background. AI fix chỉ gửi transcript tới API tương thích OpenAI khi bạn bấm nút AI fix trong Script.</p>
          <label className="preferences-switch"><input checked={draft.aiReview.enabled} onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, enabled: event.target.checked } })} type="checkbox" /><span>Bật AI check transcript</span></label>
          <label><span>Base URL</span><input onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, baseUrl: event.target.value } })} placeholder="https://api.openai.com/v1" value={draft.aiReview.baseUrl} /></label>
          <label><span>Model</span><input onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, model: event.target.value } })} placeholder="gpt-4.1-mini" value={draft.aiReview.model} /></label>
          <label><span>API key {draft.aiReview.apiKeyConfigured ? "(đã lưu)" : ""}</span><input onChange={(event) => setDraft({ ...draft, aiReview: { ...draft.aiReview, apiKey: event.target.value || null } })} placeholder={draft.aiReview.apiKeyConfigured ? "Để trống để giữ key hiện tại" : "Nhập API key"} type="password" value={draft.aiReview.apiKey ?? ""} /></label>
          <small className="preferences-note">Key chỉ được giữ trong dữ liệu runtime cục bộ, không ghi vào project hay Git.</small>
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
