import type {
  AppPreferences,
  EmotionLabel,
  EngineProfileSchema,
  EngineStatus,
  MediaRevisionSource,
  Project,
  ProjectCreate,
  ProjectMediaAsset,
  ProjectMediaImportResult,
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
  return response.json() as Promise<T>;
}

function normalizeWord(word: StudioWord & Record<string, unknown>): StudioWord {
  return {
    ...word,
    reviewState: word.reviewState ?? word.review_state as StudioWord["reviewState"],
    selectedVariant: word.selectedVariant ?? word.selected_variant as StudioWord["selectedVariant"],
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
    aiReviewStatus: asset.aiReviewStatus ?? "skipped",
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
  listProjectMedia: async (projectId: string) => {
    const assets = await request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media`);
    return assets.map(normalizeMediaAsset);
  },
  importProjectMedia: async (
    projectId: string,
    file: File,
    origin: "record" | "import",
    realtimeText = "",
    transcribe = false,
    queueForTranscription = false,
  ) => {
    const body = new FormData();
    body.append("file", file);
    body.append("origin", origin);
    body.append("realtime_text", realtimeText);
    body.append("transcribe", String(transcribe));
    body.append("queue_for_transcription", String(queueForTranscription));
    const result = await request<ProjectMediaImportResult>(`/api/projects/${projectId}/media/import`, { method: "POST", body });
    return {
      ...result,
      asset: normalizeMediaAsset(result.asset),
      item: result.item ? normalizeStudioItem(result.item) : null,
    };
  },
  updateMediaScript: async (projectId: string, assetId: string, text: string, source: MediaRevisionSource, words?: StudioWord[]) => {
    const asset = await request<ProjectMediaAsset>(`/api/projects/${projectId}/media/${assetId}/script`, {
      method: "PATCH",
      body: JSON.stringify({ text, source, words }),
    });
    return normalizeMediaAsset(asset);
  },
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
  enqueueMediaTranscriptions: async (projectId: string, assetIds: string[]) => {
    const assets = await request<ProjectMediaAsset[]>(`/api/projects/${projectId}/media/transcriptions`, {
      method: "POST",
      body: JSON.stringify({ assetIds }),
    });
    return assets.map(normalizeMediaAsset);
  },
  removeProjectMedia: (projectId: string, assetId: string) =>
    request<void>(`/api/projects/${projectId}/media/${assetId}`, { method: "DELETE" }),
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
