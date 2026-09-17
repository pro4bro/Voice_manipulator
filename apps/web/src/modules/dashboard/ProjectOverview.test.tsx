import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectOverview } from "./ProjectOverview";
import { projectOverview } from "../../domain/projectOverview";
import type { DatasetReadiness, SpeakerProfile, TrainingModelOption, TrainingRun, TrainingSettings } from "../../domain/types";

const AN: SpeakerProfile = { id: "speaker-an", name: "Anh Vũ", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#f00", createdAt: "" };
const KHOA: SpeakerProfile = { ...AN, id: "speaker-khoa", name: "Khoa Trịnh" };

const SETTINGS = { targetSpeakerIds: [], maxSteps: 5000, checkpointEvery: 1000, batchSize: 4, learningRate: 1e-4, denoiseBeforeTraining: false, learnEnvironmentNoise: false, environmentProfileId: null, modelId: "omnivoice-lora" } as TrainingSettings;

const MODEL = {
  id: "omnivoice-lora", label: "OmniVoice · LoRA fine-tune",
  parameters: [{ key: "instruct_ratio", label: "Instruct ratio", kind: "float", default: 0 }],
} as unknown as TrainingModelOption;

const READINESS = {
  selectedAssets: 2, readyAssets: 1, segments: 148, totalSeconds: 1005, speakerProfileIds: ["speaker-an"],
  segmentsByTier: {}, secondsByEmotion: { normal: 905, happy: 100 }, secondsBySpeaker: { "speaker-an": 1005 },
  rejections: [{ assetId: "asset-2", assetName: "phong-van.mp4", reason: "unassigned-speaker", detail: "" }], scriptValidations: [],
  files: [
    { assetId: "asset-1", name: "CONVICTION_voiceover.wav", extension: "wav", mediaKind: "audio", audioCodec: "pcm_s16le", sampleRate: 24000, duration: 1102.5, bytes: 211_789_008, origin: "import", trainingSelected: true, transcriptionStatus: "complete", speakerProfileIds: ["speaker-an"], emotion: "normal", segments: 148, secondsBySpeaker: { "speaker-an": 1005 }, secondsByEmotion: { normal: 905, happy: 100 }, rejection: null },
    { assetId: "asset-2", name: "phong-van.mp4", extension: "mp4", mediaKind: "video", audioCodec: "aac", sampleRate: 48000, duration: 600, bytes: 90_000_000, origin: "import", trainingSelected: true, transcriptionStatus: "complete", speakerProfileIds: [], emotion: "normal", segments: 0, secondsBySpeaker: {}, secondsByEmotion: {}, rejection: "unassigned-speaker" },
  ],
} as DatasetReadiness;

function run(overrides: Partial<TrainingRun>): TrainingRun {
  return {
    version: 1, id: "run", projectId: "p", manifestId: "d", status: "complete", stepId: "publish", globalStep: 550,
    emotion: "normal", speakerProfileId: "speaker-an", checkpoints: [], error: null, createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:10:00Z", config: { steps: 550, saveSteps: 1000, learningRate: 1e-4, loraR: 16 }, ...overrides,
  } as TrainingRun;
}

const RUNS = [
  run({ id: "r1", status: "complete", createdAt: "2026-09-16T01:00:00Z" }),
  run({ id: "r2", status: "failed", createdAt: "2026-09-16T02:00:00Z", error: "CUDA out of memory" }),
  run({ id: "r3", status: "complete", createdAt: "2026-09-16T03:00:00Z" }),
  run({ id: "r4", status: "cancelled", createdAt: "2026-09-15T01:00:00Z" }),
];

describe("project overview", () => {
  it("counts files, their size and length, and what each voice has", () => {
    const data = projectOverview([], READINESS, [AN, KHOA], RUNS, MODEL, SETTINGS);

    expect(data.files).toHaveLength(2);
    expect(data.totalBytes).toBe(301_789_008);
    expect(Math.round(data.totalSeconds)).toBe(1703);
    expect(data.profiles.map((profile) => [profile.speaker.name, profile.seconds, profile.files, profile.runs])).toEqual([
      ["Anh Vũ", 1005, 1, 4],
      ["Khoa Trịnh", 0, 0, 0],
    ]);
    expect(data.profiles[0].latest?.id).toBe("r3");
  });

  it("measures errors against what finished, and dataset losses against what was selected", () => {
    const { training } = projectOverview([], READINESS, [AN, KHOA], RUNS, MODEL, SETTINGS);

    expect([training.runs, training.complete, training.failed, training.cancelled]).toEqual([4, 2, 1, 1]);
    expect(training.failureRate).toBeCloseTo(1 / 3);
    expect([training.trainedVoices, training.voicesWithData]).toEqual([1, 1]);
    expect([training.rejectedFiles, training.selectedFiles]).toEqual([1, 2]);
  });

  it("says emotion training is off unless the chosen model trains with emotion instructions", () => {
    expect(projectOverview([], READINESS, [AN], [], MODEL, SETTINGS).emotion.enabled).toBe(false);

    const on = { ...SETTINGS, modelParameters: { "omnivoice-lora": { instruct_ratio: 0.3 } } };
    const emotion = projectOverview([], READINESS, [AN], [], MODEL, on).emotion;
    expect([emotion.enabled, emotion.ratio]).toEqual([true, 0.3]);
    expect(emotion.emotions.map((item) => item.emotion)).toEqual(["normal", "happy"]);
  });

  it("lists every file with its format, size, length and voices, and opens one", () => {
    const onSelectAsset = vi.fn();
    render(<ProjectOverview assets={[]} model={MODEL} onSelectAsset={onSelectAsset} readiness={READINESS} runs={RUNS} settings={SETTINGS} speakers={[AN, KHOA]} />);

    const files = screen.getByRole("region", { name: "Các file đã import" });
    expect(within(files).getByText(/WAV · pcm_s16le · 24 kHz · 202 MB · 18:23/)).toBeInTheDocument();
    expect(within(files).getByText(/1 profile: Anh Vũ · 16m 45s vào dataset/)).toBeInTheDocument();
    expect(within(files).getByText(/Bị loại khỏi dataset: chưa gán người nói/)).toBeInTheDocument();
    fireEvent.click(within(files).getByRole("button", { name: "phong-van.mp4" }));
    expect(onSelectAsset).toHaveBeenCalledWith("asset-2");

    const training = screen.getByRole("region", { name: "Tình trạng training" });
    expect(within(training).getByText(/tỷ lệ lỗi 33%/)).toBeInTheDocument();
    expect(within(training).getByText("1/2")).toBeInTheDocument();
  });
});
