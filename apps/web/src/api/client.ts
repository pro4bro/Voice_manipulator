import type {
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
  Project,
  ProjectCreate,
  ProjectMediaAsset,
  ProjectMediaImportResult,
  ReadingAudienceVocabulary,
  ReadingPack,
  ReadingPackSummary,
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
  TrainingRun,
  WorkspacePage,
} from "../domain/types";

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


async function downloadSrt(path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(path);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Không thể xuất SRT (${response.status})`);
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
    words: (item.words ?? []).map((word) => normalizeWord(word as StudioWord & Record<string, unknown>)),
  };
}

function normalizeMediaAsset(asset: ProjectMediaAsset): ProjectMediaAsset {
  return {
    ...asset,
    transcriptionStatus: asset.transcriptionStatus ?? "complete",
    transcriptionSelected: asset.transcriptionSelected ?? false,
    transcriptionProgress: asset.transcriptionProgress ?? (asset.transcriptionStatus === "complete" ? 100 : 0),
    transcriptionError: asset.transcriptionError ?? null,
    deletedAt: asset.deletedAt ?? null,
    disabled: asset.disabled ?? false,
    diarizationStatus: asset.diarizationStatus ?? "idle",
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
    words: (asset.words ?? []).map((word) => normalizeWord(word as StudioWord & Record<string, unknown>)),
  };
}

export const api = {
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
  getPreferences: () => request<AppPreferences>("/api/preferences"),
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
  importLocalProjectMedia: async (projectId: string, sourcePath: string, cacheLocal: boolean) => {
    const result = await request<ProjectMediaImportResult>("/api/projects/" + projectId + "/media/import-local", {
      method: "POST",
      body: JSON.stringify({ sourcePath, cacheLocal }),
    });
    return { ...result, asset: normalizeMediaAsset(result.asset), item: result.item ? normalizeStudioItem(result.item) : null };
  },
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
    action: "pause" | "resume" | "stop",
    assetIds?: string[],
  ) => {
    const assets = await request<ProjectMediaAsset[]>(
      `/api/projects/${projectId}/media/transcriptions/control`,
      { method: "POST", body: JSON.stringify({ action, assetIds: assetIds ?? null }) },
    );
    return assets.map(normalizeMediaAsset);
  },
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
  updateMediaTimelineEdits: async (projectId: string, assetId: string, removedRanges: TimelineEditRange[], gainKeyframes: TimelineGainKeyframe[] = []) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/timeline-edits`, {
      method: "PATCH",
      body: JSON.stringify({ removedRanges, gainKeyframes }),
    });
    return normalizeMediaAsset(asset);
  },
  setMediaTrainingSelected: async (projectId: string, assetId: string, selected: boolean) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/training-selection`, {
      method: "PATCH",
      body: JSON.stringify({ selected }),
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
  revealMediaFile: (projectId: string, assetId: string) =>
    request<void>(`/api/projects/${projectId}/media/${assetId}/reveal`, { method: "POST" }),
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
  listReadingPacks: () => request<ReadingPackSummary[]>("/api/reading-packs"),
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
  getGpuLease: () => request<GpuLeaseHolder | null>("/api/gpu-lease"),
  getTrainingRuntime: () => request<TrainingRuntimeReport>("/api/training-runtime"),
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
  generateVoice: async (payload: { text: string; voiceId: string; speed: number; emotion: string; preview?: boolean }) => {
    const result = await request<StudioJobResult>("/api/studio/generate", {
      method: "POST",
      body: JSON.stringify({
        text: payload.text,
        voice_id: payload.voiceId,
        speed: payload.speed,
        emotion: payload.emotion,
        quality: payload.preview ? "quick" : "studio",
        preview: Boolean(payload.preview),
      }),
    });
    return { ...result, item: normalizeStudioItem(result.item) };
  },
};
