import { editableWordTimings } from "../domain/editable-word-timing";
import type { ReferenceAssignment, ReferenceBindingDocument } from "../domain/reference-bindings";
import type {
  ActivitySnapshot,
  AppPreferences,
  CaptureTier,
  DatasetManifest,
  DatasetReadiness,
  GpuLeaseHolder,
  EmotionLabel,
  EngineProfileSchema,
  EngineStatus,
  MediaRevisionSource,
  MediaDiarizationProgress,
  MediaTranscriptionProgress,
  ObsCaptureSession,
  ObsSessionSubtitleStatus,
  ObsLiveSession,
  ObsLiveCaptionQuality,
  ObsLiveLinkStatus,
  ObsLiveLinkRecordingJournal,
  ObsPluginInstallationStatus,
  ObsRecordingInspection,
  ObsTrackSource,
  Project,
  ProjectCreate,
  ProjectMediaAsset,
  ProjectMediaImportResult,
  ProjectAsrAdapter,
  ProjectVoice,
  ConsentEvidence,
  VoiceCollection,
  VoiceCollectionProperties,
  VoiceCollectionImport,
  VoiceCollectionEntry,
  SpeakerEmbedderInfo,
  VoiceModelSet,
  VoiceOutput,
  VoiceScriptJob,
  VoiceScriptDocument,
  VoiceChangerPreflight,
  VoiceChangerRecording,
  VoiceChangerStatus,
  ReadingAudienceVocabulary,
  ReadingPack,
  ReadingPackSummary,
  ReadingSession,
  ReadingPassageDraft,
  RuntimeAction,
  RuntimeWorkloadState,
  StudioAudioItem,
  StudioJobResult,
  StudioWord,
  SystemLog,
  SystemMetrics,
  SystemPaths,
  TimelineEditRange,
  TimelineGainKeyframe,
  TranscriptReviewResult,
  TrainingCatalog,
  TrainingProgressLine,
  TrainingRuntimeReport,
  TrainingModelOption,
  TrainingParameterValue,
  TrainingRun,
  TrainingRunFootprint,
  TrainingRunLog,
  WorkspacePage,
} from "../domain/types";
import type { MediaPoolOrganization } from "../modules/media-pool/media-organization";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Request failed (${response.status})`);
  }
  // A successful delete answers 204 with no body at all. Parsing that as JSON
  // threw, so the caller saw a failure for work the server had already done -
  // the row stayed on screen until the app was restarted, and trying again got
  // "not found" for something genuinely gone.
  if (response.status === 204 || response.status === 205) return undefined as T;
  return response.json() as Promise<T>;
}


async function downloadSrt(path: string, fallbackFilename: string): Promise<{ skippedCues: number }> {
  return downloadFile(path, fallbackFilename);
}

async function downloadFile(path: string, fallbackFilename: string, init?: RequestInit): Promise<{ skippedCues: number }> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Không thể tải file (${response.status})`);
  }
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/iu.exec(contentDisposition)?.[1] ?? fallbackFilename;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  const skippedCues = Number(response.headers.get("X-Pro4Bro-Skipped-Cues") ?? 0);
  return { skippedCues: Number.isSafeInteger(skippedCues) && skippedCues > 0 ? skippedCues : 0 };
}
function normalizeWord(word: StudioWord & Record<string, unknown>): StudioWord {
  return {
    ...word,
    reviewState: word.reviewState ?? word.review_state as StudioWord["reviewState"],
    selectedVariant: word.selectedVariant ?? word.selected_variant as StudioWord["selectedVariant"],
    diarizationSpeakerId: word.diarizationSpeakerId ?? word.diarization_speaker_id as string | null | undefined,
    manualDiarizationSpeakerId: word.manualDiarizationSpeakerId ?? word.manual_diarization_speaker_id as string | null | undefined,
    speakerId: word.speakerId ?? word.speaker_id as string | null | undefined,
    environmentProfileIds: word.environmentProfileIds ?? word.environment_profile_ids as string[] | undefined ?? [],
  };
}

function normalizeStudioItem(item: StudioAudioItem): StudioAudioItem {
  const legacy = item as unknown as Record<string, unknown>;
  return {
    ...item,
    url: item.url.startsWith("/media/") ? `/api/studio${item.url}` : item.url,
    sampleRate: item.sampleRate ?? Number(legacy.sample_rate ?? 0),
    voiceId: item.voiceId ?? String(legacy.voice_id ?? ""),
    voiceName: item.voiceName ?? String(legacy.voice_name ?? ""),
    words: editableWordTimings((item.words ?? []).map((word) => normalizeWord(word as StudioWord & Record<string, unknown>)), item.duration),
  };
}

function normalizeMediaAsset(asset: ProjectMediaAsset): ProjectMediaAsset {
  return {
    ...asset,
    transcriptionStatus: asset.transcriptionStatus ?? "complete",
    importSelected: asset.importSelected ?? true,
    transcriptionSelected: asset.transcriptionSelected ?? false,
    transcriptionProgress: asset.transcriptionProgress ?? (asset.transcriptionStatus === "complete" ? 100 : 0),
    transcriptionError: asset.transcriptionError ?? null,
    deletedAt: asset.deletedAt ?? null,
    disabled: asset.disabled ?? false,
    diarizationStatus: asset.diarizationStatus ?? "idle",
    diarizationSelected: asset.diarizationSelected ?? false,
    diarizationProgress: asset.diarizationProgress ?? 0,
    diarizationError: asset.diarizationError ?? null,
    diarizationSpeakerAssignments: asset.diarizationSpeakerAssignments ?? (asset as unknown as Record<string, unknown>).diarization_speaker_assignments as Record<string, string | null> | undefined ?? {},
    aiReviewStatus: asset.aiReviewStatus ?? "skipped",
    wordTimingQuality: asset.wordTimingQuality ?? (asset as unknown as Record<string, unknown>).word_timing_quality as ProjectMediaAsset["wordTimingQuality"] ?? "unverified",
    wordTimingNote: asset.wordTimingNote ?? (asset as unknown as Record<string, unknown>).word_timing_note as string | null | undefined ?? null,
    removedRanges: asset.removedRanges ?? [],
    gainKeyframes: asset.gainKeyframes ?? [],
    trainingSelected: asset.trainingSelected ?? false,
    speakerProfileIds: asset.speakerProfileIds ?? [],
    environmentProfileIds: asset.environmentProfileIds ?? [],
    emotion: asset.emotion ?? "normal",
    url: asset.url?.startsWith("/media/") ? `/api/studio${asset.url}` : asset.url,
    words: editableWordTimings((asset.words ?? []).map((word) => normalizeWord(word as StudioWord & Record<string, unknown>)), asset.duration),
  };
}

export const api = {
  getActivity: (after = 0, limit = 400) =>
    request<ActivitySnapshot>(`/api/activity?after=${after}&limit=${limit}`),
  getRuntimeStatus: () => request<RuntimeWorkloadState>("/api/runtime/status"),
  controlRuntime: (action: RuntimeAction) =>
    request<RuntimeWorkloadState>("/api/runtime/actions", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  listProjects: () => request<Project[]>("/api/projects"),
  createProject: (payload: ProjectCreate) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(payload) }),
  openProject: (path: string) =>
    request<Project>("/api/projects/open", { method: "POST", body: JSON.stringify({ path }) }),
  setLastPage: (projectId: string, page: WorkspacePage) =>
    request<Project>(`/api/projects/${projectId}/last-page?page=${page}`, { method: "PATCH" }),
  getOmniVoiceStatus: () => request<EngineStatus>("/api/engines/omnivoice"),
  getOmniVoiceProfileSchema: () => request<EngineProfileSchema>("/api/engines/omnivoice/profile-schema"),
  listVoiceCollections: () => request<VoiceCollection[]>("/api/voice-collections"),
  createVoiceCollection: (name: string, properties: VoiceCollectionProperties) =>
    request<VoiceCollection>("/api/voice-collections", { method: "POST", body: JSON.stringify({ name, properties }) }),
  addVoiceToCollection: (collectionId: string, projectId: string, voiceId: string) =>
    request<VoiceCollectionEntry>(`/api/voice-collections/${collectionId}/entries`, { method: "POST", body: JSON.stringify({ projectId, voiceId }) }),
  importCollectionVoice: (collectionId: string, entryId: string, projectId: string) =>
    request<VoiceCollectionImport>(`/api/voice-collections/${collectionId}/entries/${entryId}/import`, { method: "POST", body: JSON.stringify({ projectId }) }),
  exportVoiceCollectionEntry: (collectionId: string, entryId: string) =>
    downloadFile(`/api/voice-collections/${collectionId}/entries/${entryId}/export`, `voice-entry-${entryId}.zip`),
  exportSelectedCollectionVoices: (collectionId: string, entryIds: string[]) =>
    request<{ cancelled: boolean; paths: string[] }>(`/api/voice-collections/${collectionId}/export-selected`, { method: "POST", body: JSON.stringify({ entryIds }) }),
  importNativeCollectionVoices: (collectionId: string) =>
    request<{ cancelled: boolean; entries: import("../domain/types").VoiceCollectionEntry[]; errors: string[] }>(`/api/voice-collections/${collectionId}/entries/import-native`, { method: "POST" }),
  getCollectionVoicePreview: (collectionId: string, entryId: string) =>
    request<import("../domain/types").CollectionVoicePreview>(`/api/voice-collections/${collectionId}/entries/${entryId}/preview`),
  startCollectionVoicePreview: (collectionId: string, entryId: string) =>
    request<import("../domain/types").CollectionVoicePreview>(`/api/voice-collections/${collectionId}/entries/${entryId}/preview`, { method: "POST" }),
  importVoiceCollectionPackage: (collectionId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<VoiceCollectionEntry>(`/api/voice-collections/${collectionId}/entries/import-package`, { method: "POST", body });
  },
  uploadConsentEvidence: (projectId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<ConsentEvidence>(`/api/projects/${projectId}/consent-evidence`, { method: "POST", body });
  },
  getPreferences: () => request<AppPreferences>("/api/preferences"),
  getObsPluginInstallation: (obsRoot?: string) =>
    request<ObsPluginInstallationStatus>(`/api/obs-plugin/installation${obsRoot ? `?obsRoot=${encodeURIComponent(obsRoot)}` : ""}`),
  changeObsPluginInstallation: (action: "install" | "repair" | "remove" | "open-obs" | "reset-pairing", obsRoot?: string, removePairing = false) =>
    request<ObsPluginInstallationStatus>("/api/obs-plugin/installation", {
      method: "POST", body: JSON.stringify({ action, obsRoot: obsRoot || null, removePairing }),
    }),
  claimObsLiveLinkTarget: (projectId: string, ownerId: string) =>
    request<void>("/api/obs-livelink/v3/lease", {
      method: "PUT", body: JSON.stringify({ projectId, ownerId }),
    }),
  releaseObsLiveLinkTarget: (ownerId: string) =>
    request<void>("/api/obs-livelink/v3/lease/release", {
      method: "POST", body: JSON.stringify({ ownerId }),
    }),
  getObsLiveLinkStatus: () => request<ObsLiveLinkStatus>("/api/obs-livelink/v3/status"),
  getObsLiveLinkWaveform: (projectId: string, recordingId: string, channelId: string,
                           startSeconds: number, endSeconds: number, maxPoints = 600,
                           afterSequence?: number) => {
    const query = new URLSearchParams({ channelId, startSeconds: String(startSeconds),
      endSeconds: String(endSeconds), maxPoints: String(maxPoints) });
    if (afterSequence !== undefined) query.set("afterSequence", String(afterSequence));
    return request<import("../domain/types").ObsLiveLinkWaveform>(
      `/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/waveform?${query}`);
  },
  getObsLiveLinkTranscriptEvents: (projectId: string, recordingId: string, afterRevision = 0) =>
    request<import("../domain/types").ObsLiveLinkTranscriptSnapshot>(
      `/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/transcript-events?afterRevision=${afterRevision}`),
  setObsLiveLinkRecordingFolder: (enabled: boolean) =>
    request<ObsLiveLinkStatus>("/api/obs-livelink/v3/recording-folder", {
      method: "PUT", body: JSON.stringify({ enabled }),
    }),
  importObsLiveLinkVideoSpan: async (projectId: string, spanId: string, sourcePath?: string) =>
    normalizeMediaAsset(await request<ProjectMediaAsset>(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/video-spans/import`, {
      method: "POST", body: JSON.stringify({ spanId, sourcePath: sourcePath ?? null }),
    })),
  setObsLiveLinkForward: (channelId: string, enabled: boolean) =>
    request<ObsLiveLinkStatus>(`/api/obs-livelink/v3/channels/${encodeURIComponent(channelId)}/forward`, {
      method: "POST", body: JSON.stringify({ enabled }),
    }),
  actOnObsLiveLinkRecording: (action: "start" | "pause" | "resume" | "stop") =>
    request<ObsLiveLinkStatus>("/api/obs-livelink/v3/recording/actions", {
      method: "POST", body: JSON.stringify({ action }),
    }),
  setObsLiveLinkTriggerPolicy: (projectId: string, policy: import("../domain/types").ObsLiveLinkTriggerPolicy) =>
    request<ObsLiveLinkStatus>(`/api/obs-livelink/v3/projects/${encodeURIComponent(projectId)}/trigger-policy`, {
      method: "PUT", body: JSON.stringify(policy),
    }),
  listObsLiveLinkRecordings: (projectId: string, includeDeleted = false) =>
    request<import("../domain/types").ObsLiveLinkRecordingJournal[]>(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings${includeDeleted ? "?includeDeleted=true" : ""}`),
  recycleObsLiveLinkRecording: (projectId: string, recordingId: string) =>
    request<{ recordingId: string; deletedAt: string | null }>(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/recycle`, { method: "POST" }),
  restoreObsLiveLinkRecording: (projectId: string, recordingId: string) =>
    request<{ recordingId: string; deletedAt: string | null }>(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/restore`, { method: "POST" }),
  deleteObsLiveLinkRecording: (projectId: string, recordingId: string) =>
    request<{ recordingId: string; deletedAt: string | null }>(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}`, { method: "DELETE" }),
  previewObsLiveLinkChannel: async (projectId: string, recordingId: string, channelId: string,
                                    startSeconds?: number) => {
    const query = new URLSearchParams({ durationSeconds: "30" });
    if (startSeconds !== undefined) query.set("startSeconds", String(startSeconds));
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/channels/${encodeURIComponent(channelId)}/preview?${query}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(body?.detail ?? `Không nghe thử được OBS (${response.status})`);
    }
    const startHeader = response.headers.get("X-Preview-Start-Seconds");
    const endHeader = response.headers.get("X-Preview-End-Seconds");
    const previewStartSeconds = Number(startHeader);
    const endSeconds = Number(endHeader);
    if (startHeader === null || endHeader === null || !Number.isFinite(previewStartSeconds) ||
        !Number.isFinite(endSeconds) || endSeconds <= previewStartSeconds)
      throw new Error("Mốc thời gian nghe thử OBS không hợp lệ.");
    return { blob: await response.blob(), startSeconds: previewStartSeconds, endSeconds };
  },
  startObsLiveLinkDetailedStt: (projectId: string, recordingId: string, segmentSeconds: number,
                                channelIds: string[], model = "large-v3") =>
    request<{ segmentSeconds: number; tracks: Record<string, { initialFrames: number; cursor: number }> }>(
      `/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/detailed-stt`,
      { method: "POST", body: JSON.stringify({ segmentSeconds, channelIds, model }) },
    ),
  getObsLiveLinkDetailedStt: (projectId: string, recordingId: string) =>
    request<{ segmentSeconds: number; tracks: Record<string, { initialFrames: number; cursor: number }>; error?: string | null }>(
      `/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/detailed-stt`),
  stopObsLiveLinkDetailedStt: (projectId: string, recordingId: string, mode: "queue" | "all") =>
    request<NonNullable<ObsLiveLinkRecordingJournal["detailedStt"]>>(
      `/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/detailed-stt/control`,
      { method: "POST", body: JSON.stringify({ mode }) },
    ),
  retryObsLiveLinkArchive: (projectId: string, recordingId: string) =>
    request<{ artifactReady: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/archive/retry`, {
      method: "POST",
    }),
  retryObsLiveLinkOutbox: async (projectId: string, recordingId: string) => {
    const path = `/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/outbox`;
    const snapshot = await request<{ rejectedDigest: string }>(path);
    return request<{ retriedChunks: number; durablyAccepted: false }>(`${path}/retry`, {
      method: "POST", body: JSON.stringify({ rejectedDigest: snapshot.rejectedDigest }),
    });
  },
  exportObsLiveLinkOutbox: (projectId: string, recordingId: string) =>
    downloadFile(`/api/projects/${encodeURIComponent(projectId)}/obs-livelink/recordings/${encodeURIComponent(recordingId)}/outbox/export`, `${recordingId}--outbox.zip`, { method: "POST" }),
  savePreferences: (preferences: AppPreferences) =>
    request<AppPreferences>("/api/preferences", { method: "PUT", body: JSON.stringify(preferences) }),
  getSystemStatus: () => request<SystemMetrics>("/api/system/status"),
  getSystemLogs: () => request<SystemLog>("/api/system/logs?lines=320"),
  getSystemPaths: () => request<SystemPaths>("/api/system/paths"),
  pickFolder: (initialPath: string) =>
    request<{ path: string | null }>("/api/system/pick-folder", {
      method: "POST",
      body: JSON.stringify({ initialPath }),
    }),
  pickMediaFile: (initialPath = "") =>
    request<{ path: string | null }>("/api/system/pick-media-file", {
      method: "POST",
      body: JSON.stringify({ initialPath }),
    }),
  pickMediaFiles: (initialPath = "") =>
    request<{ paths: string[] }>("/api/system/pick-media-files", {
      method: "POST",
      body: JSON.stringify({ initialPath }),
    }),
  inspectLocalMediaTracks: (projectId: string, sourcePath: string) =>
    request<{ tracks: Array<{ streamIndex: number; title: string; codec: string; channels: number | null }> }>(
      `/api/projects/${projectId}/media/inspect-local`,
      { method: "POST", body: JSON.stringify({ sourcePath }) },
    ),
  importLocalProjectMedia: async (projectId: string, sourcePath: string, cacheLocal: boolean,
                                  streamIndexes?: number[], transcribeStreamIndexes?: number[]) => {
    const result = await request<ProjectMediaImportResult>("/api/projects/" + projectId + "/media/import-local", {
      method: "POST",
      body: JSON.stringify({ sourcePath, cacheLocal, streamIndexes, transcribeStreamIndexes }),
    });
    return { ...result, asset: normalizeMediaAsset(result.asset), item: result.item ? normalizeStudioItem(result.item) : null };
  },
  startGrowingMkvFollow: async (projectId: string, sourcePath: string, streamIndexes: number[], transcribeStreamIndexes: number[], sttSegmentSeconds = 60) => {
    const result = await request<ProjectMediaImportResult>(`/api/projects/${projectId}/media/follow-mkv`, {
      method: "POST", body: JSON.stringify({ sourcePath, streamIndexes, transcribeStreamIndexes, sttSegmentSeconds }),
    });
    return { ...result, asset: normalizeMediaAsset(result.asset) };
  },
  getGrowingMkvAssets: async (projectId: string, assetId: string) => {
    const assets = await request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media/${assetId}/follow/assets`);
    return assets.map(normalizeMediaAsset);
  },
  finishGrowingMkvFollow: (projectId: string, assetId: string) =>
    request<{ finished: boolean }>(`/api/projects/${projectId}/media/${assetId}/follow/finish`, { method: "POST" }),
  startGrowingMkvDetailedStt: (projectId: string, assetId: string, segmentSeconds: number) =>
    request<{ assetId: string; segmentSeconds: number; selectedTrackCount: number }>(
      `/api/projects/${projectId}/media/${assetId}/follow/detailed-stt`,
      { method: "POST", body: JSON.stringify({ segmentSeconds }) },
    ),
  updateMediaLocalCache: async (projectId: string, assetId: string, enabled: boolean) => {
    const asset = await request<ProjectMediaAsset>("/api/projects/" + projectId + "/media/" + assetId + "/local-cache", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    return normalizeMediaAsset(asset);
  },
  listProjectMedia: async (projectId: string) => {
    const assets = await request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media`);
    return assets.map(normalizeMediaAsset);
  },
  getMediaPoolOrganization: (projectId: string) =>
    request<MediaPoolOrganization>(`/api/projects/${projectId}/media/organization`),
  updateMediaPoolOrganization: (projectId: string, organization: MediaPoolOrganization) =>
    request<MediaPoolOrganization>(`/api/projects/${projectId}/media/organization`, {
      method: "PATCH", body: JSON.stringify(organization),
    }),
  inspectObsRecording: (projectId: string, sourcePath: string) =>
    request<ObsRecordingInspection>(`/api/projects/${projectId}/obs-sessions/inspect`, {
      method: "POST", body: JSON.stringify({ sourcePath }),
    }),
  createObsSession: (projectId: string, sourcePath: string, sources: ObsTrackSource[]) =>
    request<ObsCaptureSession>(`/api/projects/${projectId}/obs-sessions`, {
      method: "POST", body: JSON.stringify({ sourcePath, sources }),
    }),
  listObsSessions: (projectId: string) =>
    request<ObsCaptureSession[]>(`/api/projects/${projectId}/obs-sessions`),
  getObsSessionSubtitleStatus: (projectId: string, sessionId: string) =>
    request<ObsSessionSubtitleStatus>(`/api/projects/${projectId}/obs-sessions/${sessionId}/subtitles/status`),
  exportObsSessionSubtitles: (projectId: string, sessionId: string, assetIds: string[]) =>
    downloadSrt(`/api/projects/${projectId}/obs-sessions/${sessionId}/subtitles?${new URLSearchParams(assetIds.map((id) => ["assetIds", id])).toString()}`, `${sessionId}--session.srt`),
  renderObsSessionHardSubtitle: (projectId: string, sessionId: string, assetIds: string[]) =>
    downloadFile(`/api/projects/${projectId}/obs-sessions/${sessionId}/hard-subtitle?${new URLSearchParams(assetIds.map((id) => ["assetIds", id])).toString()}`, `${sessionId}--hard-subtitle.mp4`, { method: "POST" }),
  getObsLivePairing: (projectId: string) =>
    request<{ protocolVersion: string; token: string; overlayPath: string }>(`/api/projects/${projectId}/obs-live/pairing`),
  listObsLiveSessions: (projectId: string) =>
    request<ObsLiveSession[]>(`/api/projects/${projectId}/obs-live/sessions`),
  getObsLiveCaptionQuality: (projectId: string, sessionId: string) =>
    request<ObsLiveCaptionQuality>(`/api/projects/${projectId}/obs-live/sessions/${sessionId}/caption-quality`),
  listProjectMediaTranscriptionStatus: (projectId: string) =>
    request<MediaTranscriptionProgress[]>(`/api/projects/${projectId}/media/transcription-status`),
  // Job snapshots only. Polling the full media list for progress transferred the
  // entire transcript of every asset several times a second.
  listProjectMediaDiarizationStatus: (projectId: string) =>
    request<MediaDiarizationProgress[]>(`/api/projects/${projectId}/media/diarization-status`),
  importProjectMedia: async (
    projectId: string,
    file: File,
    origin: "record" | "import",
    realtimeText = "",
    transcribe = false,
    queueForTranscription = false,
    captureTier: CaptureTier | null = null,
  ) => {
    const body = new FormData();
    body.append("file", file);
    body.append("origin", origin);
    body.append("realtime_text", realtimeText);
    if (captureTier) body.append("capture_tier", captureTier);
    body.append("transcribe", String(transcribe));
    body.append("queue_for_transcription", String(queueForTranscription));
    const result = await request<ProjectMediaImportResult>(`/api/projects/${projectId}/media/import`, { method: "POST", body });
    return {
      ...result,
      asset: normalizeMediaAsset(result.asset),
      item: result.item ? normalizeStudioItem(result.item) : null,
    };
  },
  /** Pause, resume or stop a Speech to text run. No ids means the whole queue. */
  controlMediaTranscriptions: async (
    projectId: string,
    action: "pause" | "resume" | "stop" | "stop-all",
    assetIds?: string[],
  ) => {
    const assets = await request<ProjectMediaAsset[]>(
      `/api/projects/${projectId}/media/transcriptions/control`,
      { method: "POST", body: JSON.stringify({ action, assetIds: assetIds ?? null }) },
    );
    return assets.map(normalizeMediaAsset);
  },
  stopMediaDiarizations: async (projectId: string, mode: "queue" | "all") => {
    const assets = await request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media/diarizations/control`, {
      method: "POST", body: JSON.stringify({ mode }),
    });
    return assets.map(normalizeMediaAsset);
  },
  stopTrainingRuns: (projectId: string, mode: "queue" | "all") =>
    request<TrainingRun[]>(`/api/projects/${projectId}/training-runs/control`, { method: "POST", body: JSON.stringify({ mode }) }),
  stopGeneration: (projectId: string, mode: "queue" | "all") =>
    request<VoiceScriptJob | null>(`/api/projects/${projectId}/generation/control`, { method: "POST", body: JSON.stringify({ mode }) }),
  updateMediaScript: async (projectId: string, assetId: string, text: string, source: MediaRevisionSource, words?: StudioWord[]) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/script`, {
      method: "PATCH",
      body: JSON.stringify({ text, source, words }),
    });
    return normalizeMediaAsset(asset);
  },
  exportProjectSubtitles: (projectId: string, assetId: string, mode: "sentence" | "word" | "table") =>
    downloadSrt(
      `/api/projects/${projectId}/media/${assetId}/subtitles?mode=${mode}`,
      `subtitles--${mode}.${mode === "table" ? "csv" : "srt"}`,
    ),
  reviewMediaTranscript: async (projectId: string, assetId: string) => {
    const result = await request<TranscriptReviewResult>(`/api/projects/${projectId}/media/${assetId}/review`, {
      method: "POST",
    });
    return { ...result, asset: normalizeMediaAsset(result.asset) };
  },
  updateMediaTimelineEdits: async (projectId: string, assetId: string, removedRanges: TimelineEditRange[], gainKeyframes: TimelineGainKeyframe[] = [], workingRange: TimelineEditRange | null = null, cutPoints: number[] = []) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/timeline-edits`, {
      method: "PATCH",
      body: JSON.stringify({ removedRanges, gainKeyframes, workingRange, cutPoints }),
    });
    return normalizeMediaAsset(asset);
  },
  updateObsTimelineCuts: async (projectId: string, assetIds: string[], removedRanges: TimelineEditRange[]) => {
    const assets = await request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media/timeline-cuts-batch`, {
      method: "PATCH",
      body: JSON.stringify({ assetIds, removedRanges }),
    });
    return assets.map(normalizeMediaAsset);
  },
  importExistingAudioTrack: async (projectId: string, assetId: string, streamIndex: number) => {
    const asset = await request<ProjectMediaAsset>(
      `/api/projects/${projectId}/media/${assetId}/audio-tracks/${streamIndex}/import`,
      { method: "POST" },
    );
    return normalizeMediaAsset(asset);
  },
  setMediaTrainingSelected: async (projectId: string, assetId: string, selected: boolean) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/training-selection`, {
      method: "PATCH",
      body: JSON.stringify({ selected }),
    });
    return normalizeMediaAsset(asset);
  },
  setMediaImportSelected: async (projectId: string, assetId: string, selected: boolean) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/import-selection`, {
      method: "PATCH", body: JSON.stringify({ selected }),
    });
    return normalizeMediaAsset(asset);
  },
  setMediaDiarizationSelected: async (projectId: string, assetId: string, selected: boolean) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/diarization-selection`, {
      method: "PATCH", body: JSON.stringify({ selected }),
    });
    return normalizeMediaAsset(asset);
  },
  setMediaTranscriptionSelected: async (projectId: string, assetId: string, selected: boolean) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/transcription-selection`, {
      method: "PATCH",
      body: JSON.stringify({ selected }),
    });
    return normalizeMediaAsset(asset);
  },
  enqueueMediaDiarization: async (projectId: string, assetId: string, expectedSpeakers: number | null = null) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/diarization`, { method: "POST", body: JSON.stringify({ expectedSpeakers }) });
    return normalizeMediaAsset(asset);
  },
  updateMediaDiarizationAssignments: async (projectId: string, assetId: string, assignments: Record<string, string | null>) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/diarization-assignments`, {
      method: "PATCH",
      body: JSON.stringify({ assignments }),
    });
    return normalizeMediaAsset(asset);
  },
  getMediaDiarizationStatus: (projectId: string, assetId: string) =>
    request<{ id: string; diarizationStatus: string; diarizationProgress: number; diarizationError: string | null }>(`/api/projects/${projectId}/media/${assetId}/diarization-status`),
  enqueueMediaTranscriptions: async (projectId: string, assetIds: string[], model = "large-v3") => {
    const assets = await request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media/transcriptions`, {
      method: "POST",
      body: JSON.stringify({ assetIds, model }),
    });
    return assets.map(normalizeMediaAsset);
  },
  /** Send footage to the project's recycle bin, and get it back as it now stands. */
  recycleProjectMedia: async (projectId: string, assetId: string) =>
    normalizeMediaAsset(await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}`, { method: "DELETE" })),
  restoreProjectMedia: async (projectId: string, assetId: string) =>
    normalizeMediaAsset(await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/restore`, { method: "POST" })),
  /**
   * Add a slice of what is being captured to a live session.
   *
   * `text` is settled and never changes; `pending` is the provisional tail that
   * a later pass may still revise.
   */
  liveTranscribeChunk: async (session: string, chunk: Blob, language = "", model = "tiny") => {
    const body = new FormData();
    body.append("file", chunk, "chunk.wav");
    body.append("session", session);
    body.append("model", model);
    // The project already knows its language; letting a four-second fragment
    // guess produced a Vietnamese clip transcribed as Chinese.
    body.append("language", language);
    return request<{ committed: string; text: string; pending: string }>("/api/live-transcribe", { method: "POST", body });
  },
  endLiveTranscribe: async (session: string) => {
    const body = new FormData();
    body.append("session", session);
    return request<{ text: string; committed: string }>("/api/live-transcribe/end", { method: "POST", body });
  },
  setMediaDisabled: async (projectId: string, assetId: string, disabled: boolean) =>
    normalizeMediaAsset(await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/disabled?disabled=${disabled}`, { method: "POST" })),
  revealMediaFile: (projectId: string, assetId: string, location: "original" | "project") =>
    request<void>(`/api/projects/${projectId}/media/${assetId}/reveal?location=${location}`, { method: "POST" }),
  revealProjectFolder: (projectId: string) =>
    request<void>(`/api/projects/${projectId}/reveal`, { method: "POST" }),
  /** Drop a project from the library; its files stay on disk. */
  forgetProject: (projectId: string) =>
    request<void>(`/api/projects/${projectId}`, { method: "DELETE" }),
  /** Erase a project's folder. There is nothing after this. */
  destroyProject: (projectId: string) =>
    request<void>(`/api/projects/${projectId}?permanent=true`, { method: "DELETE" }),
  /** Erase footage and its folder. There is nothing after this. */
  removeProjectMedia: (projectId: string, assetId: string) =>
    request<void>(`/api/projects/${projectId}/media/${assetId}?permanent=true`, { method: "DELETE" }),
  updateMediaAnnotations: async (
    projectId: string,
    assetId: string,
    speakerProfileIds: string[],
    environmentProfileIds: string[],
    emotion: EmotionLabel,
  ) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/annotations`, {
      method: "PATCH",
      body: JSON.stringify({ speakerProfileIds, environmentProfileIds, emotion }),
    });
    return normalizeMediaAsset(asset);
  },
  setMediaReferenceSelected: (projectId: string, assetIds: string[], selected: boolean) => request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media/reference-selection`, {
    method: "PATCH", body: JSON.stringify({ assetIds, selected }),
  }),
  listReadingPacks: () => request<ReadingPackSummary[]>("/api/reading-packs"),
  listReadingSessions: (projectId: string) =>
    request<{ items: ReadingSession[]; total: number }>(`/api/projects/${projectId}/reading-sessions?status=in_progress`),
  createReadingSession: (projectId: string, payload: { sessionId: string; packId: string; speakerProfileId: string; emotions: EmotionLabel[]; mode: "flow" | "take" }) =>
    request<ReadingSession>(`/api/projects/${projectId}/reading-sessions`, { method: "POST", body: JSON.stringify(payload) }),
  skipReadingCard: (projectId: string, sessionId: string, expectedRevision: number, cardId: string) =>
    request<ReadingSession>(`/api/projects/${projectId}/reading-sessions/${sessionId}/skip`, { method: "POST", body: JSON.stringify({ expectedRevision, cardId }) }),
  endReadingSession: (projectId: string, sessionId: string, expectedRevision: number) =>
    request<ReadingSession>(`/api/projects/${projectId}/reading-sessions/${sessionId}/end`, { method: "POST", body: JSON.stringify({ expectedRevision }) }),
  appendReadingTake: async (projectId: string, sessionId: string, file: File, captureId: string, cardId: string, expectedRevision: number) => {
    const body = new FormData();
    body.append("file", file);
    body.append("capture_id", captureId);
    body.append("card_id", cardId);
    body.append("expected_revision", String(expectedRevision));
    const result = await request<{ session: ReadingSession; asset: ProjectMediaAsset }>(`/api/projects/${projectId}/reading-sessions/${sessionId}/takes`, { method: "POST", body });
    return { ...result, asset: normalizeMediaAsset(result.asset) };
  },
  getReadingPack: (packId: string) => request<ReadingPack>(`/api/reading-packs/${packId}`),
  getReadingAudience: () => request<ReadingAudienceVocabulary>("/api/reading-packs/audience"),
  addReadingPassage: (draft: ReadingPassageDraft) =>
    request<ReadingPack>("/api/reading-packs/passages", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  getDatasetReadiness: (projectId: string) =>
    request<DatasetReadiness>(`/api/projects/${projectId}/dataset/readiness`),
  compileDataset: (projectId: string) =>
    request<DatasetManifest>(`/api/projects/${projectId}/dataset/compile`, { method: "POST" }),
  startTrainingRun: (projectId: string, payload: { manifestId: string; config?: Record<string, unknown>; resumeRunId?: string | null; speakerProfileIds?: string[] }) =>
    request<TrainingRun>(`/api/projects/${projectId}/training-runs`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listTrainingRuns: (projectId: string) =>
    request<TrainingRun[]>(`/api/projects/${projectId}/training-runs`),
  getTrainingRunProgress: (projectId: string, runId: string, limit = 400) =>
    request<TrainingProgressLine[]>(
      `/api/projects/${projectId}/training-runs/${runId}/progress?limit=${limit}`,
    ),
  cancelTrainingRun: (projectId: string, runId: string) =>
    request<TrainingRun>(`/api/projects/${projectId}/training-runs/${runId}/cancel`, {
      method: "POST",
    }),
  getTrainingRunLog: (projectId: string, runId: string) =>
    request<TrainingRunLog>(`/api/projects/${projectId}/training-runs/${runId}/log`),
  getTrainingRunFootprint: (projectId: string, runId: string) =>
    request<TrainingRunFootprint>(`/api/projects/${projectId}/training-runs/${runId}/footprint`),
  deleteTrainingRun: (projectId: string, runId: string, withOutputs = false) =>
    request<TrainingRunFootprint>(`/api/projects/${projectId}/training-runs/${runId}?withOutputs=${withOutputs}`, { method: "DELETE" }),
  deleteProjectVoice: (projectId: string, voiceId: string) =>
    request<void>(`/api/projects/${projectId}/voices/${voiceId}`, { method: "DELETE" }),
  deleteAsrAdapter: (projectId: string, adapterId: string) =>
    request<void>(`/api/projects/${projectId}/asr-adapters/${adapterId}`, { method: "DELETE" }),
  deleteReadingPassage: (passageId: string) =>
    request<void>(`/api/reading-packs/passages/${encodeURIComponent(passageId)}`, { method: "DELETE" }),
  getGpuLease: () => request<GpuLeaseHolder | null>("/api/gpu-lease"),
  getTrainingRuntime: () => request<TrainingRuntimeReport>("/api/training-runtime"),
  getTrainingModels: () => request<TrainingModelOption[]>("/api/training-models"),
  getVoiceGenerators: () => request<TrainingModelOption[]>("/api/voice-generators"),
  getSttEngines: () => request<TrainingModelOption[]>("/api/stt-engines"),
  listAsrAdapters: (projectId: string) => request<ProjectAsrAdapter[]>(`/api/projects/${projectId}/asr-adapters`),
  listVoiceOutputs: (projectId: string) => request<VoiceOutput[]>(`/api/projects/${projectId}/voice-outputs`),
  deleteVoiceOutput: (projectId: string, outputId: string) =>
    request<void>(`/api/projects/${projectId}/voice-outputs/${outputId}`, { method: "DELETE" }),
  downloadVoiceOutputAudio: (projectId: string, outputId: string) =>
    downloadFile(`/api/projects/${projectId}/voice-outputs/${outputId}/audio`, `${outputId}.wav`),
  exportVoiceOutputSubtitles: (projectId: string, outputId: string, mode: "sentence" | "word" | "table" | "line") =>
    downloadSrt(
      `/api/projects/${projectId}/voice-outputs/${outputId}/subtitles?mode=${mode}`,
      `voice-output--${mode}.${mode === "table" ? "csv" : "srt"}`,
    ),
  getVoiceScript: (projectId: string) => request<VoiceScriptDocument>(`/api/projects/${projectId}/voice-script`),
  getReferenceBindings: (projectId: string) => request<ReferenceBindingDocument>(`/api/projects/${projectId}/reference-bindings`),
  assignReferences: (projectId: string, assignment: ReferenceAssignment) => request<ReferenceBindingDocument>(`/api/projects/${projectId}/reference-bindings`, { method: "POST", body: JSON.stringify(assignment) }),
  saveVoiceScript: (projectId: string, document: VoiceScriptDocument) => request<VoiceScriptDocument>(`/api/projects/${projectId}/voice-script`, { method: "PUT", body: JSON.stringify(document) }),
  readVoiceScript: (projectId: string, payload: { rows: Array<{ id: string; voiceId: string; text: string; settings?: import("../domain/types").ScriptSettings }>; parameters: Record<string, Record<string, TrainingParameterValue>>; gapSeconds?: number; forceRegenerate?: boolean }) =>
    request<VoiceScriptJob>(`/api/projects/${projectId}/voice-script/read`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getVoiceScriptJob: (projectId: string, jobId: string) =>
    request<VoiceScriptJob>(`/api/projects/${projectId}/voice-script/jobs/${jobId}`),
  getVoiceChangers: () => request<TrainingModelOption[]>("/api/voice-changers"),
  getVoiceChangerPreflight: () => request<VoiceChangerPreflight>("/api/voice-changer/preflight"),
  startVoiceChanger: (projectId: string, payload: { engineId: string; voiceId: string | null; inputDevice: number; virtualDevice: number | null; speakerDevice: number | null; inputDeviceName?: string | null; virtualDeviceName?: string | null; speakerDeviceName?: string | null; hostApi?: string | null; monitor: boolean; parameters: Record<string, TrainingParameterValue> }) =>
    request<VoiceChangerStatus>(`/api/projects/${projectId}/voice-changer/start`, { method: "POST", body: JSON.stringify(payload) }),
  getVoiceChangerStatus: () => request<VoiceChangerStatus>("/api/voice-changer/status"),
  stopVoiceChanger: () => request<{ status: VoiceChangerStatus; recording: VoiceChangerRecording | null }>("/api/voice-changer/stop", { method: "POST" }),
  startChangerRecording: (projectId: string) => request<VoiceChangerStatus>(`/api/projects/${projectId}/voice-changer/record/start`, { method: "POST" }),
  stopChangerRecording: (projectId: string) => request<VoiceChangerRecording>(`/api/projects/${projectId}/voice-changer/record/stop`, { method: "POST" }),
  listChangerRecordings: (projectId: string) => request<VoiceChangerRecording[]>(`/api/projects/${projectId}/voice-changer/recordings`),
  deleteChangerRecording: (projectId: string, recordingId: string) =>
    request<void>(`/api/projects/${projectId}/voice-changer/recordings/${recordingId}`, { method: "DELETE" }),
  listProjectVoices: (projectId: string) => request<ProjectVoice[]>(`/api/projects/${projectId}/voices`),
  listVoiceModelSets: (projectId: string) => request<VoiceModelSet[]>(`/api/projects/${projectId}/voice-model-sets`),
  getVoiceModelSet: (projectId: string, setId: string) =>
    request<VoiceModelSet>(`/api/projects/${projectId}/voice-model-sets/${setId}`),
  listSpeakerEmbedders: () => request<SpeakerEmbedderInfo[]>("/api/speaker-embedders"),
  evaluateVoiceModelSet: (
    projectId: string,
    setId: string,
    payload: { embedderId?: string; outputIdsByVoiceId: Record<string, string> },
  ) => request<VoiceModelSet>(`/api/projects/${projectId}/voice-model-sets/${setId}/gate`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  generateWithVoice: (projectId: string, voiceId: string, payload: { text: string; generatorId: string; parameters: Record<string, TrainingParameterValue>; duration?: number | null }) =>
    request<VoiceOutput>(`/api/projects/${projectId}/voices/${voiceId}/generate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTrainingCatalog: (projectId: string) =>
    request<TrainingCatalog>(`/api/projects/${projectId}/training-catalog`),
  saveTrainingCatalog: (projectId: string, catalog: TrainingCatalog) =>
    request<TrainingCatalog>(`/api/projects/${projectId}/training-catalog`, {
      method: "PUT",
      body: JSON.stringify(catalog),
    }),
  importAudio: async (file: File, origin: "record" | "import", realtimeText = "") => {
    const body = new FormData();
    body.append("file", file);
    body.append("origin", origin);
    body.append("realtime_text", realtimeText);
    const result = await request<StudioJobResult>("/api/studio/audio/import", { method: "POST", body });
    return { ...result, item: normalizeStudioItem(result.item) };
  },
  transcribeAudio: async (sourceId: string, realtimeText = "", knownText = "") => {
    const result = await request<StudioJobResult>("/api/studio/transcribe", {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId, realtime_text: realtimeText, known_text: knownText, contextual: true }),
    });
    return { ...result, item: normalizeStudioItem(result.item) };
  },
};
