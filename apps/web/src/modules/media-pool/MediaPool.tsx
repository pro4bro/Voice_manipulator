import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { api } from "../../api/client";
import type { PendingObsRecordingSlot } from "../recorder/ObsCaptureController";
import { EMOTION_OPTIONS, emotionLabel } from "../../domain/emotions";
import { missingPreparation } from "../../domain/footagePipeline";
import { obsTrackLabel } from "../../domain/obs-track-label";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { EmotionLabel, EnvironmentNoiseProfile, MediaImportChoice, ObsLiveLinkRecordingJournal, PendingLocalMedia, ProjectAsrAdapter, ProjectMediaAsset, SpeakerProfile, TrainingModelOption, WorkspacePage } from "../../domain/types";
import { SendToMenu, type SendTarget } from "../../ui/SendToMenu";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { TaskStop } from "../../ui/TaskStop";
import { LocalMediaImportDialog } from "./LocalMediaImportDialog";
import { createMediaPoolFolder, EMPTY_MEDIA_POOL_ORGANIZATION, moveMediaPoolAsset, type MediaPoolOrganization } from "./media-organization";
import "./media-pool-import.css";
import "./media-pool-organization.css";
import "./media-pool.css";

const STT_MODELS = [
  { id: "tiny", label: "Tiny · nhanh nhất / yếu nhất" },
  { id: "base", label: "Base · nhẹ" },
  { id: "small", label: "Small · cân bằng nhẹ" },
  { id: "medium", label: "Medium · chính xác hơn" },
  { id: "large-v3", label: "Large v3 · mạnh nhất / mặc định" },
] as const;

interface SttChoice {
  value: string;
  label: string;
  group: string;
  available: boolean;
  status: string;
  engine: TrainingModelOption | null;
}

/**
 * What the STT select offers, read from the engine descriptors. An engine with
 * a `model` choice contributes one entry per model; any other engine is one
 * entry under its own id. With no descriptors (an older API) the built-in
 * Whisper list still works.
 */
export function sttChoices(engines: TrainingModelOption[], adapters: ProjectAsrAdapter[] = []): SttChoice[] {
  if (!engines.length) {
    return STT_MODELS.map((model) => ({ value: model.id, label: model.label, group: "faster-whisper", available: true, status: "", engine: null }));
  }
  return engines.flatMap((engine) => {
    const models = engine.parameters.find((spec) => spec.key === "model" && spec.kind === "choice");
    if (models) {
      return models.options.map((option) => {
        const status = engine.modelStatus?.[String(option.value)] ?? engine.status;
        return { value: String(option.value), label: option.label, group: engine.label, available: engine.available && (!engine.modelStatus || status === "Sẵn sàng."), status, engine };
      });
    }
    // Adapters this project trained for the engine follow it, as `engine@adapter`.
    const trained = adapters
      .filter((adapter) => adapter.engine === engine.id)
      .map((adapter) => ({ value: `${engine.id}@${adapter.id}`, label: `+ ${adapter.name}`, group: engine.label, available: engine.available, status: engine.status, engine }));
    return [{ value: engine.id, label: engine.label, group: engine.label, available: engine.available, status: engine.status, engine }, ...trained];
  });
}

function reconcileOrganizationAssets(
  organization: MediaPoolOrganization,
  assetIds: string[],
): MediaPoolOrganization {
  const currentIds = new Set(assetIds);
  const nextAssets = organization.assets.filter((placement) => currentIds.has(placement.assetId));
  const placedIds = new Set(nextAssets.map((placement) => placement.assetId));
  let nextRootOrder = nextAssets
    .filter((placement) => placement.folderId === null)
    .reduce((maximum, placement) => Math.max(maximum, placement.order), -1) + 1;
  for (const assetId of assetIds) {
    if (placedIds.has(assetId)) continue;
    nextAssets.push({ assetId, folderId: null, order: nextRootOrder++ });
    placedIds.add(assetId);
  }
  const changed = nextAssets.length !== organization.assets.length
    || nextAssets.some((placement, index) => {
      const existing = organization.assets[index];
      return !existing || placement.assetId !== existing.assetId
        || placement.folderId !== existing.folderId || placement.order !== existing.order;
    });
  return changed ? { ...organization, assets: nextAssets } : organization;
}

const MEDIA_ACCEPT = [
  "audio/*", "video/*", ".mov", ".mp4", ".mkv", ".avi", ".webm", ".mxf",
  ".h264", ".h265", ".hevc", ".av1", ".prores", ".mp3", ".wav", ".aac",
  ".wma", ".m4a", ".flac", ".ogg", ".opus", ".aif", ".aiff", ".ac3",
].join(",");

export type MediaBatchAction =
  | { kind: "annotations"; changes: Array<{ assetId: string; speakerProfileIds: string[]; environmentProfileIds: string[]; emotion: EmotionLabel }> }
  | { kind: "disabled"; assetIds: string[]; disabled: boolean }
  | { kind: "selection"; target: "import" | "stt" | "diarization" | "training"; assetIds: string[]; selected: boolean }
  | { kind: "recycle" | "restore" | "delete"; assetIds: string[] };

export interface PendingMediaImportRow {
  id: string;
  name: string;
  status: "choosing" | "queued" | "importing" | "caching" | "preparing" | "recording" | "saving" | "error";
  origin?: "import" | "record";
  detail?: string;
  retryable?: boolean;
  obsSessionId?: string;
}

function pendingSlotLabels(row: PendingMediaImportRow) {
  if (row.status === "error") return row.origin === "record"
    ? { label: "LỖI THU ÂM", status: "THU ÂM THẤT BẠI" }
    : { label: "LỖI IMPORT", status: "IMPORT THẤT BẠI" };
  return {
    choosing: { label: "CHỌN TRACK", status: "ĐANG CHỜ CHỌN TRACK OBS" },
    queued: { label: "ĐANG CHỜ IMPORT", status: "ĐANG CHỜ TRONG HÀNG IMPORT" },
    importing: { label: "ĐANG IMPORT", status: "ĐANG ĐỌC MEDIA VÀ TẠO FOOTAGE" },
    caching: { label: "ĐANG CACHE", status: "ĐANG CACHE VÀ TẠO FOOTAGE" },
    preparing: { label: "ĐANG MỞ NGUỒN THU", status: "ĐANG MỞ NGUỒN THU ÂM" },
    recording: { label: "ĐANG THU", status: "ĐANG THU ÂM" },
    saving: { label: "ĐANG LƯU BẢN THU", status: "ĐANG LƯU VÀ CHUẨN BỊ AUDIO" },
  }[row.status];
}

interface LocalImportPlaceholder {
  id: string;
  name: string;
  status: "choosing" | "queued";
  knownAssetIds: string[];
}

function mediaName(path: string) {
  return path.split(/[\\/]/u).pop() || path;
}

interface MediaPoolProps {
  projectId?: string;
  assets: ProjectMediaAsset[];
  selectedAssetId: string | null;
  selectedImportedTrackId?: string | null;
  selectedScriptAssetIds?: string[] | null;
  busy: boolean;
  workflow: WorkspacePage;
  /** Speech-to-text engines from their descriptors; the select is built from these. */
  sttEngines?: TrainingModelOption[];
  /** Speech-recognition adapters this project trained. */
  asrAdapters?: ProjectAsrAdapter[];
  speakers: SpeakerProfile[];
  environments: EnvironmentNoiseProfile[];
  onImport: (choices: MediaImportChoice[]) => void;
  onImportLocal?: () => void;
  pendingLocalMedia?: PendingLocalMedia | null;
  onPendingLocalTrackChange?: (streamIndex: number, field: "imported" | "transcribe", selected: boolean) => void;
  onConfirmPendingLocalMedia?: (mode: "import" | "follow", sttSegmentSeconds?: number, cacheLocal?: boolean) => void;
  onCancelPendingLocalMedia?: () => void;
  onFinishGrowingMkv?: (assetId: string) => void;
  onStartGrowingMkvDetailedStt?: (assetId: string, segmentSeconds: number) => void;
  onSetLocalCache?: (assetId: string, enabled: boolean) => void;
  onSelect: (assetId: string) => void;
  onClearSelection?: () => void;
  onSelectTrack?: (assetId: string) => void;
  onScriptSelectionChange?: (assetIds: string[]) => void;
  onToggleImport?: (assetId: string, selected: boolean, streamIndex?: number) => void;
  onToggleTraining: (assetId: string, selected: boolean) => void;
  onToggleTranscription: (assetId: string, selected: boolean) => void;
  onToggleDiarization?: (assetId: string, selected: boolean) => void;
  onQueueTranscriptions: (model: string) => void;
  onControlTranscriptions: (action: "pause" | "resume" | "stop" | "stop-all", assetIds?: string[]) => void | Promise<unknown>;
  onRemove: (asset: ProjectMediaAsset) => void;
  onBatchAction: (action: MediaBatchAction) => void;
  onRestore: (asset: ProjectMediaAsset) => void;
  onReveal: (asset: ProjectMediaAsset, location: "original" | "project") => void;
  onSetDisabled: (asset: ProjectMediaAsset, disabled: boolean) => void;
  onUpdateAnnotations: (assetId: string, speakerProfileIds: string[], environmentProfileIds: string[], emotion: EmotionLabel) => void;
  onSendToTraining: () => void;
  onSendTo?: (target: SendTarget, assetIds: string[]) => void;
  onOpenObsRecording?: (recordingId: string) => void;
  onOpenObsTrack?: (recordingId: string, channelId: string) => void;
  selectedObsRecordingId?: string | null;
  onObsArchiveReady?: (recordingId: string) => Promise<void>;
  onRemovedRecording?: (recordingId: string) => void;
  pendingNativeMediaPaths?: string[];
  pendingMediaImports?: PendingMediaImportRow[];
  pendingObsRecording?: PendingObsRecordingSlot | null;
  activeTrainingSpeakerIds?: string[];
  onConfirmNativeMediaImport?: (paths: string[], cacheLocal: boolean) => void;
  onCancelNativeMediaImport?: () => void;
  onRetryPendingImport?: (id: string) => void;
  onDismissPendingImport?: (id: string) => void;
}

function PendingObsFootage({ projectId, assets, showEmpty, startingRecording, onOpenRecording, onOpenTrack, selectedRecordingId, onArchiveReady, onRemovedRecording }: {
  projectId: string;
  assets: ProjectMediaAsset[];
  showEmpty: boolean;
  startingRecording?: PendingObsRecordingSlot | null;
  onOpenRecording?: (recordingId: string) => void;
  onOpenTrack?: (recordingId: string, channelId: string) => void;
  selectedRecordingId?: string | null;
  onArchiveReady?: (recordingId: string) => Promise<void>;
  onRemovedRecording?: (recordingId: string) => void;
}) {
  const [journals, setJournals] = useState<ObsLiveLinkRecordingJournal[]>([]);
  const [recordingMenu, setRecordingMenu] = useState<{ recordingId: string; left: number; top: number } | null>(null);
  const [recycleError, setRecycleError] = useState<string | null>(null);
  const [recycledOpen, setRecycledOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<ObsLiveLinkRecordingJournal | null>(null);
  const [detailSeconds, setDetailSeconds] = useState(60);
  const [detailChannels, setDetailChannels] = useState<string[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMessage, setDetailMessage] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ recordingId: string; channelId: string; url: string;
    startSeconds: number; endSeconds: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);
  const previewRequest = useRef(0);
  const archiveReady = useRef(onArchiveReady);
  const announced = useRef(new Set<string>());
  const retried = useRef(new Set<string>());
  archiveReady.current = onArchiveReady;

  useEffect(() => {
    if (!recordingMenu) return;
    const dismiss = (event: globalThis.MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".media-obs-recording-menu"))
        setRecordingMenu(null);
    };
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setRecordingMenu(null);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", keydown);
    };
  }, [recordingMenu]);

  useEffect(() => {
    setPreview(null);
    return () => {
      previewRequest.current += 1;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, [projectId]);

  async function playSavedPcm(recordingId: string, channelId: string) {
    const key = `${recordingId}:${channelId}`;
    const requestId = ++previewRequest.current;
    setPreviewBusy(key);
    setPreviewError(null);
    try {
      const audio = await api.previewObsLiveLinkChannel(projectId, recordingId, channelId);
      if (requestId !== previewRequest.current) return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      const url = URL.createObjectURL(audio.blob);
      previewUrl.current = url;
      setPreview({ recordingId, channelId, url, startSeconds: audio.startSeconds,
        endSeconds: audio.endSeconds });
    } catch (reason) {
      if (requestId === previewRequest.current)
        setPreviewError(reason instanceof Error ? reason.message : "Không nghe thử được PCM đã lưu.");
    } finally {
      if (requestId === previewRequest.current) setPreviewBusy(null);
    }
  }

  async function retry(recordingId: string) {
    setRetryingId(recordingId);
    setRetryError(null);
    try {
      await api.retryObsLiveLinkArchive(projectId, recordingId);
      setJournals(await api.listObsLiveLinkRecordings(projectId, true));
      await archiveReady.current?.(recordingId);
    } catch (reason) {
      setRetryError(reason instanceof Error ? reason.message : "Không thể tạo MKA.");
    } finally {
      setRetryingId(null);
    }
  }

  async function refreshJournals() {
    setJournals(await api.listObsLiveLinkRecordings(projectId, true));
  }

  async function recycle(recordingId: string) {
    setRecycleError(null);
    try {
      await api.recycleObsLiveLinkRecording(projectId, recordingId);
      setRecordingMenu(null);
      onRemovedRecording?.(recordingId);
      await refreshJournals();
    } catch (reason) {
      setRecycleError(reason instanceof Error ? reason.message : "Không đưa được bản ghi OBS vào Recycle Bin.");
    }
  }

  async function restore(recordingId: string) {
    setRecycleError(null);
    try {
      await api.restoreObsLiveLinkRecording(projectId, recordingId);
      await refreshJournals();
    } catch (reason) {
      setRecycleError(reason instanceof Error ? reason.message : "Không khôi phục được bản ghi OBS.");
    }
  }

  async function permanentlyDelete(recordingId: string) {
    const journal = recycled.find((item) => item.recording.recordingId === recordingId);
    const name = journal?.recording.displayName || "bản ghi OBS này";
    if (!window.confirm(`Xóa vĩnh viễn ${name} và PCM đã lưu? Không thể khôi phục thao tác này.`)) return;
    setRecycleError(null);
    try {
      await api.deleteObsLiveLinkRecording(projectId, recordingId);
      onRemovedRecording?.(recordingId);
      await refreshJournals();
    } catch (reason) {
      setRecycleError(reason instanceof Error ? reason.message : "Không xóa vĩnh viễn được bản ghi OBS.");
    }
  }

  useEffect(() => {
    let active = true;
    let requestRevision = 0;
    announced.current.clear();
    retried.current.clear();
    const refresh = async () => {
      const revision = ++requestRevision;
      try {
        const records = await api.listObsLiveLinkRecordings(projectId, true);
        if (!active || revision !== requestRevision) return;
        setJournals(records);
        for (const journal of records) {
          const recording = journal.recording;
          if (journal.deletedAt || recording.archiveStatus !== "ready" || announced.current.has(recording.recordingId)) continue;
          announced.current.add(recording.recordingId);
          void archiveReady.current?.(recording.recordingId).catch(() => announced.current.delete(recording.recordingId));
        }
        const latest = records[0]?.recording;
        if (!records[0]?.deletedAt && latest?.status === "stopped" && latest.archiveStatus === "error" &&
            !retried.current.has(latest.recordingId)) {
          retried.current.add(latest.recordingId);
          void retry(latest.recordingId);
        }
      } catch { /* Keep the last known recording rows while the API reconnects. */ }
    };
    void refresh();
    const recordingsChanged = () => void refresh();
    window.addEventListener("pro4bro:obs-recordings-changed", recordingsChanged);
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("pro4bro:obs-recordings-changed", recordingsChanged); };
  }, [projectId]);

  const recycled = journals.filter(({ recording, deletedAt }) => recording.projectId === projectId && Boolean(deletedAt));
  const pending = journals.filter(({ recording, deletedAt }) => recording.projectId === projectId && !deletedAt &&
    !assets.some((asset) => asset.obsRecordingId === recording.recordingId && asset.sourceExtension === ".mka"));
  const visibleStarting = startingRecording && !journals.some(({ recording }) => recording.recordingId === startingRecording.recordingId)
    && !assets.some((asset) => startingRecording.recordingId && asset.obsRecordingId === startingRecording.recordingId) ? startingRecording : null;
  const canRecycleFor = ({ recording, detailedStt }: ObsLiveLinkRecordingJournal) =>
    recording.status === "stopped" && recording.archiveStatus !== "pending" && !detailedStt?.active &&
    !assets.some((asset) => asset.obsRecordingId === recording.recordingId);
  async function startDetail() {
    if (!detailTarget) return;
    setDetailBusy(true);
    setDetailMessage(null);
    try {
      const result = await api.startObsLiveLinkDetailedStt(projectId, detailTarget.recording.recordingId,
                                                            detailSeconds, detailChannels);
      setDetailMessage(`STT kỹ đang chạy cho ${Object.keys(result.tracks).length} track; block tiếp theo dài ${detailSeconds} giây.`);
      setDetailTarget(null);
    } catch (reason) {
      setDetailMessage(reason instanceof Error ? reason.message : "Không bắt đầu được STT kỹ.");
    } finally {
      setDetailBusy(false);
    }
  }
  return <>{visibleStarting ? <div aria-busy={visibleStarting.status === "starting"} aria-label={`Footage OBS ${visibleStarting.name}: ${visibleStarting.status === "error" ? "LỖI MỞ PHIÊN" : "ĐANG MỞ PHIÊN"}`} className={`media-pool-importing ${visibleStarting.status === "error" ? "media-pool-importing--error" : "media-pool-importing--preparing"}`}>
    <span aria-hidden="true" className="media-pool-importing__spinner"><Icon name="waveform" /></span>
    <span><b>{visibleStarting.name}</b><small role="status">{visibleStarting.detail || (visibleStarting.status === "error" ? "Không mở được phiên OBS" : "Đang mở phiên OBS LiveLink…")}</small></span>
  </div> : null}{pending.map(({ recording, channels, detailedStt, durableChannelIds }) => {
    const working = recording.status === "recording" || retryingId === recording.recordingId || recording.status === "stopped" && recording.archiveStatus !== "error";
    const state = recording.status === "paused" ? "TẠM DỪNG" : recording.status !== "stopped" ? "ĐANG GHI" :
      retryingId === recording.recordingId ? "ĐANG TẠO LẠI MKA" :
      recording.archiveStatus === "error" ? "MKA LỖI" :
      recording.archiveStatus === "ready" ? "ĐANG CẬP NHẬT MEDIA POOL" : "ĐANG TẠO MKA";
    const cursors = Object.values(detailedStt?.tracks ?? {}).map((track) => track.cursor / 24000);
    const detailLabel = detailedStt?.error ? `STT kỹ lỗi: ${detailedStt.error}` : detailedStt?.stopMode
      ? detailedStt.active ? "Đã dừng hàng đợi STT · đang hoàn tất đoạn hiện tại" : "STT kỹ đã dừng · bấm chạy tiếp để tiếp tục"
      : cursors.length
      ? `STT kỹ ${cursors.length} track · đã xử lý ${Math.min(...cursors).toFixed(0)} giây`
      : recording.status === "stopped" ? "Đang kiểm tra PCM · chờ MKA" : "Phiên thu đang mở · MKA chưa hoàn tất";
    const available = (channels ?? []).filter((channel) => channel.forwardApplied || durableChannelIds?.includes(channel.channelId));
    const expanded = expandedIds.includes(recording.recordingId);
    return <div aria-busy={working} aria-label={`Footage OBS ${recording.displayName || recording.recordingId}: ${state}`} className={`media-pool-item media-pool-item--obs-pending ${selectedRecordingId === recording.recordingId ? "is-selected" : ""}`} key={recording.recordingId} onContextMenu={(event) => { event.preventDefault(); setRecordingMenu({ recordingId: recording.recordingId, left: Math.min(event.clientX, window.innerWidth - 250), top: Math.min(event.clientY, window.innerHeight - 180) }); }}>
      <button aria-expanded={expanded} aria-label={`${expanded ? "Thu gọn" : "Xổ"} track của ${recording.displayName || recording.recordingId}`} className="media-pool-item__expand" onClick={() => setExpandedIds((current) => expanded ? current.filter((id) => id !== recording.recordingId) : [...current, recording.recordingId])} type="button">{expanded ? "▾" : "▸"}</button>
      <button aria-pressed={selectedRecordingId === recording.recordingId} className="media-pool-item__main" onClick={() => { onOpenRecording?.(recording.recordingId); setExpandedIds((current) => current.includes(recording.recordingId) ? current : [...current, recording.recordingId]); }} type="button">
        <span className={`media-kind media-kind--audio${working ? " media-pool-importing__spinner is-working" : ""}`}><Icon name="waveform" /></span>
        <span className="media-item-copy"><strong>{recording.displayName || `OBS LiveLink · ${recording.recordingId.slice(0, 8)}`}</strong><small>OBS LIVELINK · {state}</small><em>{detailLabel}</em></span>
      </button>
      <div aria-label={`Thao tác footage OBS ${recording.displayName || recording.recordingId}`} className="media-pool-item__obs-actions" role="group">
      <button className="media-pool-item__obs-retry" disabled={Boolean(detailedStt?.tracks && !detailedStt.error && (!detailedStt.stopMode || detailedStt.active)) || !durableChannelIds?.length} onClick={() => {
        const journal = journals.find((item) => item.recording.recordingId === recording.recordingId);
        if (!journal) return;
        setDetailTarget(journal);
        setDetailChannels(detailedStt?.tracks ? Object.keys(detailedStt.tracks) :
          (journal.channels ?? []).filter((channel) => journal.durableChannelIds?.includes(channel.channelId))
            .map((channel) => channel.channelId));
        setDetailSeconds(detailedStt?.segmentSeconds ?? 60);
        setDetailMessage(null);
      }} type="button">{detailedStt?.error ? "Thử lại STT" : detailedStt?.stopMode && !detailedStt.active ? "Chạy tiếp STT" : detailedStt?.tracks ? "STT đang chạy" : "STT kỹ"}</button>
      {detailedStt?.tracks && (!detailedStt.stopMode || detailedStt.active) ? <TaskStop scope={`STT OBS · ${recording.displayName || recording.recordingId.slice(0, 8)}`} onStop={async (mode) => {
        const state = await api.stopObsLiveLinkDetailedStt(projectId, recording.recordingId, mode);
        setJournals((current) => current.map((journal) => journal.recording.recordingId === recording.recordingId
          ? { ...journal, detailedStt: state } : journal));
      }} /> : null}
      {recording.status === "stopped" && recording.archiveStatus === "error" ?
        <button className="media-pool-item__obs-retry" disabled={retryingId === recording.recordingId} onClick={() => void retry(recording.recordingId)} type="button">Thử lại</button> : null}
      </div>
      {expanded ? <div className="media-pool-item__channels media-pool-item__live-channels">
        {available.map((channel) => {
          const hasPcm = Boolean(durableChannelIds?.includes(channel.channelId));
          const key = `${recording.recordingId}:${channel.channelId}`;
          const activePreview = preview?.recordingId === recording.recordingId && preview.channelId === channel.channelId ? preview : null;
          return <div className="media-pool-item__channel media-pool-item__live-channel" key={channel.channelId}>
            <button aria-label={`Mở ${obsTrackLabel(channel.relayLabel)} đang ghi`} className="media-pool-item__channel-name" onClick={() => onOpenTrack?.(recording.recordingId, channel.channelId)} title={channel.nativeName || channel.relayLabel} type="button">{channel.slot && obsTrackLabel(channel.relayLabel) !== `Track ${channel.slot}` ? `Track ${channel.slot} · ` : ""}{obsTrackLabel(channel.relayLabel)}<small>{hasPcm ? "PCM ĐÃ LƯU · TIMELINE / SCRIPT" : "CHỜ PCM"}</small></button>
            <button aria-label={`Nghe PCM đã lưu của ${obsTrackLabel(channel.relayLabel)}`} className="media-pool-item__obs-retry" disabled={!hasPcm || previewBusy === key} onClick={() => void playSavedPcm(recording.recordingId, channel.channelId)} type="button">{previewBusy === key ? "ĐANG TẠO…" : "NGHE 30s"}</button>
            {activePreview ? <div className="media-pool-item__live-preview"><small>PCM {durationLabel(activePreview.startSeconds)}–{durationLabel(activePreview.endSeconds)} · bản nghe thử</small><audio aria-label={`Nghe lại ${obsTrackLabel(channel.relayLabel)}`} controls preload="metadata" src={activePreview.url} /></div> : null}
          </div>;
        })}
        {!available.length ? <small>Chưa có track được Forward.</small> : null}
      </div> : null}
    </div>;
  })}{showEmpty && !pending.length && !visibleStarting ? <div className="media-pool-empty"><Icon name="folder" /><b>Chưa có footage</b><span>Import video/audio hoặc thu một take mới.</span></div> : null}
    {recycleError ? <small role="alert">{recycleError}</small> : null}
    {recycled.length ? <section className={`media-recycle-bin ${recycledOpen ? "is-open" : ""}`}>
      <div className="media-recycle-bin__header"><button aria-expanded={recycledOpen} className="media-recycle-bin__toggle" onClick={() => setRecycledOpen((open) => !open)} type="button"><Icon name="trash" /><b>OBS RECYCLE BIN</b><span>{recycled.length}</span><i aria-hidden="true">{recycledOpen ? "▾" : "▸"}</i></button></div>
      {recycledOpen ? <div aria-label="OBS Recycle Bin" className="media-recycle-bin__list media-recycle-bin__list--obs">
        {recycled.map(({ recording }) => <div className="media-pool-item media-pool-item--obs-pending is-recycled" key={recording.recordingId}>
          <span aria-hidden="true" className="media-pool-item__expand">·</span>
          <span className="media-pool-item__main"><span className="media-kind media-kind--audio"><Icon name="waveform" /></span><span className="media-item-copy"><strong>{recording.displayName || `OBS LiveLink · ${recording.recordingId.slice(0, 8)}`}</strong><small>OBS LIVELINK · RECYCLE BIN</small><em>PCM vẫn được giữ trong project</em></span></span>
          <div className="media-pool-item__obs-actions"><button className="media-pool-item__obs-retry" onClick={() => void restore(recording.recordingId)} type="button">Restore</button><button className="media-pool-item__obs-retry media-obs-recording-menu__danger" onClick={() => void permanentlyDelete(recording.recordingId)} type="button">Delete permanently</button></div>
        </div>)}
      </div> : null}
    </section> : null}
    {recordingMenu ? createPortal(<div aria-label="Thao tác footage OBS đang chờ" className="media-context-menu media-obs-recording-menu" role="menu" style={{ left: recordingMenu.left, top: recordingMenu.top }}>
      {(() => {
        const journal = pending.find(({ recording }) => recording.recordingId === recordingMenu.recordingId);
        if (!journal) return null;
        const { recording, detailedStt } = journal;
        return <>
          <button onClick={() => { setRecordingMenu(null); onOpenRecording?.(recording.recordingId); }} role="menuitem" type="button"><Icon name="folder" /> Mở footage</button>
          {recording.status === "stopped" && recording.archiveStatus === "error" ? <button onClick={() => { setRecordingMenu(null); void retry(recording.recordingId); }} role="menuitem" type="button"><Icon name="refresh" /> Thử lại MKA</button> : null}
          {detailedStt?.error || (detailedStt?.stopMode && !detailedStt.active) ? <button onClick={() => { setRecordingMenu(null); const selected = journals.find((item) => item.recording.recordingId === recording.recordingId); if (selected) { setDetailTarget(selected); setDetailChannels(detailedStt?.tracks ? Object.keys(detailedStt.tracks) : (selected.channels ?? []).filter((channel) => selected.durableChannelIds?.includes(channel.channelId)).map((channel) => channel.channelId)); setDetailSeconds(detailedStt?.segmentSeconds ?? 60); setDetailMessage(null); } }} role="menuitem" type="button"><Icon name="refresh" /> Thử lại STT kỹ</button> : null}
          <button className="media-obs-recording-menu__danger" disabled={!canRecycleFor(journal)} onClick={() => void recycle(recording.recordingId)} role="menuitem" type="button"><Icon name="trash" /> Move to Recycle Bin</button>
        </>;
      })()}
    </div>, document.body) : null}
    {retryError ? <small role="alert">{retryError}</small> : null}
    {previewError ? <small role="alert">{previewError}</small> : null}
    {detailMessage ? <small role="status">{detailMessage}</small> : null}
    {detailTarget ? <div className="media-import-backdrop"><section aria-label="Thiết lập STT OBS LiveLink" aria-modal="true" className="media-import-dialog" role="dialog">
      <header><span>OBS STT KỸ</span><strong>{detailTarget.recording.displayName || `OBS LiveLink · ${detailTarget.recording.recordingId.slice(0, 8)}`}</strong></header>
      <p>Lượt đầu đọc toàn bộ PCM đã lưu trên từng track lúc bấm bắt đầu. Các block tiếp theo có 10 giây audio trước ranh giới để ghép chữ; sau khi dừng sẽ xử lý nốt đoạn cuối.</p>
      <div className="media-track-options">{(detailTarget.channels ?? []).filter((channel) => detailTarget.durableChannelIds?.includes(channel.channelId)).map((channel) => <label className="media-track-options__row" key={channel.channelId}>
        <span><b>{channel.slot && obsTrackLabel(channel.relayLabel) !== `Track ${channel.slot}` ? `Track ${channel.slot} · ` : ""}{obsTrackLabel(channel.relayLabel)}</b></span>
        <input aria-label={`STT kỹ ${channel.relayLabel}`} checked={detailChannels.includes(channel.channelId)} onChange={(event) => setDetailChannels((current) => event.target.checked ? [...current, channel.channelId] : current.filter((id) => id !== channel.channelId))} type="checkbox" />
      </label>)}</div>
      <label className="mkv-stt-segment-field">Độ dài block tiếp theo (giây)<input aria-label="Độ dài block STT OBS" max={600} min={10} onChange={(event) => setDetailSeconds(Number(event.target.value))} type="number" value={detailSeconds} /></label>
      <footer><button className="button button--quiet" onClick={() => setDetailTarget(null)} type="button">Hủy</button><button className="button button--accent" disabled={detailBusy || !detailChannels.length || !Number.isInteger(detailSeconds) || detailSeconds < 10 || detailSeconds > 600} onClick={() => void startDetail()} type="button">{detailBusy ? "Đang bắt đầu…" : "Bắt đầu STT kỹ"}</button></footer>
      {detailMessage ? <small role="alert">{detailMessage}</small> : null}
    </section></div> : null}</>;
}

function StageToggle({ name, stage, selected, mixed = false, disabled = false, running = false, recording = false, ariaLabel, onChange }: {
  name: string; stage: "Import" | "STT" | "Speaker Diarization" | "Train";
  selected: boolean; mixed?: boolean; disabled?: boolean; running?: boolean; recording?: boolean; ariaLabel?: string; onChange: (selected: boolean) => void;
}) {
  const status = running ? " · đang chạy" : "";
  const isRecording = stage === "Import" && recording;
  const recordingDescription = "MKV đang ghi / chờ nhập hoàn chỉnh. App tự hoàn tất sau OBS Stop hoặc khi MKV đóng; vẫn có thể đổi lựa chọn Import.";
  return <label className={`media-training-toggle ${selected ? "is-selected" : ""} ${mixed ? "is-mixed" : ""} ${running ? "is-running" : ""} ${isRecording ? "is-recording" : ""}`} title={isRecording ? recordingDescription : running ? `${stage}: đang chạy` : undefined}>
    <input aria-busy={running || isRecording || undefined} aria-description={isRecording ? recordingDescription : undefined} aria-label={`${ariaLabel ?? `${stage} ${name}`}${status}`} checked={selected} disabled={disabled} onChange={(event) => onChange(event.target.checked)}
      ref={(element) => { if (element) element.indeterminate = mixed; }} type="checkbox" />
    <span>{stage === "Speaker Diarization" ? "DIA" : stage.toUpperCase()}</span>
  </label>;
}

interface TranscriptHistoryDialogProps {
  asset: ProjectMediaAsset;
  onClose: () => void;
}

function durationLabel(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.round(safe % 60)).padStart(2, "0")}`;
}

function transcriptionProgressLabel(value: number | undefined) {
  return Math.max(0, Math.min(100, value ?? 0)).toFixed(1);
}

function transcriptionLabel(asset: ProjectMediaAsset) {
  if (asset.status === "no-audio" || asset.transcriptionStatus === "not-applicable") return "NO AUDIO";
  if (asset.transcriptionStatus === "queued") return "QUEUED";
  if (asset.transcriptionStatus === "processing") return "STT ĐANG CHẠY";
  if (asset.transcriptionStatus === "reviewing") return "AI REVIEW";
  if (asset.transcriptionStatus === "error") return "STT ERROR";
  if (asset.transcriptionStatus === "cancelled") return "STT ĐÃ HUỶ";
  if (asset.transcriptionStatus === "skipped") return "NO STT";
  return asset.aiReviewStatus === "complete" ? "AI CHECKED" : "TRANSCRIPT";
}

function TranscriptHistoryDialog({ asset, onClose }: TranscriptHistoryDialogProps) {
  const revisions = asset.revisions.slice().reverse();
  const [revisionId, setRevisionId] = useState(revisions[0]?.id ?? "current");
  const selected = revisions.find((revision) => revision.id === revisionId) ?? revisions[0] ?? null;

  return createPortal(
    <div className="media-history-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label={`Text History: ${asset.name}`} aria-modal="true" className="media-history-dialog" role="dialog">
        <header>
          <div><span>TEXT HISTORY</span><strong>{asset.name}</strong></div>
          <button aria-label="Đóng Text History" onClick={onClose} type="button">×</button>
        </header>
        <div className="media-history-dialog__body">
          <nav aria-label="Các phiên bản transcript">
            {revisions.map((revision) => <button className={revision.id === selected?.id ? "is-active" : ""} key={revision.id} onClick={() => setRevisionId(revision.id)} type="button"><b>{revision.source.toUpperCase()}</b><small>{new Date(revision.createdAt).toLocaleString("vi-VN")}</small></button>)}
            {!revisions.length ? <span>Chưa có transcript được lưu.</span> : null}
          </nav>
          <article>
            <div><b>{selected?.source.toUpperCase() ?? "CHƯA CÓ TEXT"}</b><time>{selected ? new Date(selected.createdAt).toLocaleString("vi-VN") : ""}</time></div>
            <pre>{selected?.text || "Không có transcript trong phiên bản này."}</pre>
          </article>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function MediaPool({
  projectId,
  assets,
  selectedAssetId,
  selectedImportedTrackId = null,
  selectedScriptAssetIds,
  busy,
  workflow,
  sttEngines = [],
  asrAdapters = [],
  speakers,
  environments,
  onImport,
  onImportLocal = () => undefined,
  pendingLocalMedia = null,
  onPendingLocalTrackChange = () => undefined,
  onConfirmPendingLocalMedia = () => undefined,
  onCancelPendingLocalMedia = () => undefined,
  onFinishGrowingMkv = () => undefined,
  onStartGrowingMkvDetailedStt = () => undefined,
  onSetLocalCache = () => undefined,
  onSelect,
  onClearSelection = () => undefined,
  onSelectTrack = () => undefined,
  onScriptSelectionChange,
  onToggleImport = () => undefined,
  onToggleTraining,
  onToggleTranscription,
  onToggleDiarization = () => undefined,
  onQueueTranscriptions,
  onControlTranscriptions,
  onRemove,
  onBatchAction,
  onRestore,
  onReveal,
  onSetDisabled,
  onUpdateAnnotations,
  onSendToTraining, onSendTo,
  onOpenObsRecording,
  onOpenObsTrack,
  selectedObsRecordingId,
  onObsArchiveReady,
  onRemovedRecording,
  pendingNativeMediaPaths = [],
  pendingMediaImports = [],
  pendingObsRecording,
  onDismissPendingImport,
  activeTrainingSpeakerIds = [],
  onConfirmNativeMediaImport = () => undefined,
  onCancelNativeMediaImport = () => undefined,
  onRetryPendingImport = () => undefined,
}: MediaPoolProps) {
  const [pendingImports, setPendingImports] = useState<MediaImportChoice[]>([]);
  const [localImportPlaceholders, setLocalImportPlaceholders] = useState<LocalImportPlaceholder[]>([]);
  const localImportProjectId = useRef(projectId);
  const browserFileInput = useRef<HTMLInputElement | null>(null);
  const pendingGrowingMkv = pendingImports.length === 1 && /\.mkv$/iu.test(pendingImports[0].file.name);
  const [mkvSttDialogOpen, setMkvSttDialogOpen] = useState(false);
  const [mkvSttTargetId, setMkvSttTargetId] = useState<string | null>(null);
  const [mkvSttSegmentSeconds, setMkvSttSegmentSeconds] = useState(60);
  const [nativeCacheChoiceOpen, setNativeCacheChoiceOpen] = useState(false);
  const [localImportDialogOpen, setLocalImportDialogOpen] = useState(false);
  const [cacheFile, setCacheFile] = useState(true);
  const [organization, setOrganization] = useState<MediaPoolOrganization>(EMPTY_MEDIA_POOL_ORGANIZATION);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const organizationRef = useRef(organization);
  organizationRef.current = organization;
  const organizationSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const organizationProjectIdRef = useRef(projectId);
  const organizationProjectGeneration = useRef(0);
  const organizationSaveRevision = useRef(0);
  const lastOrganizationAssetIds = useRef<string[] | null>(null);
  const organizationReadyProject = useRef<string | null>(null);
  const assetListReady = useRef(false);
  const mediaBusyCycleSeen = useRef(false);
  const projectRequiresBusyCycle = useRef(false);
  const projectChanged = organizationProjectIdRef.current !== projectId;
  if (projectChanged) {
    organizationProjectIdRef.current = projectId;
    lastOrganizationAssetIds.current = null;
    organizationReadyProject.current = null;
    assetListReady.current = false;
    mediaBusyCycleSeen.current = false;
    projectRequiresBusyCycle.current = true;
  }
  const mediaAssetIds = assets.map((asset) => asset.id);
  const mediaAssetIdsKey = mediaAssetIds.slice().sort().join("\0");
  const mediaAssetIdsRef = useRef(mediaAssetIds);
  mediaAssetIdsRef.current = mediaAssetIds;
  if (busy) mediaBusyCycleSeen.current = true;
  else if (mediaBusyCycleSeen.current) {
    assetListReady.current = true;
    projectRequiresBusyCycle.current = false;
  } else if (!projectRequiresBusyCycle.current && !projectChanged && mediaAssetIds.length > 0) {
    assetListReady.current = true;
  }
  const draggedAssetId = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ assetId: string; left: number; top: number } | null>(null);
  const [historyAssetId, setHistoryAssetId] = useState<string | null>(null);
  const [sttModel, setSttModel] = useState<string>("large-v3");
  const [selection, setSelection] = useState<ListSelection>({ ids: selectedAssetId && assets.some((asset) => asset.id === selectedAssetId && !asset.deletedAt) ? [selectedAssetId] : [], anchorId: selectedAssetId });
  const [binSelection, setBinSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const trainingAssetIds = useMemo(() => {
    if (!activeTrainingSpeakerIds.length) return new Set<string>();
    const activeSpeakers = new Set(activeTrainingSpeakerIds);
    const ids = new Set<string>();
    for (const item of assets) {
      if (item.speakerProfileIds.some((id) => activeSpeakers.has(id)) || item.words.some((word) =>
        (word.speakerId != null && activeSpeakers.has(word.speakerId)) ||
        (word.manualDiarizationSpeakerId != null && activeSpeakers.has(word.manualDiarizationSpeakerId)))) ids.add(item.id);
    }
    return ids;
  }, [assets, activeTrainingSpeakerIds.join("\0")]);
  const choices = sttChoices(sttEngines, asrAdapters);
  const chosen = choices.find((choice) => choice.value === sttModel) ?? null;
  const choiceGroups = choices.reduce<string[]>((groups, choice) => groups.includes(choice.group) ? groups : [...groups, choice.group], []);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLocalImportDialogOpen(Boolean(pendingLocalMedia && !pendingLocalMedia.processing));
    if (pendingLocalMedia) setContextMenu(null);
  }, [projectId, pendingLocalMedia?.sourcePath]);
  useEffect(() => {
    if (localImportProjectId.current !== projectId) {
      localImportProjectId.current = projectId;
      setLocalImportPlaceholders([]);
      setPendingImports([]);
    }
  }, [projectId]);
  useEffect(() => {
    setNativeCacheChoiceOpen(pendingNativeMediaPaths.length > 0);
    if (pendingNativeMediaPaths.length) setCacheFile(true);
    if (pendingNativeMediaPaths.length) {
      setLocalImportPlaceholders((current) => {
        const existing = new Set(current.filter((row) => row.id.startsWith("native:")).map((row) => row.id));
        const next = pendingNativeMediaPaths
          .map((path) => ({ id: `native:${path}`, name: mediaName(path), status: "choosing" as const, knownAssetIds: assets.map((asset) => asset.id) }))
          .filter((row) => !existing.has(row.id));
        return next.length ? [...current, ...next] : current;
      });
    }
  }, [pendingNativeMediaPaths.join("\0")]);
  useEffect(() => {
    const generation = ++organizationProjectGeneration.current;
    const revision = organizationSaveRevision.current;
    lastOrganizationAssetIds.current = null;
    organizationReadyProject.current = null;
    setOrganization(EMPTY_MEDIA_POOL_ORGANIZATION);
    setExpandedFolderIds([]);
    setCreateFolderParentId(null);
    setOrganizationError(null);
    if (!projectId) return;
    let current = true;
    void api.getMediaPoolOrganization(projectId).then((result) => {
      if (current
        && organizationProjectIdRef.current === projectId
        && organizationProjectGeneration.current === generation
        && organizationSaveRevision.current === revision) {
        organizationReadyProject.current = projectId;
        lastOrganizationAssetIds.current = result.assets.map((placement) => placement.assetId).sort();
        setOrganization(result);
      }
    }).catch((error: unknown) => {
      if (current
        && organizationProjectIdRef.current === projectId
        && organizationProjectGeneration.current === generation
        && organizationSaveRevision.current === revision) {
        setOrganizationError(error instanceof Error ? error.message : "Không tải được cấu trúc Media Pool.");
      }
    });
    return () => { current = false; };
  }, [projectId]);
  useEffect(() => {
    if (!projectId || organizationReadyProject.current !== projectId || busy || !assetListReady.current) return;
    const previousIds = lastOrganizationAssetIds.current;
    const currentAssetIds = mediaAssetIdsRef.current;
    lastOrganizationAssetIds.current = currentAssetIds;
    if (previousIds === null) return;
    const currentOrganization = organizationRef.current;
    const next = reconcileOrganizationAssets(currentOrganization, currentAssetIds);
    if (next !== currentOrganization) persistOrganization(next);
  }, [busy, mediaAssetIdsKey, organization, projectId]);
  const contextAsset = assets.find((asset) => asset.id === contextMenu?.assetId) ?? null;
  const contextSource = assets.find((asset) => asset.id === contextAsset?.sourceArchiveAssetId) ?? contextAsset;
  const footageAssets = assets.filter((asset) => !asset.sourceArchiveAssetId && !(asset.obsRecordingId && asset.sourceExtension !== ".mka"));
  const childrenOf = (asset: ProjectMediaAsset) => assets.filter((item) => item.sourceArchiveAssetId === asset.id);
  const liveAssets = footageAssets.filter((asset) => !asset.deletedAt);
  const liveIds = liveAssets.map((asset) => asset.id);
  const selectableIds = liveAssets.flatMap((asset) => [asset.id, ...childrenOf(asset).filter((track) => track.importSelected !== false).map((track) => track.id)]);
  const selectedListIds = reconcileListSelection(selection, selectableIds).ids;
  const selectedIds = reconcileListSelection(selection, liveIds).ids;
  // Newest first inside the bin; the bin itself is pinned last in the list.
  const recycledAssets = footageAssets
    .filter((asset) => asset.deletedAt)
    .sort((left, right) => String(right.deletedAt).localeCompare(String(left.deletedAt)));
  const recycledIds = recycledAssets.map((asset) => asset.id);
  const selectedBinIds = reconcileListSelection(binSelection, recycledIds).ids;
  const menuAssets = contextAsset
    ? contextAsset.deletedAt && selectedBinIds.includes(contextAsset.id)
      ? recycledAssets.filter((asset) => selectedBinIds.includes(asset.id))
      : !contextAsset.deletedAt && selectedIds.includes(contextAsset.id)
        ? liveAssets.filter((asset) => selectedIds.includes(asset.id))
        : [contextAsset]
    : [];
  const menuTrainingEligible = menuAssets.filter((asset) => asset.status !== "no-audio");
  const menuSttEligible = menuTrainingEligible.filter((asset) => !["queued", "processing", "reviewing"].includes(asset.transcriptionStatus));
  const groupSelected = (asset: ProjectMediaAsset, field: "transcriptionSelected" | "trainingSelected") => {
    const children = childrenOf(asset);
    return children.length ? children.every((child) => child[field]) : asset[field];
  };
  const [binOpen, setBinOpen] = useState(false);
  const [expandedAssets, setExpandedAssets] = useState<string[]>([]);
  // Derived from the footage itself rather than polled: the assets already carry
  // their own status, so there is nothing extra to keep in step.
  const isGrowingMkvTrack = (asset: ProjectMediaAsset) => assets.some((parent) => parent.id === asset.sourceArchiveAssetId && parent.growingMkvFollow && !parent.sourcePath.endsWith("source-final.mkv"));
  const running = assets.filter((asset) => !isGrowingMkvTrack(asset) && (asset.transcriptionStatus === "queued" || asset.transcriptionStatus === "processing"));
  const heldBack = assets.filter((asset) => !isGrowingMkvTrack(asset) && asset.transcriptionStatus === "paused");
  const queueBusy = running.length > 0;
  // STT queue controls stay scoped to the list selection when right-clicked.
  const contextTargets = (asset: ProjectMediaAsset, action: "pause" | "resume" | "stop") => {
    const eligible = action === "pause" ? ["queued", "processing"] : action === "resume" ? ["paused"] : ["queued", "processing", "paused"];
    const targets = menuAssets.length > 1 ? menuAssets : [asset];
    return targets.flatMap((item) => childrenOf(item).length ? childrenOf(item) : [item]).filter((item) => eligible.includes(item.transcriptionStatus)).map((item) => item.id);
  };
  const historyAsset = assets.find((asset) => asset.id === historyAssetId) ?? null;
  const trainingCount = liveAssets.filter((asset) => (childrenOf(asset).length ? childrenOf(asset) : [asset]).some((item) => item.importSelected !== false && item.trainingSelected)).length;
  const transcriptionCount = liveAssets.filter((asset) => (!asset.growingMkvFollow || asset.sourcePath.endsWith("source-final.mkv"))
    && (childrenOf(asset).length ? childrenOf(asset) : [asset]).some((item) => item.importSelected !== false && item.transcriptionSelected && item.status !== "no-audio" && !["processing", "reviewing", "queued"].includes(item.transcriptionStatus))).length;
  const growingMkvCandidates = liveAssets.filter((asset) => asset.growingMkvFollow
    && !asset.sourcePath.endsWith("source-final.mkv")
    && childrenOf(asset).some((child) => child.importSelected !== false && child.transcriptionSelected));
  const selectedGrowingMkv = growingMkvCandidates.find((asset) => selectedIds.includes(asset.id))
    ?? (!selectedIds.length && growingMkvCandidates.length === 1 ? growingMkvCandidates[0] : null);

  function persistOrganization(next: MediaPoolOrganization) {
    const saveOrganization = assetListReady.current
      ? reconcileOrganizationAssets(next, mediaAssetIdsRef.current)
      : next;
    setOrganization(saveOrganization);
    setOrganizationError(null);
    if (!projectId) return;
    const requestedProjectId = projectId;
    const generation = organizationProjectGeneration.current;
    const revision = ++organizationSaveRevision.current;
    const isCurrentSave = () => requestedProjectId === organizationProjectIdRef.current
      && generation === organizationProjectGeneration.current
      && revision === organizationSaveRevision.current;
    const save = () => api.updateMediaPoolOrganization(requestedProjectId, saveOrganization);
    const pending = organizationSaveQueue.current.then(save, save);
    organizationSaveQueue.current = pending.then((saved) => {
      if (isCurrentSave()) {
        organizationReadyProject.current = requestedProjectId;
        lastOrganizationAssetIds.current = saved.assets.map((placement) => placement.assetId).sort();
        setOrganization(saved);
      }
    }).catch((error: unknown) => {
      if (isCurrentSave())
        setOrganizationError(error instanceof Error ? error.message : "Không lưu được thứ tự Media Pool.");
    });
  }

  function arrangeAsset(assetId: string, folderId: string | null, beforeAssetId: string | null = null) {
    const next = moveMediaPoolAsset(organization, assetId, folderId, beforeAssetId);
    if (next !== organization) persistOrganization(next);
  }

  function handleAssetDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedAssetId.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleAssetDrop(event: DragEvent<HTMLElement>, folderId: string | null, beforeAssetId: string | null = null) {
    event.preventDefault();
    event.stopPropagation();
    const assetId = draggedAssetId.current || event.dataTransfer.getData("text/plain");
    if (assetId) arrangeAsset(assetId, folderId, beforeAssetId);
    draggedAssetId.current = null;
  }

  function createFolder(parentFolderId: string | null = createFolderParentId) {
    const name = newFolderName.trim();
    if (!name) return;
    const id = `folder-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    persistOrganization(createMediaPoolFolder(organization, id, name, parentFolderId));
    if (parentFolderId) setExpandedFolderIds((current) => current.includes(parentFolderId) ? current : [...current, parentFolderId]);
    setNewFolderName("");
    setCreateFolderOpen(false);
  }

  const organizationIndex = useMemo(() => {
    const currentLiveAssets = assets.filter((asset) => !asset.deletedAt && !asset.sourceArchiveAssetId && !(asset.obsRecordingId && asset.sourceExtension !== ".mka"));
    const liveById = new Map(currentLiveAssets.map((asset) => [asset.id, asset]));
    const placementsById = new Map(organization.assets.map((placement) => [placement.assetId, placement]));
    const byFolder = new Map<string | null, ProjectMediaAsset[]>();
    const seenAssets = new Set<string>();
    for (const placement of organization.assets.slice().sort((left, right) => left.order - right.order || left.assetId.localeCompare(right.assetId))) {
      const asset = liveById.get(placement.assetId);
      if (!asset) continue;
      const items = byFolder.get(placement.folderId) ?? [];
      items.push(asset);
      byFolder.set(placement.folderId, items);
      seenAssets.add(asset.id);
    }
    for (const asset of currentLiveAssets) {
      if (seenAssets.has(asset.id)) continue;
      const folderId = placementsById.get(asset.id)?.folderId ?? null;
      const items = byFolder.get(folderId) ?? [];
      items.push(asset);
      byFolder.set(folderId, items);
    }
    const foldersByParent = new Map<string | null, MediaPoolOrganization["folders"]>();
    for (const folder of organization.folders) {
      const items = foldersByParent.get(folder.parentFolderId) ?? [];
      items.push(folder);
      foldersByParent.set(folder.parentFolderId, items);
    }
    for (const items of foldersByParent.values()) items.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
    return { assetsByFolder: byFolder, foldersByParent };
  }, [organization, assets]);
  const assetsInFolder = (folderId: string | null) => organizationIndex.assetsByFolder.get(folderId) ?? [];
  const foldersIn = (parentFolderId: string | null) => organizationIndex.foldersByParent.get(parentFolderId) ?? [];

  function startSpeechToText() {
    if (selectedGrowingMkv) {
      setMkvSttTargetId(selectedGrowingMkv.id);
      setMkvSttDialogOpen(true);
      return;
    }
    onQueueTranscriptions(sttModel);
  }

  useEffect(() => {
    setSelection((current) => reconcileListSelection(current, selectableIds));
  }, [selectableIds.join("\0")]);
  const selectionListener = useRef(onScriptSelectionChange);
  selectionListener.current = onScriptSelectionChange;
  const scriptSelectionIds = selectedBinIds.length ? selectedBinIds : selectedListIds;
  useEffect(() => { selectionListener.current?.(scriptSelectionIds); }, [scriptSelectionIds.join("\0")]);
  useEffect(() => {
    if (selectedScriptAssetIds != null) {
      const live = selectedScriptAssetIds.filter((id) => selectableIds.includes(id));
      const recycled = selectedScriptAssetIds.filter((id) => recycledIds.includes(id));
      setSelection((current) => current.ids.join("\0") === live.join("\0") ? current
        : { ids: live, anchorId: current.anchorId && live.includes(current.anchorId) ? current.anchorId : live[live.length - 1] ?? null });
      setBinSelection((current) => current.ids.join("\0") === recycled.join("\0") ? current
        : { ids: recycled, anchorId: recycled[recycled.length - 1] ?? null });
      return;
    }
    const opened = selectedImportedTrackId ?? selectedAssetId;
    if (opened && assets.some((asset) => asset.id === opened)) {
      if (recycledIds.includes(opened)) setBinSelection((current) => current.ids.includes(opened) ? current : { ids: [opened], anchorId: opened });
      else setSelection((current) => current.ids.includes(opened) ? current : { ids: [opened], anchorId: opened });
    }
  }, [selectedAssetId, selectedImportedTrackId, selectedScriptAssetIds?.join("\0")]);
  useEffect(() => {
    setBinSelection((current) => reconcileListSelection(current, recycledIds));
  }, [recycledIds.join("\0")]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    const closeWithBlur = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    window.addEventListener("blur", closeWithBlur);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
      window.removeEventListener("blur", closeWithBlur);
    };
  }, [contextMenu]);

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) {
      setPendingImports(files.map((file) => ({ file, transcribe: true })));
      setLocalImportPlaceholders((current) => [...current, ...files.map((file) => ({
        id: `browser:${crypto.randomUUID()}`, name: file.name, status: "choosing" as const, knownAssetIds: assets.map((asset) => asset.id),
      }))]);
    }
    event.target.value = "";
  }

  function togglePendingTranscript(index: number, transcribe: boolean) {
    setPendingImports((current) => current.map((choice, choiceIndex) => choiceIndex === index ? { ...choice, transcribe } : choice));
  }

  function confirmImport() {
    if (!pendingImports.length) return;
    const names = new Set(pendingImports.map((choice) => choice.file.name));
    setLocalImportPlaceholders((current) => current.map((row) => names.has(row.name) ? { ...row, status: "queued" } : row));
    onImport(pendingImports);
    setPendingImports([]);
  }

  function cancelBrowserImport() {
    const names = new Set(pendingImports.map((choice) => choice.file.name));
    setPendingImports([]);
    setLocalImportPlaceholders((current) => current.filter((row) => row.status !== "choosing" || !names.has(row.name)));
  }

  function confirmNativeImport(cacheLocal: boolean) {
    setNativeCacheChoiceOpen(false);
    onConfirmNativeMediaImport(pendingNativeMediaPaths, cacheLocal);
    setLocalImportPlaceholders((current) => current.map((row) => row.id.startsWith("native:") && pendingNativeMediaPaths.includes(row.id.slice("native:".length))
      ? { ...row, status: "queued" } : row));
  }

  function cancelNativeImport() {
    setNativeCacheChoiceOpen(false);
    setLocalImportPlaceholders((current) => current.filter((row) => !row.id.startsWith("native:") || !pendingNativeMediaPaths.includes(row.id.slice("native:".length))));
    onCancelNativeMediaImport();
  }

  const importAcknowledged = (row: LocalImportPlaceholder) => row.status === "queued" && (
    pendingMediaImports.some((pending) => pending.name === row.name) ||
    liveAssets.some((asset) => asset.name === row.name && !row.knownAssetIds.includes(asset.id))
  );
  const visibleLocalImportPlaceholders = localImportPlaceholders.filter((row) => !importAcknowledged(row));
  useEffect(() => {
    setLocalImportPlaceholders((current) => current.some(importAcknowledged) ? current.filter((row) => !importAcknowledged(row)) : current);
  }, [pendingMediaImports.map((row) => `${row.id}:${row.name}:${row.status}`).join("\0"), liveAssets.map((row) => `${row.id}:${row.name}`).join("\0")]);

  function openContextMenu(event: MouseEvent, assetId: string) {
    event.preventDefault();
    if (assetId === "__pending_local__") {
      if (pendingLocalMedia?.processing) return;
      setContextMenu(null);
      setLocalImportDialogOpen(true);
      return;
    }
    if (recycledIds.includes(assetId)) {
      if (!selectedBinIds.includes(assetId)) setBinSelection({ ids: [assetId], anchorId: assetId });
      setSelection({ ids: [], anchorId: null });
    } else {
      if (!selectedIds.includes(assetId)) setSelection({ ids: [assetId], anchorId: assetId });
      setBinSelection({ ids: [], anchorId: null });
      onSelect(assetId);
    }
    setContextMenu({
      assetId,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 300)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 560)),
    });
  }

  function openSelectedItem(id: string) {
    if (assets.find((item) => item.id === id)?.sourceArchiveAssetId) onSelectTrack(id);
    else onSelect(id);
  }

  function selectAsset(event: MouseEvent<HTMLButtonElement>, asset: ProjectMediaAsset) {
    if (asset.deletedAt) {
      setSelection({ ids: [], anchorId: null });
      const next = selectListItem(binSelection, recycledIds, asset.id, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey });
      setBinSelection(next);
      if (next.ids.length === 1 && !event.ctrlKey && !event.metaKey && !event.shiftKey) onSelect(asset.id);
    } else {
      setBinSelection({ ids: [], anchorId: null });
      const next = selectListItem(selection, selectableIds, asset.id, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey });
      setSelection(next);
      if (next.ids.length === 1) openSelectedItem(next.ids[0]);
      else if (!next.ids.length) onClearSelection();
    }
  }

  function toggleStageForAsset(asset: ProjectMediaAsset, target: "import" | "stt" | "diarization" | "training", value: boolean) {
    const selectedGroup = selectedListIds.length > 1 && selectedListIds.includes(asset.id)
      ? selectedListIds.map((id) => assets.find((item) => item.id === id && !item.deletedAt)).filter((item): item is ProjectMediaAsset => Boolean(item))
      : [asset];
    const eligible = selectedGroup.filter((item) => {
      if (item.status === "no-audio" || (target === "import" && busy)) return false;
      const children = childrenOf(item);
      const imported = children.length ? children.some((child) => child.importSelected !== false) : item.importSelected !== false;
      if (target !== "import" && !imported) return false;
      if (target === "stt" && ["queued", "processing", "reviewing"].includes(item.transcriptionStatus)) return false;
      return true;
    });
    if (eligible.length > 1) {
      onBatchAction({ kind: "selection", target, assetIds: eligible.map((item) => item.id), selected: value });
      return;
    }
    if (target === "import") onToggleImport(asset.id, value);
    else if (target === "stt") onToggleTranscription(asset.id, value);
    else if (target === "diarization") onToggleDiarization(asset.id, value);
    else onToggleTraining(asset.id, value);
  }

  function selectAllWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      if ((event.target as HTMLElement).closest(".media-recycle-bin") && binOpen) setBinSelection((current) => selectAllListItems(current, recycledIds));
      else setSelection((current) => selectAllListItems(current, liveIds));
    }
  }

  function updateMenuAnnotations(changes: MediaBatchAction & { kind: "annotations" }) {
    if (changes.changes.length > 1) {
      setContextMenu(null);
      onBatchAction(changes);
    } else {
      const change = changes.changes[0];
      if (change) onUpdateAnnotations(change.assetId, change.speakerProfileIds, change.environmentProfileIds, change.emotion);
    }
  }

  function openHistory(asset: ProjectMediaAsset) {
    setContextMenu(null);
    setHistoryAssetId(asset.id);
  }

  function renderAsset(asset: ProjectMediaAsset, folderId: string | null | false = false) {
    const organizable = folderId !== false;
    const channels = childrenOf(asset);
    const stageState = (test: (item: ProjectMediaAsset) => boolean) => {
      const targets = channels.length ? channels : [asset];
      const count = targets.filter(test).length;
      return { selected: count === targets.length, mixed: count > 0 && count < targets.length };
    };
    const stageBusy = (test: (item: ProjectMediaAsset) => boolean) => (channels.length ? channels : [asset]).some(test);
    const imported = stageState((item) => item.importSelected !== false);
    const stt = stageState((item) => item.transcriptionSelected);
    const diarization = stageState((item) => Boolean(item.diarizationSelected));
    const training = stageState((item) => item.trainingSelected);
    const sttRunning = stageBusy((item) => ["queued", "processing", "reviewing"].includes(item.transcriptionStatus));
    const diarizationRunning = stageBusy((item) => ["queued", "processing"].includes(item.diarizationStatus ?? "idle"));
    const trainingRunning = stageBusy((item) => {
      return trainingAssetIds.has(item.id);
    });
    const selected = asset.deletedAt ? selectedBinIds.includes(asset.id) : selectedIds.includes(asset.id);
    const active = asset.id === selectedAssetId;
    const recycled = Boolean(asset.deletedAt);
    // The parent source switches atomically only after all final track WAVs exist.
    // Children share this state even while their STT jobs are still running.
    const mkvRecording = !recycled && Boolean(asset.growingMkvFollow) && !asset.sourcePath.endsWith("source-final.mkv");
    const parked = Boolean(asset.disabled) && !recycled;
    const codec = asset.audioCodec ?? asset.videoCodec ?? asset.sourceExtension.slice(1).toUpperCase();
    const assignedNames = speakers.filter((speaker) => asset.speakerProfileIds.includes(speaker.id)).map((speaker) => speaker.name);
    const environmentNames = environments.filter((profile) => asset.environmentProfileIds.includes(profile.id)).map((profile) => profile.name);
    const missing = recycled || channels.length ? [] : missingPreparation(asset);
    return (
      <div className={`media-pool-item ${mkvRecording ? "is-mkv-recording" : ""} ${channels.length ? "has-children" : ""} ${active ? "is-active" : ""} ${selected ? "is-selected" : ""} ${recycled ? "is-recycled" : ""} ${parked ? "is-disabled" : ""} ${!imported.selected && !imported.mixed ? "is-not-imported" : ""}`} draggable={organizable && !recycled} key={asset.id} onContextMenu={(event) => openContextMenu(event, asset.id)} onDragStart={organizable ? (event) => { draggedAssetId.current = asset.id; event.dataTransfer.setData("text/plain", asset.id); event.dataTransfer.effectAllowed = "move"; } : undefined} onDragEnd={organizable ? () => { draggedAssetId.current = null; } : undefined} onDragOver={organizable ? handleAssetDragOver : undefined} onDrop={organizable ? (event) => handleAssetDrop(event, folderId, asset.id) : undefined}>
        {channels.length ? <button aria-expanded={expandedAssets.includes(asset.id)} aria-label={`${expandedAssets.includes(asset.id) ? "Thu gọn" : "Xổ"} track của ${asset.name}`} className="media-pool-item__expand" onClick={() => setExpandedAssets((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])} type="button">{expandedAssets.includes(asset.id) ? "▾" : "▸"}</button> : null}
        <button aria-pressed={selected} className="media-pool-item__main" onClick={(event) => selectAsset(event, asset)} type="button">
          <span className={`media-kind media-kind--${asset.mediaKind}`}><Icon name={asset.mediaKind === "video" ? "project" : "waveform"} /></span>
          <span className="media-item-copy">
            <strong>{missing.length ? <span aria-label={`Chưa xong: ${missing.join(", ")}`} className="media-prep-warning" role="img" title={`Chưa xong: ${missing.join(", ")}`}>!</span> : null}{asset.name}</strong>
            <small>{asset.mediaKind.toUpperCase()} · {codec} · {durationLabel(asset.duration)}{channels.length ? ` · ${channels.length} TRACK` : ""}{mkvRecording ? <b className="media-mkv-recording-label"> · MKV ĐANG GHI</b> : null}</small>
            <em>{channels.length ? asset.obsRecordingId ? "SCRIPT THEO TRACK" : "STT TỪNG TRACK" : transcriptionLabel(asset)} · {asset.revisions.length} REV · {emotionLabel(asset.emotion).toUpperCase()} · {assignedNames.join(", ") || "CHƯA GÁN SPEAKER"}{environmentNames.length ? " · " + environmentNames.join(", ") : ""}{asset.hasExternalSource ? asset.localCacheEnabled ? " · CACHE ✓ " + (asset.localCacheUpdatedAt ? new Date(asset.localCacheUpdatedAt).toLocaleString("vi-VN") : "") : " · ORIGINAL FILE" : ""}</em>
            {["queued", "processing", "reviewing", "paused"].includes(asset.transcriptionStatus) ? <span aria-label={`Tiến trình Speech to text ${transcriptionProgressLabel(asset.transcriptionProgress)}%`} className={`media-transcription-progress ${asset.transcriptionStatus === "paused" ? "is-paused" : ""}`}><i style={{ width: `${asset.transcriptionProgress ?? 0}%` }} /><b>{asset.transcriptionStatus === "paused" ? "TẠM DỪNG" : asset.transcriptionStatus === "reviewing" ? "AI CHECK" : asset.transcriptionStatus === "queued" ? "WAITING" : "STT KỸ"} · {transcriptionProgressLabel(asset.transcriptionProgress)}%</b></span> : null}
          </span>
        </button>
        <div className="media-pool-item__toggles">
        {recycled ? <><button className="media-restore-action" onClick={() => { if (selectedBinIds.length > 1 && selectedBinIds.includes(asset.id)) onBatchAction({ kind: "restore", assetIds: selectedBinIds }); else onRestore(asset); }} title="Đưa footage trở lại Media Pool" type="button">Restore</button><button className="media-remove-action" onClick={() => { if (selectedBinIds.length > 1 && selectedBinIds.includes(asset.id)) onBatchAction({ kind: "delete", assetIds: selectedBinIds }); else onRemove(asset); }} title="Xóa hẳn, không khôi phục được" type="button">Delete</button></> : <>
          <StageToggle recording={mkvRecording} disabled={asset.status === "no-audio" || busy} mixed={imported.mixed} name={asset.name} onChange={(value) => toggleStageForAsset(asset, "import", value)} selected={imported.selected} stage="Import" />
          <StageToggle ariaLabel={`Đưa ${asset.name} vào hàng đợi Speech to text`} disabled={asset.status === "no-audio" || !imported.selected && !imported.mixed || ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus)} mixed={stt.mixed} name={asset.name} onChange={(value) => toggleStageForAsset(asset, "stt", value)} running={sttRunning} selected={stt.selected} stage="STT" />
          <StageToggle disabled={asset.status === "no-audio" || !imported.selected && !imported.mixed} mixed={diarization.mixed} name={asset.name} onChange={(value) => toggleStageForAsset(asset, "diarization", value)} running={diarizationRunning} selected={diarization.selected} stage="Speaker Diarization" />
          <StageToggle ariaLabel={`Dùng ${asset.name} cho Voice Training`} disabled={asset.status === "no-audio" || !imported.selected && !imported.mixed} mixed={training.mixed} name={asset.name} onChange={(value) => toggleStageForAsset(asset, "training", value)} running={trainingRunning} selected={training.selected} stage="Train" /></>}
        </div>
        {channels.length && expandedAssets.includes(asset.id) && !recycled ? <div className="media-pool-item__channels">{channels.map((track) => <div className={`media-pool-item__channel ${mkvRecording ? "is-mkv-recording" : ""} ${track.importSelected === false ? "is-not-imported" : ""}`} key={track.id}>
          <button aria-label={`Mở Script ${asset.obsRecordingId ? obsTrackLabel(track.name.replace(/^OBS LiveLink · /, "")) : track.name}`} aria-pressed={selectedListIds.includes(track.id)} className="media-pool-item__channel-name" disabled={track.importSelected === false} onClick={(event) => { setBinSelection({ ids: [], anchorId: null }); const next = selectListItem(selection, selectableIds, track.id, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }); setSelection(next); if (next.ids.length === 1) openSelectedItem(next.ids[0]); else if (!next.ids.length) onClearSelection(); }} title={track.importSelected === false ? "Tick Import để đưa track trở lại" : track.name} type="button">{asset.obsRecordingId ? obsTrackLabel(track.name.replace(/^OBS LiveLink · /, "")) : track.name}<small>{durationLabel(track.duration)}</small></button>
          <div className="media-pool-item__toggles">
            <StageToggle recording={mkvRecording} name={track.name} onChange={(value) => toggleStageForAsset(track, "import", value)} selected={track.importSelected !== false} stage="Import" />
            <StageToggle disabled={track.importSelected === false || ["queued", "processing", "reviewing"].includes(track.transcriptionStatus)} name={track.name} onChange={(value) => toggleStageForAsset(track, "stt", value)} running={["queued", "processing", "reviewing"].includes(track.transcriptionStatus)} selected={track.transcriptionSelected} stage="STT" />
            <StageToggle disabled={track.importSelected === false} name={track.name} onChange={(value) => toggleStageForAsset(track, "diarization", value)} running={["queued", "processing"].includes(track.diarizationStatus ?? "idle")} selected={Boolean(track.diarizationSelected)} stage="Speaker Diarization" />
            <StageToggle disabled={track.importSelected === false} name={track.name} onChange={(value) => toggleStageForAsset(track, "training", value)} running={trainingAssetIds.has(track.id)} selected={track.trainingSelected} stage="Train" />
          </div>
        </div>)}</div> : null}
      </div>
    );
  }

  function renderFolder(folder: MediaPoolOrganization["folders"][number], depth = 0) {
    const childFolders = foldersIn(folder.id);
    const folderAssets = assetsInFolder(folder.id);
    const expanded = expandedFolderIds.includes(folder.id);
    const immediateAssetCount = folderAssets.length;
    return <section className="media-organization-node" key={folder.id} style={{ "--folder-depth": depth } as CSSProperties}>
      <div className="media-organization-folder-slot" onDragOver={handleAssetDragOver} onDrop={(event) => handleAssetDrop(event, folder.id)}>
        <button aria-expanded={expanded} aria-label={`Mở thư mục ${folder.name}`} className="media-organization-folder" onClick={() => setExpandedFolderIds((current) => expanded ? current.filter((id) => id !== folder.id) : [...current, folder.id])} type="button">
          <span aria-hidden="true" className="media-organization-folder__chevron">{expanded ? "▾" : "▸"}</span><Icon name="folder" /><span><b>{folder.name}</b><small>{childFolders.length} thư mục con · {immediateAssetCount} footage</small></span>
        </button>
        <button aria-label={`Tạo thư mục con trong ${folder.name}`} className="media-organization-folder__add" onClick={() => { setCreateFolderParentId(folder.id); setCreateFolderOpen(true); }} title={`Tạo thư mục con trong ${folder.name}`} type="button"><Icon name="folder-plus" /></button>
      </div>
      {expanded ? <div aria-label={`Nội dung thư mục ${folder.name}`} className="media-organization-children">
        {childFolders.map((child) => renderFolder(child, depth + 1))}
        {folderAssets.map((item) => renderAsset(item, folder.id))}
        {!childFolders.length && !folderAssets.length ? <div className="media-organization-empty">Thư mục này chưa có footage. Kéo footage vào đây hoặc tạo thư mục con.</div> : null}
      </div> : null}
    </section>;
  }

  return (
    <ModuleFrame
      className="media-pool-module"
      eyebrow="PROJECT MEDIA"
      index="MP"
      title="Media Pool"
      action={<div className="media-import-actions">
        <button aria-label="Import footage từ máy Host" className="media-import media-import--primary" onClick={onImportLocal} title="Chọn file gốc và quyết định có cache trong project" type="button"><Icon name="import" /></button>
        <input aria-label="Import file từ máy đang dùng" accept={MEDIA_ACCEPT} className="media-pool-file-input" multiple onChange={importFiles} ref={browserFileInput} type="file" />
        <button aria-label="Upload file qua trình duyệt" className="media-import media-import--host" onClick={() => browserFileInput.current?.click()} title="Upload từ máy đang dùng; trình duyệt không cung cấp đường dẫn file gốc" type="button"><Icon name="window" /></button>
        <button aria-label="Tạo thư mục" aria-expanded={createFolderOpen} className="media-import" onClick={() => { setCreateFolderParentId(null); setCreateFolderOpen((open) => !open); }} title="Tạo thư mục trong project" type="button"><Icon name="folder-plus" /></button>
      </div>}
    >
      <div className="media-pool-summary">
        <span><b>{liveAssets.length}</b> ASSETS</span>
        {selectedIds.length > 1 ? <span><b>{selectedIds.length}</b> SELECTED</span> : null}
        <span><b>{transcriptionCount}</b> TO STT</span>
        <span><b>{trainingCount}</b> TO TRAIN</span>
      </div>
      <div aria-label="Tổ chức Media Pool" className="media-organization-toolbar">
        {createFolderOpen ? <form className="media-organization-create" onSubmit={(event) => { event.preventDefault(); createFolder(); }}>
          <input aria-label="Tên thư mục mới" autoFocus maxLength={120} onChange={(event) => setNewFolderName(event.target.value)} placeholder={createFolderParentId ? "Tên thư mục con" : "Tên thư mục"} value={newFolderName} />
          <button className="button button--accent" disabled={!newFolderName.trim()} type="submit">Tạo folder</button>
          <button className="button button--quiet" onClick={() => { setCreateFolderOpen(false); setCreateFolderParentId(null); setNewFolderName(""); }} type="button">Hủy</button>
        </form> : null}
        {organizationError ? <small className="media-organization-error" role="alert">Không lưu được tổ chức Media Pool: {organizationError}</small> : null}
      </div>
      <div aria-label="Danh sách Media Pool" className="media-pool-list" onClick={(event) => {
        if (event.target !== event.currentTarget && !(event.target as HTMLElement).closest(".media-pool-empty")) return;
        setSelection({ ids: [], anchorId: null });
        setBinSelection({ ids: [], anchorId: null });
        onClearSelection();
      }} onKeyDown={selectAllWithKeyboard} role="region" tabIndex={0}>
        {pendingLocalMedia ? <div aria-busy={Boolean(pendingLocalMedia.processing)} aria-label={`Footage ${pendingLocalMedia.name}: ${pendingLocalMedia.processing ? "ĐANG IMPORT" : pendingLocalMedia.error ? "LỖI IMPORT" : "ĐANG CHỜ IMPORT"}`} className="media-pool-pending" onContextMenu={(event) => openContextMenu(event, "__pending_local__")}>
          <button aria-label={`Chọn track cho ${pendingLocalMedia.name}`} disabled={pendingLocalMedia.processing} onClick={(event) => openContextMenu(event, "__pending_local__")} type="button"><span aria-hidden="true" className={pendingLocalMedia.processing ? "media-pool-importing__spinner is-working" : undefined}><Icon name="folder" /></span><span><b>{pendingLocalMedia.name}</b><small role="status">{pendingLocalMedia.processing ? "ĐANG IMPORT VÀ CHUẨN BỊ TRACK" : pendingLocalMedia.error ? `IMPORT THẤT BẠI · ${pendingLocalMedia.error}` : `CHỜ IMPORT · ${pendingLocalMedia.tracks.length} AUDIO TRACK · BẤM ĐỂ CHỌN KÊNH VÀ THEO DÕI`}</small></span></button>
        </div> : null}
        {visibleLocalImportPlaceholders.map((item) => <div aria-busy={item.status !== "choosing"} aria-label={`Footage ${item.name}: ${item.status === "choosing" ? "ĐANG CHỜ IMPORT" : "ĐANG IMPORT"}`} className={`media-pool-importing media-pool-importing--local media-pool-importing--${item.status}`} key={item.id}>
          <span aria-hidden="true" className="media-pool-importing__spinner"><Icon name="waveform" /></span>
          <span><b>{item.name}</b><small>{item.status === "choosing" ? "ĐANG CHỜ XÁC NHẬN IMPORT" : "ĐANG GỬI ĐẾN HÀNG IMPORT"}</small></span>
        </div>)}
        {pendingMediaImports.map((item) => {
          const labels = pendingSlotLabels(item);
          return <div aria-busy={item.status !== "error" && item.status !== "choosing"} aria-label={`Footage ${item.name}: ${labels.label}`} className={`media-pool-importing media-pool-importing--${item.status}`} key={item.id}>
            <span aria-hidden="true" className="media-pool-importing__spinner"><Icon name={item.status === "error" ? "refresh" : "waveform"} /></span>
            <span><b>{item.name}</b><small role="status">{labels.status}</small>{item.detail ? <em>{item.detail}</em> : null}</span>
            <div className="media-pool-importing__actions">
              {item.status === "error" && item.retryable ? <button className="media-pool-importing__retry" onClick={() => onRetryPendingImport(item.id)} type="button">Thử lại</button> : null}
              {onDismissPendingImport && (item.status === "error" || item.status === "choosing") ? <button aria-label={`Ẩn trạng thái ${item.name}`} className="media-pool-importing__retry" onClick={() => onDismissPendingImport(item.id)} type="button">×</button> : null}
            </div>
          </div>;
        })}
        {projectId ? <PendingObsFootage startingRecording={pendingObsRecording} assets={assets} onArchiveReady={onObsArchiveReady} onRemovedRecording={onRemovedRecording} onOpenRecording={(recordingId) => { setSelection({ ids: [], anchorId: null }); setBinSelection({ ids: [], anchorId: null }); onOpenObsRecording?.(recordingId); }} onOpenTrack={(recordingId, channelId) => { setSelection({ ids: [], anchorId: null }); setBinSelection({ ids: [], anchorId: null }); onOpenObsTrack?.(recordingId, channelId); }} selectedRecordingId={selectedObsRecordingId} projectId={projectId} showEmpty={!pendingLocalMedia && !pendingMediaImports.length && !visibleLocalImportPlaceholders.length && !liveAssets.length && !recycledAssets.length} /> : null}
        {projectId ? <div aria-label="Thư mục trong project" className="media-organization-root" onDragOver={handleAssetDragOver} onDrop={(event) => handleAssetDrop(event, null)}>
          {foldersIn(null).map((folder) => renderFolder(folder))}
          {assetsInFolder(null).map((asset) => renderAsset(asset, null))}
          {!foldersIn(null).length && !assetsInFolder(null).length && !pendingMediaImports.length && !visibleLocalImportPlaceholders.length && !pendingLocalMedia && !pendingObsRecording ? <div className="media-organization-empty">Project chưa có footage. Kéo footage vào project hoặc tạo thư mục.</div> : null}
        </div> : liveAssets.map((asset) => renderAsset(asset))}
        {!projectId && !pendingLocalMedia && !pendingMediaImports.length && !visibleLocalImportPlaceholders.length && !liveAssets.length && !recycledAssets.length ? <div className="media-pool-empty"><Icon name="folder" /><b>Chưa có footage</b><span>Import video/audio hoặc thu một take mới.</span></div> : null}
        {/* Rendered after the list rather than inside it, so no amount of
            importing can push the bin out of last place. */}
        {recycledAssets.length ? <section className={`media-recycle-bin ${binOpen ? "is-open" : ""}`}>
          <div className="media-recycle-bin__header">
          <button aria-expanded={binOpen} className="media-recycle-bin__toggle" onClick={() => setBinOpen((open) => !open)} type="button">
            <Icon name="trash" />
            <b>RECYCLE BIN</b>
            <span>{recycledAssets.length}</span>
            <i aria-hidden="true">{binOpen ? "▾" : "▸"}</i>
          </button>
          <button aria-label="Empty Recycle Bin" className="media-recycle-bin__empty" onClick={() => onBatchAction({ kind: "delete", assetIds: recycledIds })} title={`Xóa hẳn ${recycledAssets.length} footage trong Recycle Bin`} type="button"><Icon name="trash" /></button>
          </div>
          {binOpen ? <div className="media-recycle-bin__list">
            <p>Chỉ xem: play, script, subtitle và zoom vẫn dùng được; muốn sửa thì Restore trước.</p>
            {selectedBinIds.length > 1 ? <div className="media-recycle-bin__bulk"><span>{selectedBinIds.length} footage đã chọn</span><button onClick={() => onBatchAction({ kind: "restore", assetIds: selectedBinIds })} type="button">Restore đã chọn</button><button className="is-danger" onClick={() => onBatchAction({ kind: "delete", assetIds: selectedBinIds })} type="button">Delete đã chọn</button></div> : null}
            {recycledAssets.map((asset) => renderAsset(asset))}
          </div> : null}
        </section> : null}
      </div>
      <div className="media-pool-footer">
        {workflow === "speech-to-text" ? <div className="media-stt-action">{queueBusy || heldBack.length ? <><button className="button button--quiet" onClick={() => onControlTranscriptions(queueBusy ? "pause" : "resume")} type="button">{queueBusy ? "Pause" : "Chạy tiếp"} ({queueBusy ? running.length : heldBack.length})</button><TaskStop scope="STT" onStop={(mode) => onControlTranscriptions(mode === "all" ? "stop-all" : "stop")} /></> : <button className="button button--accent media-send-training" disabled={(!transcriptionCount && !selectedGrowingMkv) || (chosen !== null && !chosen.available && !selectedGrowingMkv)} onClick={startSpeechToText} type="button">Speech to text {transcriptionCount ? `(${transcriptionCount})` : ""}</button>}<select aria-label="Model Speech to Text" onChange={(event) => setSttModel(event.target.value)} value={sttModel}>{choiceGroups.map((group) => <optgroup key={group} label={group}>{choices.filter((choice) => choice.group === group).map((choice) => <option disabled={!choice.available} key={choice.value} title={choice.status} value={choice.value}>{choice.label}{choice.available ? "" : " · chưa sẵn sàng"}</option>)}</optgroup>)}</select>{chosen?.engine && chosen.engine.id !== "faster-whisper" ? <small className="media-stt-engine-note">{chosen.engine.description}{chosen.available ? "" : ` · ${chosen.status}`}</small> : !chosen?.available && chosen?.status ? <small className="media-stt-engine-note">{chosen.status}</small> : null}</div> : null}
        {workflow === "speech-to-text" && trainingCount > 0 ? <button className="button button--lime button--full media-send-training" onClick={onSendToTraining} type="button">Gửi {trainingCount} footage sang Voice Training</button> : null}
        <p className="media-pool-note"><i /> STT chạy lần lượt theo thứ tự footage được thêm vào, ngay cả khi bạn đổi page.</p>
      </div>
      {nativeCacheChoiceOpen ? <div className="media-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelNativeImport(); }}>
        <section aria-label="Tùy chọn cache file media" aria-modal="true" className="media-import-dialog media-import-dialog--cache" role="dialog">
          <header><span>IMPORT FILE GỐC</span><strong>{pendingNativeMediaPaths.length} file</strong></header>
          <p>Chọn cách app dùng các file nguồn. Cache sẽ sao chép vào project để project mang theo media; giữ file gốc sẽ lưu liên kết tới vị trí hiện tại.</p>
          <div aria-label="Các file sắp import" className="media-import-choices">{pendingNativeMediaPaths.map((path) => <div className="media-import-choice-file" key={path}><b>{path.split(/[\\/]/).pop() || path}</b><small>{path}</small></div>)}</div>
          <label className="media-import-cache-choice"><input aria-label="Cache file" checked={cacheFile} onChange={(event) => setCacheFile(event.target.checked)} type="checkbox" /><span>Cache file <small>Sao chép file gốc vào folder project</small></span></label>
          <footer><button className="button button--quiet" onClick={cancelNativeImport} type="button">Hủy</button><button className="button button--accent" onClick={() => confirmNativeImport(cacheFile)} type="button">Import {pendingNativeMediaPaths.length} file</button></footer>
        </section>
      </div> : null}
      {localImportDialogOpen && pendingLocalMedia ? <LocalMediaImportDialog key={`${projectId}:${pendingLocalMedia.sourcePath}`}
        media={pendingLocalMedia} busy={busy} onTrackChange={onPendingLocalTrackChange}
        onCancel={() => { setLocalImportDialogOpen(false); onCancelPendingLocalMedia(); }}
        onConfirm={(mode, seconds, cache) => {
          setLocalImportDialogOpen(false);
          if (mode === "follow") onConfirmPendingLocalMedia(mode, seconds);
          else onConfirmPendingLocalMedia(mode, seconds, cache);
        }} /> : null}
      {pendingImports.length ? <div className="media-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelBrowserImport(); }}><section aria-label="Tùy chọn import media" aria-modal="true" className="media-import-dialog" role="dialog"><header><span>IMPORT QUEUE</span><strong>{pendingImports.length} footage</strong></header><p>{pendingGrowingMkv ? "MKV đang ghi cần theo dõi file gốc trên máy. Chọn lại chính file này trong hộp chọn file gốc; dialog Import sẽ hiện các lựa chọn Cache, Import/STT từng track và Theo dõi MKV đang ghi. Upload chỉ gửi một bản sao và không nhận thêm dữ liệu khi OBS tiếp tục ghi." : "Chọn footage cần đưa vào hàng chờ STT. STT kỹ sẽ chỉ chạy khi bấm Speech to text."}</p><label className="media-import-cache-choice"><input aria-label="Cache file" checked disabled type="checkbox" /><span>Cache file <small>Trình duyệt không cung cấp đường dẫn file gốc; upload luôn lưu bản sao vào project. Để liên kết file gốc, dùng Import footage từ máy Host.</small></span></label><div className="media-import-choices">{pendingImports.map((choice, index) => <label key={`${choice.file.name}-${index}`}><span><b>{choice.file.name}</b><small>{(choice.file.size / 1024 / 1024).toFixed(1)} MB</small></span><input aria-label={`Đánh dấu STT cho ${choice.file.name}`} checked={choice.transcribe} onChange={(event) => togglePendingTranscript(index, event.target.checked)} type="checkbox" /><em>{choice.transcribe ? "TO STT" : "IMPORT ONLY"}</em></label>)}</div><footer><button className="button button--quiet" onClick={cancelBrowserImport} type="button">Hủy</button>{pendingGrowingMkv ? <button className="button button--accent" onClick={() => { cancelBrowserImport(); onImportLocal(); }} type="button">Theo dõi MKV đang ghi</button> : null}<button className={pendingGrowingMkv ? "button button--quiet" : "button button--accent"} onClick={confirmImport} type="button">{pendingGrowingMkv ? "Import file đã hoàn tất" : `Import ${pendingImports.length} file`}</button></footer></section></div> : null}
      {mkvSttDialogOpen && (pendingLocalMedia || mkvSttTargetId) ? <div className="media-import-backdrop">
        <section aria-label="Thiết lập STT MKV" aria-modal="true" className="media-import-dialog" role="dialog">
          <header><span>MKV STT KỸ</span><strong>{mkvSttTargetId ? assets.find((asset) => asset.id === mkvSttTargetId)?.name : pendingLocalMedia?.name}</strong></header>
          <p>Lượt đầu xử lý toàn bộ audio đã đọc tại lúc bấm bắt đầu trên từng track đã chọn. Sau đó tự chạy lần lượt khi đủ một block mới (mặc định 1 phút). Mỗi block lấy thêm 10 giây trước đó làm ngữ cảnh và thay transcript từ 5 giây trước ranh giới, tránh lặp chữ. Khi OBS dừng, app tự nhập hoàn chỉnh MKV ở nền và giữ bản nháp này. Sau đó bấm Speech to text để nhận diện lại toàn bộ track, không chia block.</p>
          <div className="mkv-stt-segment-field"><span>Độ dài mỗi đoạn STT kỹ</span><div className="mkv-stt-segment-field__inputs">
            <label>Phút<input aria-label="Số phút STT kỹ" max={10} min={0} onChange={(event) => setMkvSttSegmentSeconds(Number(event.target.value) * 60 + mkvSttSegmentSeconds % 60)} type="number" value={Math.floor(mkvSttSegmentSeconds / 60)} /></label>
            <label>Giây<input aria-label="Số giây STT kỹ" max={59} min={0} onChange={(event) => setMkvSttSegmentSeconds(Math.floor(mkvSttSegmentSeconds / 60) * 60 + Number(event.target.value))} type="number" value={mkvSttSegmentSeconds % 60} /></label>
          </div></div>
          <footer><button className="button button--quiet" onClick={() => { setMkvSttDialogOpen(false); setMkvSttTargetId(null); }} type="button">Hủy</button>
            <button className="button button--accent" disabled={!Number.isInteger(mkvSttSegmentSeconds) || mkvSttSegmentSeconds < 10 || mkvSttSegmentSeconds > 600} onClick={() => { setMkvSttDialogOpen(false); if (mkvSttTargetId) onStartGrowingMkvDetailedStt(mkvSttTargetId, mkvSttSegmentSeconds); else onConfirmPendingLocalMedia("follow", mkvSttSegmentSeconds); setMkvSttTargetId(null); }} type="button">{mkvSttTargetId ? "Bắt đầu STT kỹ" : "Theo dõi và STT"}</button>
          </footer>
        </section>
      </div> : null}
      {contextMenu && contextAsset ? createPortal(
        <div aria-label={`Gán profile cho ${contextAsset.name}`} className="media-context-menu" ref={contextMenuRef} role="menu" style={{ left: contextMenu.left, top: contextMenu.top }}>
          <header><span>{contextAsset.deletedAt ? "RECYCLE BIN" : "FOOTAGE PROPERTIES"}</span><b>{menuAssets.length > 1 ? `${menuAssets.length} footage đã chọn` : contextAsset.name}</b></header>
          {contextAsset.deletedAt ? <footer>
            <button onClick={() => { setContextMenu(null); if (menuAssets.length > 1) onBatchAction({ kind: "restore", assetIds: menuAssets.map((asset) => asset.id) }); else onRestore(contextAsset); }} role="menuitem" type="button"><Icon name="folder" /> Restore{menuAssets.length > 1 ? ` (${menuAssets.length})` : ""}</button>
            <button className="media-context-menu__remove" onClick={() => { setContextMenu(null); if (menuAssets.length > 1) onBatchAction({ kind: "delete", assetIds: menuAssets.map((asset) => asset.id) }); else onRemove(contextAsset); }} role="menuitem" type="button"><Icon name="trash" /> Delete permanently{menuAssets.length > 1 ? ` (${menuAssets.length})` : ""}</button>
          </footer> : <>
          <section><strong>EMOTION</strong><div className="media-context-options media-context-options--emotion">{EMOTION_OPTIONS.map((option) => <button aria-pressed={menuAssets.every((asset) => asset.emotion === option.id)} className={menuAssets.every((asset) => asset.emotion === option.id) ? "is-active" : ""} key={option.id} onClick={() => updateMenuAnnotations({ kind: "annotations", changes: menuAssets.map((asset) => ({ assetId: asset.id, speakerProfileIds: asset.speakerProfileIds, environmentProfileIds: asset.environmentProfileIds, emotion: option.id })) })} role="menuitem" type="button">{option.label}</button>)}</div></section>
          <section><strong><Icon name="person" /> SPEAKER PROFILE</strong><div className="media-context-options media-context-options--speakers">{speakers.map((speaker) => { const assigned = menuAssets.every((asset) => asset.speakerProfileIds.includes(speaker.id)); return <button aria-pressed={assigned} className={assigned ? "is-active" : ""} key={speaker.id} onClick={() => updateMenuAnnotations({ kind: "annotations", changes: menuAssets.map((asset) => ({ assetId: asset.id, speakerProfileIds: assigned ? asset.speakerProfileIds.filter((id) => id !== speaker.id) : [...new Set([...asset.speakerProfileIds, speaker.id])], environmentProfileIds: asset.environmentProfileIds, emotion: asset.emotion })) })} role="menuitem" type="button"><i style={{ background: speaker.color }} />{speaker.name}</button>; })}{!speakers.length ? <p>Thêm Speaker Profile trong Sound Library trước.</p> : null}</div></section>
          <section><strong><Icon name="landscape" /> ENVIRONMENT PROFILE</strong><div className="media-context-options media-context-options--speakers">{environments.map((profile) => { const assigned = menuAssets.every((asset) => asset.environmentProfileIds.includes(profile.id)); return <button aria-pressed={assigned} className={assigned ? "is-active" : ""} key={profile.id} onClick={() => updateMenuAnnotations({ kind: "annotations", changes: menuAssets.map((asset) => ({ assetId: asset.id, speakerProfileIds: asset.speakerProfileIds, environmentProfileIds: assigned ? asset.environmentProfileIds.filter((id) => id !== profile.id) : [...new Set([...asset.environmentProfileIds, profile.id])], emotion: asset.emotion })) })} role="menuitem" type="button"><Icon name="landscape" />{profile.name}</button>; })}{!environments.length ? <p>Thêm Environment Profile trong Sound Library trước.</p> : null}</div></section>
          {menuAssets.length === 1 && contextAsset.availableAudioTracks?.length ? <section><strong><Icon name="waveform" /> AUDIO TRACKS</strong><div className="media-track-options">
            <div className="media-track-options__heading"><span>TRACK</span><span>IMPORT</span><span>STT</span></div>
            {contextAsset.availableAudioTracks.map((track) => { const child = childrenOf(contextAsset).find((item) => item.sourceArchiveStreamIndex === track.streamIndex) ?? (contextAsset.availableAudioTracks?.length === 1 ? contextAsset : undefined); return <div className="media-track-options__row" key={track.streamIndex}>
              <span title={track.title}><b>#{track.streamIndex} · {track.title}</b><small>{track.codec ?? "audio"}{track.channels ? ` · ${track.channels} ch` : ""}</small></span>
              <input aria-label={`Đã import track ${track.streamIndex} ${track.title}`} checked={child ? child.importSelected !== false : track.imported} disabled={busy || (!child && contextAsset.growingMkvFollow && !contextAsset.sourcePath.endsWith("source-final.mkv"))} onChange={(event) => { if (child) onToggleImport(child.id, event.target.checked); else if (event.target.checked) onToggleImport(contextAsset.id, true, track.streamIndex); }} type="checkbox" />
              <input aria-label={`STT track ${track.streamIndex} ${track.title}`} checked={Boolean(child?.transcriptionSelected)} disabled={!child || busy} onChange={(event) => { if (child) onToggleTranscription(child.id, event.target.checked); }} type="checkbox" />
            </div>; })}
          </div><p>Tick Import để thêm track hoặc đưa track trở lại workspace. MKV đang ghi cần Finish trước khi thêm track đã bỏ qua.</p></section> : null}
          <footer>
            {onSendTo ? <SendToMenu disabled={{
              "voice-manipulator": menuAssets.filter((asset) => !asset.disabled).length !== 1 ? "Chọn một footage để mở Voice Manipulation" : undefined,
              "lip-sync": menuAssets.every((asset) => asset.mediaKind !== "video" || asset.disabled) ? "Chọn footage video đang bật" : undefined,
              "voice-training": !menuTrainingEligible.length ? "Cần footage có audio để Training" : undefined,
            }} onSend={(target) => { setContextMenu(null); onSendTo(target, menuAssets.filter((asset) => !asset.disabled).map((asset) => asset.id)); }} /> : null}
            <button onClick={() => { setContextMenu(null); onReveal(contextAsset, "original"); }} role="menuitem" type="button"><Icon name="folder" /> Reveal in Explorer</button>
            <button disabled={Boolean(contextSource?.hasExternalSource && !contextSource.localCacheEnabled)} onClick={() => { setContextMenu(null); onReveal(contextAsset, "project"); }} role="menuitem" type="button"><Icon name="folder" /> Reveal in Project Folder</button>
            {contextAsset.hasExternalSource ? <button onClick={() => { setContextMenu(null); onSetLocalCache(contextAsset.id, !contextAsset.localCacheEnabled); }} role="menuitem" type="button"><Icon name="folder" /> {contextAsset.localCacheEnabled ? "Use original file" : "Local File Caching"}</button> : null}
            {contextAsset.hasExternalSource && contextAsset.localCacheEnabled ? <button onClick={() => { setContextMenu(null); onSetLocalCache(contextAsset.id, true); }} role="menuitem" type="button"><Icon name="upload" /> Refresh local cache</button> : null}
            <button onClick={() => openHistory(contextAsset)} role="menuitem" type="button"><Icon name="file" /> Text History</button>
            {contextAsset.growingMkvFollow && !contextAsset.sourcePath.endsWith("source-final.mkv") ? <button onClick={() => { setContextMenu(null); setMkvSttTargetId(contextAsset.id); setMkvSttDialogOpen(true); }} role="menuitem" type="button"><Icon name="file" /> STT kỹ MKV đang ghi</button> : null}
            {contextAsset.growingMkvFollow && !contextAsset.sourcePath.endsWith("source-final.mkv") ? <button onClick={() => { setContextMenu(null); onFinishGrowingMkv(contextAsset.id); }} role="menuitem" type="button"><Icon name="waveform" /> Finish MKV sau khi OBS dừng</button> : null}
            {menuAssets.length > 1 && menuSttEligible.length ? <button onClick={() => { setContextMenu(null); onBatchAction({ kind: "selection", target: "stt", assetIds: menuSttEligible.map((asset) => asset.id), selected: !menuSttEligible.every((asset) => groupSelected(asset, "transcriptionSelected")) }); }} role="menuitem" type="button"><Icon name="file" /> {menuSttEligible.every((asset) => groupSelected(asset, "transcriptionSelected")) ? "Bỏ STT" : "Chọn STT"} ({menuSttEligible.length})</button> : null}
            {menuAssets.length > 1 && menuTrainingEligible.length ? <button onClick={() => { setContextMenu(null); onBatchAction({ kind: "selection", target: "training", assetIds: menuTrainingEligible.map((asset) => asset.id), selected: !menuTrainingEligible.every((asset) => groupSelected(asset, "trainingSelected")) }); }} role="menuitem" type="button"><Icon name="training" /> {menuTrainingEligible.every((asset) => groupSelected(asset, "trainingSelected")) ? "Bỏ TRAIN" : "Chọn TRAIN"} ({menuTrainingEligible.length})</button> : null}
            <button onClick={() => { setContextMenu(null); if (menuAssets.length > 1) onBatchAction({ kind: "disabled", assetIds: menuAssets.map((asset) => asset.id), disabled: !menuAssets.every((asset) => asset.disabled) }); else onSetDisabled(contextAsset, !contextAsset.disabled); }} role="menuitem" type="button"><Icon name="power" /> {menuAssets.every((asset) => asset.disabled) ? "Enable footage" : "Disable footage"}</button>
            {contextTargets(contextAsset, "pause").length ? <button onClick={() => { setContextMenu(null); onControlTranscriptions("pause", contextTargets(contextAsset, "pause")); }} role="menuitem" type="button"><Icon name="power" /> Pause STT{contextTargets(contextAsset, "pause").length > 1 ? ` (${contextTargets(contextAsset, "pause").length})` : ""}</button> : null}
            {contextTargets(contextAsset, "resume").length ? <button onClick={() => { setContextMenu(null); onControlTranscriptions("resume", contextTargets(contextAsset, "resume")); }} role="menuitem" type="button"><Icon name="power" /> Chạy tiếp STT</button> : null}
            {contextTargets(contextAsset, "stop").length ? <button onClick={() => { setContextMenu(null); void Promise.resolve(onControlTranscriptions("stop", contextTargets(contextAsset, "stop"))).catch(() => undefined); }} role="menuitem" type="button"><Icon name="power" /> Dừng hàng đợi STT{contextTargets(contextAsset, "stop").length > 1 ? ` (${contextTargets(contextAsset, "stop").length})` : ""}</button> : null}
            <button className="media-context-menu__remove" onClick={() => { setContextMenu(null); if (menuAssets.length > 1) onBatchAction({ kind: "recycle", assetIds: menuAssets.map((asset) => asset.id) }); else onRemove(contextAsset); }} role="menuitem" type="button"><Icon name="trash" /> Remove{menuAssets.length > 1 ? ` (${menuAssets.length})` : ""}</button>
          </footer>
          </>}
        </div>,
        document.body,
      ) : null}
      {historyAsset ? <TranscriptHistoryDialog asset={historyAsset} onClose={() => setHistoryAssetId(null)} /> : null}
    </ModuleFrame>
  );
}
