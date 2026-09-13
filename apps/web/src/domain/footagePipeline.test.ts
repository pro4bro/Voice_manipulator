import { describe, expect, it } from "vitest";

import { missingPreparation, pipelineStages, stageBadge } from "./footagePipeline";
import type { DatasetReadiness, ProjectMediaAsset, StudioWord } from "./types";

function words(...labels: Array<string | null>): StudioWord[] {
  return labels.map((label, index) => ({ text: `w${index}`, start: index, end: index + 0.5, diarizationSpeakerId: label }));
}

function asset(id: string, overrides: Partial<ProjectMediaAsset> = {}): ProjectMediaAsset {
  return {
    id, name: `${id}.mp4`, sourceExtension: ".mp4", mediaKind: "video", sourcePath: "", studioItemId: null, url: null,
    duration: 10, sampleRate: 48000, text: "", words: [], origin: "import", status: "ready",
    transcriptionStatus: "complete", transcriptionSelected: false, transcriptionError: null,
    diarizationStatus: "idle", aiReviewStatus: "skipped", trainingSelected: false, captureTier: "import",
    speakerProfileIds: [], environmentProfileIds: [], emotion: "normal", createdAt: "", updatedAt: "", revisions: [],
    ...overrides,
  };
}

describe("footage pipeline", () => {
  it("counts each stage against all footage, the way the Dashboard badge reads", () => {
    const assets = [
      asset("solo", { words: words("speaker-1", "speaker-1"), diarizationStatus: "complete", speakerProfileIds: ["p1"], trainingSelected: true }),
      asset("pair", { words: words("speaker-1", "speaker-2"), diarizationStatus: "complete", diarizationSpeakerAssignments: { "speaker-1": "p1" } }),
      asset("raw", { transcriptionStatus: "queued" }),
      asset("parked", { disabled: true, words: words("speaker-1") }),
    ];
    const readiness = { rejections: [] } as unknown as DatasetReadiness;

    const stages = Object.fromEntries(pipelineStages(assets, readiness).map((stage) => [stage.id, stage.done.length]));

    expect(stages).toEqual({
      footage: 3,
      transcript: 2,
      diarization: 2,
      "single-speaker": 1,
      "multi-speaker": 1,
      assigned: 1,
      "training-selected": 1,
      "in-dataset": 1,
    });
    expect(stageBadge(1, 3)).toBe("33%-1");
    expect(stageBadge(20, 50)).toBe("40%-20");
    expect(stageBadge(0, 0)).toBe("0%-0");
  });

  it("calls a multi-speaker footage assigned only when every voice is decided", () => {
    const partly = asset("a", { words: words("speaker-1", "speaker-2"), diarizationStatus: "complete", diarizationSpeakerAssignments: { "speaker-1": "p1" } });
    const decided = asset("b", { words: words("speaker-1", "speaker-2"), diarizationStatus: "complete", diarizationSpeakerAssignments: { "speaker-1": "p1", "speaker-2": null } });
    const nobody = asset("c", { words: words("speaker-1", "speaker-2"), diarizationStatus: "complete", diarizationSpeakerAssignments: { "speaker-1": null, "speaker-2": null } });

    expect(missingPreparation(partly)).toEqual(["Gán Speaker Profile"]);
    expect(missingPreparation(decided)).toEqual([]);
    expect(missingPreparation(nobody)).toEqual(["Gán Speaker Profile"]);
  });

  it("names what is missing in pipeline order, and says nothing about footage it does not count", () => {
    expect(missingPreparation(asset("new", { transcriptionStatus: "processing" }))).toEqual([
      "Speech to Text",
      "Nhận diện speaker",
      "Gán Speaker Profile",
    ]);
    expect(missingPreparation(asset("silent", { status: "no-audio" }))).toEqual([]);
    expect(missingPreparation(asset("binned", { deletedAt: "2026-09-01T00:00:00Z" }))).toEqual([]);
  });

  it("does not claim a footage reached the dataset before readiness is known or when rejected", () => {
    const chosen = asset("x", { trainingSelected: true });
    const rejected = { rejections: [{ assetId: "x", assetName: "x", reason: "no-usable-segment", detail: "" }] } as unknown as DatasetReadiness;

    const count = (readiness: DatasetReadiness | null) => pipelineStages([chosen], readiness).find((stage) => stage.id === "in-dataset")!.done.length;

    expect(count(null)).toBe(0);
    expect(count(rejected)).toBe(0);
  });
});
