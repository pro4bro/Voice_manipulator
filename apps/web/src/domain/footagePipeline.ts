import type { DatasetReadiness, ProjectMediaAsset } from "./types";

/**
 * Where each footage stands in data preparation, derived from what the asset
 * already records. Nothing here is stored: a status kept in a second place is a
 * status that drifts from the first.
 */

export type PipelineStageId =
  | "footage"
  | "transcript"
  | "diarization"
  | "single-speaker"
  | "multi-speaker"
  | "assigned"
  | "training-selected"
  | "in-dataset";

export interface FootageProgress {
  asset: ProjectMediaAsset;
  transcript: boolean;
  diarization: boolean;
  /** Distinct voices diarization (or a manual row move) found. */
  voices: number;
  assigned: boolean;
  trainingSelected: boolean;
  /** Selected for training and not rejected by the compiler. Unknown without readiness. */
  inDataset: boolean;
}

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  detail: string;
  done: FootageProgress[];
  /** The footage this stage is still waiting on. */
  waiting: FootageProgress[];
}

/** Footage the pipeline counts: in the pool, switched on, and with audio. */
export function countsForPipeline(asset: ProjectMediaAsset) {
  return !asset.deletedAt && !asset.disabled && asset.status !== "no-audio" && asset.transcriptionStatus !== "not-applicable";
}

function voiceLabels(asset: ProjectMediaAsset) {
  const labels = new Set<string>();
  for (const word of asset.words ?? []) {
    const label = word.manualDiarizationSpeakerId || word.diarizationSpeakerId;
    if (label) labels.add(label);
  }
  return labels;
}

export function footageProgress(asset: ProjectMediaAsset, readiness: DatasetReadiness | null = null): FootageProgress {
  const transcript = asset.transcriptionStatus === "complete" && (asset.words?.length ?? 0) > 0;
  const diarization = asset.diarizationStatus === "complete";
  const labels = voiceLabels(asset);
  const assignments = asset.diarizationSpeakerAssignments ?? {};
  const mapped = [...labels].filter((label) => label in assignments);
  let assigned: boolean;
  if (labels.size > 1) {
    // Every voice has been decided, and at least one of them is somebody.
    // A voice mapped to nobody is a decision too: its turns leave the dataset.
    assigned = mapped.length === labels.size && mapped.some((label) => assignments[label]);
  } else {
    assigned = asset.speakerProfileIds.length > 0 || mapped.some((label) => assignments[label]);
  }
  const rejected = new Set((readiness?.rejections ?? []).map((item) => item.assetId));
  return {
    asset,
    transcript,
    diarization,
    voices: labels.size,
    assigned,
    trainingSelected: asset.trainingSelected,
    inDataset: Boolean(readiness) && asset.trainingSelected && !rejected.has(asset.id),
  };
}

/** The data-preparation steps a footage has not finished, in pipeline order. */
export function missingPreparation(asset: ProjectMediaAsset): string[] {
  if (!countsForPipeline(asset)) return [];
  const progress = footageProgress(asset);
  return [
    progress.transcript ? null : "Speech to Text",
    progress.diarization ? null : "Nhận diện speaker",
    progress.assigned ? null : "Gán Speaker Profile",
  ].filter((step): step is string => Boolean(step));
}

export function pipelineStages(assets: ProjectMediaAsset[], readiness: DatasetReadiness | null): PipelineStage[] {
  const all = assets.filter(countsForPipeline).map((asset) => footageProgress(asset, readiness));
  const split = (id: PipelineStageId, label: string, detail: string, test: (item: FootageProgress) => boolean, among = all): PipelineStage => ({
    id,
    label,
    detail,
    done: among.filter(test),
    waiting: among.filter((item) => !test(item)),
  });
  const diarized = all.filter((item) => item.diarization);
  return [
    split("footage", "Footage", "Đã import vào Media Pool", () => true),
    split("transcript", "Speech to Text", "Có transcript và word timing", (item) => item.transcript),
    split("diarization", "Nhận diện speaker", "Đã chạy diarization", (item) => item.diarization),
    split("single-speaker", "1 speaker", "Diarization thấy một giọng", (item) => item.voices <= 1, diarized),
    split("multi-speaker", "Nhiều speaker", "Tách theo lượt nói, bỏ đoạn chồng tiếng", (item) => item.voices > 1, diarized),
    split("assigned", "Gán Speaker Profile", "Mọi giọng đã được gán hoặc bỏ", (item) => item.assigned),
    split("training-selected", "Chọn để train", "Đã tick TRAIN trong Media Pool", (item) => item.trainingSelected),
    split("in-dataset", "Vào dataset", "Compiler cắt được đoạn dùng được", (item) => item.inDataset),
  ];
}

/** "40%-20": share of all counted footage, then the count itself. */
export function stageBadge(done: number, total: number) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return `${percent}%-${done}`;
}
