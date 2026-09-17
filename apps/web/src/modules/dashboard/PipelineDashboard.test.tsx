import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PipelineDashboard } from "./PipelineDashboard";
import type { ProjectMediaAsset, SpeakerProfile, StudioWord, TrainingRun } from "../../domain/types";

function words(...labels: string[]): StudioWord[] {
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

const AN: SpeakerProfile = { id: "p1", name: "An", language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#888", createdAt: "" };

describe("PipelineDashboard", () => {
  it("puts a percent-and-count badge on every stage of the flow", () => {
    const assets = [
      asset("solo", { words: words("speaker-1"), diarizationStatus: "complete", speakerProfileIds: ["p1"] }),
      asset("pair", { words: words("speaker-1", "speaker-2"), diarizationStatus: "complete" }),
      asset("raw", { transcriptionStatus: "queued" }),
      asset("fresh"),
    ];
    render(<PipelineDashboard assets={assets} readiness={null} runs={[]} speakers={[AN]} />);

    expect(screen.getByRole("status", { name: "Footage: 100% · 4" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Nhận diện speaker: 50% · 2" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "1 speaker: 25% · 1" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Nhiều speaker: 25% · 1" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Gán Speaker Profile: 25% · 1" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Voice đã train: 0% · 0" })).toBeInTheDocument();
  });

  it("lists the footage a stage is waiting on and selects it when clicked", () => {
    const onSelectAsset = vi.fn();
    render(<PipelineDashboard assets={[asset("raw", { transcriptionStatus: "queued" })]} onSelectAsset={onSelectAsset} readiness={null} runs={[]} speakers={[]} />);

    fireEvent.click(screen.getAllByText("Còn 1 footage")[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "raw.mp4" })[0]);
    expect(onSelectAsset).toHaveBeenCalledWith("raw");
  });

  it("counts a voice as trained per Speaker Profile with a complete run", () => {
    const done = { id: "r", speakerProfileId: "p1", status: "complete" } as TrainingRun;
    render(<PipelineDashboard assets={[asset("solo")]} readiness={null} runs={[done]} speakers={[AN, { ...AN, id: "p2", name: "Bình" }]} />);

    expect(screen.getByRole("status", { name: "Voice đã train: 50% · 1" })).toBeInTheDocument();
  });

  it("says there is nothing to count rather than drawing an empty flow", () => {
    render(<PipelineDashboard assets={[]} readiness={null} runs={[]} speakers={[]} />);

    expect(screen.getByText("Chưa có footage nào để thống kê")).toBeInTheDocument();
  });
});
