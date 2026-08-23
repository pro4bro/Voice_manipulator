import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectMediaAsset } from "../../domain/types";
import { MediaPool } from "./MediaPool";

const asset: ProjectMediaAsset = {
  id: "asset-1",
  name: "interview.mov",
  sourceExtension: ".mov",
  mediaKind: "video",
  sourcePath: "assets/media/asset-1/source.mov",
  studioItemId: "studio/interview.wav",
  url: "/api/studio/media/studio/interview.wav",
  duration: 42,
  sampleRate: 24000,
  text: "Xin chào",
  words: [],
  origin: "import",
  transcriptionStatus: "complete",
  trainingSelected: false,
  speakerProfileIds: [],
  emotion: "normal",
  createdAt: "2026-08-23T00:00:00Z",
  updatedAt: "2026-08-23T00:00:00Z",
  revisions: [{ id: "rev-1", source: "stt", text: "Xin chào", createdAt: "2026-08-23T00:00:00Z" }],
};

describe("MediaPool", () => {
  it("imports common media formats and selects an asset with its own history", () => {
    const onSelect = vi.fn();
    render(<MediaPool assets={[asset]} busy={false} onImport={vi.fn()} onSelect={onSelect} onSendToTraining={vi.fn()} onToggleTraining={vi.fn()} onUpdateAnnotations={vi.fn()} selectedAssetId={null} speakers={[]} workflow="speech-to-text" />);

    const input = screen.getByLabelText("Import media") as HTMLInputElement;
    expect(input.accept).toContain(".mov");
    expect(input.accept).toContain(".mkv");
    expect(input.accept).toContain(".wav");
    expect(screen.getByText(/1 revision/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /interview.mov/ }));
    expect(onSelect).toHaveBeenCalledWith("asset-1");
  });

  it("reviews multiple imports and can skip transcription per footage", () => {
    const onImport = vi.fn();
    render(<MediaPool assets={[]} busy={false} onImport={onImport} onSelect={vi.fn()} onSendToTraining={vi.fn()} onToggleTraining={vi.fn()} onUpdateAnnotations={vi.fn()} selectedAssetId={null} speakers={[]} workflow="speech-to-text" />);
    const files = [
      new File(["audio"], "needs-stt.wav", { type: "audio/wav" }),
      new File(["video"], "known-script.mov", { type: "video/quicktime" }),
    ];

    fireEvent.change(screen.getByLabelText("Import media"), { target: { files } });
    fireEvent.click(screen.getByLabelText("Tạo transcript cho known-script.mov"));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 file" }));

    expect(onImport).toHaveBeenCalledWith([
      { file: files[0], transcribe: true },
      { file: files[1], transcribe: false },
    ]);
  });

  it("selects only chosen footage for Voice Training", () => {
    const onToggleTraining = vi.fn();
    render(<MediaPool assets={[asset]} busy={false} onImport={vi.fn()} onSelect={vi.fn()} onSendToTraining={vi.fn()} onToggleTraining={onToggleTraining} onUpdateAnnotations={vi.fn()} selectedAssetId={null} speakers={[]} workflow="speech-to-text" />);

    fireEvent.click(screen.getByLabelText("Dùng interview.mov cho Voice Training"));

    expect(onToggleTraining).toHaveBeenCalledWith("asset-1", true);
  });

  it("assigns a speaker and emotion to the selected footage", () => {
    const onUpdateAnnotations = vi.fn();
    const speaker = { id: "speaker-1", name: "Anh Vũ", language: "Tiếng Việt", region: "Miền Nam", age: 35, gender: "male" as const, color: "#ff6745", createdAt: "2026-08-23T00:00:00Z" };
    render(<MediaPool assets={[asset]} busy={false} onImport={vi.fn()} onSelect={vi.fn()} onSendToTraining={vi.fn()} onToggleTraining={vi.fn()} onUpdateAnnotations={onUpdateAnnotations} selectedAssetId="asset-1" speakers={[speaker]} workflow="speech-to-text" />);

    fireEvent.click(screen.getByLabelText("Gán Anh Vũ cho interview.mov"));
    fireEvent.change(screen.getByLabelText("Cảm xúc của footage"), { target: { value: "exciting" } });

    expect(onUpdateAnnotations).toHaveBeenNthCalledWith(1, "asset-1", ["speaker-1"], "normal");
    expect(onUpdateAnnotations).toHaveBeenNthCalledWith(2, "asset-1", [], "exciting");
  });
});
