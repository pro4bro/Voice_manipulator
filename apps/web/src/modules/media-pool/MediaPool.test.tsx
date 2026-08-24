import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectMediaAsset, SpeakerProfile } from "../../domain/types";
import { MediaPool } from "./MediaPool";

const asset: ProjectMediaAsset = {
  id: "asset-1", name: "interview.mov", sourceExtension: ".mov", mediaKind: "video", sourcePath: "assets/media/asset-1/source.mov",
  studioItemId: "studio/interview.wav", url: "/api/studio/media/studio/interview.wav", duration: 42, sampleRate: 24000, text: "Xin chào", words: [], origin: "import",
  transcriptionStatus: "complete", transcriptionSelected: false, transcriptionError: null, aiReviewStatus: "skipped", trainingSelected: false, speakerProfileIds: [], environmentProfileIds: [], emotion: "normal",
  createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", revisions: [{ id: "rev-1", source: "stt", text: "Xin chào", createdAt: "2026-08-23T00:00:00Z" }],
};

function props(overrides = {}) {
  return {
    assets: [asset], busy: false, environments: [], onImport: vi.fn(), onSelect: vi.fn(), onSendToTraining: vi.fn(),
    onToggleTraining: vi.fn(), onToggleTranscription: vi.fn(), onQueueTranscriptions: vi.fn(), onRemove: vi.fn(), onUpdateAnnotations: vi.fn(),
    selectedAssetId: null, speakers: [], workflow: "speech-to-text" as const, ...overrides,
  };
}

describe("MediaPool", () => {
  it("imports common media formats and selects an asset with its own history", () => {
    const onSelect = vi.fn();
    render(<MediaPool {...props({ onSelect })} />);
    const input = screen.getByLabelText("Import media") as HTMLInputElement;
    expect(input.accept).toContain(".mov"); expect(input.accept).toContain(".mkv"); expect(input.accept).toContain(".wav");
    expect(screen.getByText(/1 REV/)).toBeInTheDocument();
    expect(screen.getByText(/NORMAL · CHƯA GÁN SPEAKER/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /interview.mov/ }));
    expect(onSelect).toHaveBeenCalledWith("asset-1");
  });

  it("reviews multiple imports and can skip transcription per footage", () => {
    const onImport = vi.fn();
    render(<MediaPool {...props({ assets: [], onImport })} />);
    const files = [new File(["audio"], "needs-stt.wav", { type: "audio/wav" }), new File(["video"], "known-script.mov", { type: "video/quicktime" })];
    fireEvent.change(screen.getByLabelText("Import media"), { target: { files } });
    fireEvent.click(screen.getByLabelText("Đánh dấu STT cho known-script.mov"));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 file" }));
    expect(onImport).toHaveBeenCalledWith([{ file: files[0], transcribe: true }, { file: files[1], transcribe: false }]);
  });

  it("selects only chosen footage for Voice Training", () => {
    const onToggleTraining = vi.fn();
    render(<MediaPool {...props({ onToggleTraining })} />);
    fireEvent.click(screen.getByLabelText("Dùng interview.mov cho Voice Training"));
    expect(onToggleTraining).toHaveBeenCalledWith("asset-1", true);
  });

  it("assigns speaker, environment, and emotion tags from the footage right-click menu", () => {
    const onUpdateAnnotations = vi.fn();
    const speaker: SpeakerProfile = { id: "speaker-1", name: "Anh Vũ", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: "middle-aged", gender: "male", attributes: {}, color: "#ff6745", createdAt: "2026-08-23T00:00:00Z" };
    render(<MediaPool {...props({ selectedAssetId: "asset-1", speakers: [speaker], onUpdateAnnotations })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }), { clientX: 100, clientY: 100 });
    expect(screen.getByRole("menu", { name: "Gán profile cho interview.mov" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Anh Vũ" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Exciting" }));
    expect(onUpdateAnnotations).toHaveBeenNthCalledWith(1, "asset-1", ["speaker-1"], [], "normal");
    expect(onUpdateAnnotations).toHaveBeenNthCalledWith(2, "asset-1", [], [], "exciting");
  });
});
