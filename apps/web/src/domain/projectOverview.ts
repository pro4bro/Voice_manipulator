import { runFraction } from "./trainingBatch";
import type { DatasetFileSummary, DatasetReadiness, ProjectMediaAsset, SpeakerProfile, TrainingModelOption, TrainingRun, TrainingSettings } from "./types";

/**
 * The project in numbers, for the Dashboard's right column.
 *
 * Everything here is read from what the page already holds - footage, the
 * dataset readiness (which carries a summary per file), training runs and the
 * training settings - so the numbers agree with Voice Training and Media Pool.
 */

export interface ProfileOverview {
  speaker: SpeakerProfile;
  /** Seconds of this voice that reach the dataset. */
  seconds: number;
  /** Files this profile is assigned to. */
  files: number;
  runs: number;
  latest: TrainingRun | null;
  /** 0..1 progress of the latest run. */
  progress: number;
}

export interface EmotionOverview {
  /** Whether the chosen training model conditions on emotion at all. */
  enabled: boolean;
  /** The share of samples trained with their emotion instruction, when the model has the knob. */
  ratio: number | null;
  modelLabel: string | null;
  /** Emotions with audio in the dataset, longest first. */
  emotions: { emotion: string; seconds: number }[];
}

export interface TrainingOverview {
  runs: number;
  complete: number;
  failed: number;
  cancelled: number;
  running: number;
  /** Failed out of those that finished one way or the other. */
  failureRate: number;
  /** Voices with a complete run out of voices that have data. */
  trainedVoices: number;
  voicesWithData: number;
  /** Footage rejected by the dataset compiler out of footage selected for training. */
  rejectedFiles: number;
  selectedFiles: number;
  sttErrors: number;
}

export interface ProjectOverviewData {
  files: DatasetFileSummary[];
  totalBytes: number;
  totalSeconds: number;
  profiles: ProfileOverview[];
  emotion: EmotionOverview;
  training: TrainingOverview;
}

export function projectOverview(
  assets: ProjectMediaAsset[],
  readiness: DatasetReadiness | null,
  speakers: SpeakerProfile[],
  runs: TrainingRun[],
  model: TrainingModelOption | null,
  settings: TrainingSettings,
): ProjectOverviewData {
  const files = readiness?.files ?? assets
    .filter((asset) => !asset.deletedAt && asset.origin !== "generate")
    .map(fileFromAsset);
  const bySpeaker = readiness?.secondsBySpeaker ?? {};

  const profiles = speakers.map((speaker) => {
    const mine = runs
      .filter((run) => run.speakerProfileId === speaker.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latest = mine[0] ?? null;
    return {
      speaker,
      seconds: bySpeaker[speaker.id] ?? 0,
      files: files.filter((file) => file.speakerProfileIds.includes(speaker.id)).length,
      runs: mine.length,
      latest,
      progress: latest ? runFraction(latest) : 0,
    };
  });

  const ratioSpec = model?.parameters.find((spec) => spec.key === "instruct_ratio");
  const override = model ? settings.modelParameters?.[model.id]?.instruct_ratio : undefined;
  const ratioValue = ratioSpec ? Number(override ?? ratioSpec.default ?? 0) : null;
  const emotions = Object.entries(readiness?.secondsByEmotion ?? {})
    .map(([emotion, seconds]) => ({ emotion, seconds }))
    .filter((item) => item.seconds > 0)
    .sort((left, right) => right.seconds - left.seconds);

  const finished = runs.filter((run) => run.status === "complete" || run.status === "failed");
  const failed = runs.filter((run) => run.status === "failed").length;
  const voicesWithData = profiles.filter((profile) => profile.seconds > 0).length;

  return {
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    totalSeconds: files.reduce((sum, file) => sum + file.duration, 0),
    profiles,
    emotion: {
      enabled: Boolean(ratioValue && ratioValue > 0),
      ratio: ratioValue,
      modelLabel: model?.label ?? null,
      emotions,
    },
    training: {
      runs: runs.length,
      complete: runs.filter((run) => run.status === "complete").length,
      failed,
      cancelled: runs.filter((run) => run.status === "cancelled" || run.status === "interrupted").length,
      running: runs.filter((run) => run.status === "running" || run.status === "pending").length,
      failureRate: finished.length ? failed / finished.length : 0,
      trainedVoices: profiles.filter((profile) => profile.seconds > 0 && runs.some((run) => run.speakerProfileId === profile.speaker.id && run.status === "complete")).length,
      voicesWithData,
      rejectedFiles: readiness?.rejections.length ?? 0,
      selectedFiles: readiness?.selectedAssets ?? files.filter((file) => file.trainingSelected).length,
      sttErrors: assets.filter((asset) => !asset.deletedAt && asset.transcriptionStatus === "error").length,
    },
  };
}

/** Before readiness arrives: what the footage itself says, without dataset numbers. */
function fileFromAsset(asset: ProjectMediaAsset): DatasetFileSummary {
  return {
    assetId: asset.id,
    name: asset.name,
    extension: asset.sourceExtension.replace(/^\./, "").toLowerCase(),
    mediaKind: asset.mediaKind,
    audioCodec: asset.audioCodec ?? null,
    sampleRate: asset.sampleRate,
    duration: asset.duration,
    bytes: 0,
    origin: asset.origin,
    trainingSelected: asset.trainingSelected,
    transcriptionStatus: asset.transcriptionStatus,
    speakerProfileIds: asset.speakerProfileIds,
    emotion: asset.emotion,
    segments: 0,
    secondsBySpeaker: {},
    secondsByEmotion: {},
    rejection: null,
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = String(safe % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
