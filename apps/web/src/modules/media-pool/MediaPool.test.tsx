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
    selectedAssetId: null, speakers: [], workflow: "speech-to-text" as const, onControlTranscriptions: vi.fn(), onRestore: vi.fn(), onReveal: vi.fn(), onSetDisabled: vi.fn(), ...overrides,
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

  it("turns Speech to text into Pause and Stop while a batch is running", () => {
    const onControlTranscriptions = vi.fn();
    const running = { ...asset, transcriptionStatus: "processing" as const, transcriptionSelected: true };
    render(<MediaPool {...props({ assets: [running], onControlTranscriptions })} />);
    expect(screen.queryByRole("button", { name: /^Speech to text/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    expect(onControlTranscriptions).toHaveBeenCalledWith("pause");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onControlTranscriptions).toHaveBeenCalledWith("stop");
  });

  it("offers to carry on once the whole queue is held", () => {
    const onControlTranscriptions = vi.fn();
    const held = { ...asset, transcriptionStatus: "paused" as const, transcriptionSelected: true };
    render(<MediaPool {...props({ assets: [held], onControlTranscriptions })} />);
    expect(screen.getByText(/TẠM DỪNG/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Chạy tiếp/ }));
    expect(onControlTranscriptions).toHaveBeenCalledWith("resume");
  });

  it("stops just the footage the user right-clicked", () => {
    const onControlTranscriptions = vi.fn();
    const queued = { ...asset, transcriptionStatus: "queued" as const, transcriptionSelected: true };
    render(<MediaPool {...props({ assets: [queued], onControlTranscriptions })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Stop STT/ }));
    expect(onControlTranscriptions).toHaveBeenCalledWith("stop", ["asset-1"]);
  });

  const recycled = { ...asset, id: "asset-binned", name: "cu.wav", deletedAt: "2026-09-02T00:00:00Z" };

  it("keeps the recycle bin out of sight until something is in it", () => {
    render(<MediaPool {...props()} />);
    expect(screen.queryByRole("button", { name: /RECYCLE BIN/ })).toBeNull();
  });

  it("shows the bin closed, below every footage, and opens it on request", () => {
    const { container } = render(<MediaPool {...props({ assets: [recycled, asset] })} />);
    // Deleted footage is not mixed in with the live list.
    expect(screen.queryByRole("button", { name: /cu.wav/ })).toBeNull();
    const toggle = screen.getByRole("button", { name: /RECYCLE BIN/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Last in the list whatever the import order.
    const list = container.querySelector(".media-pool-list") as HTMLElement;
    expect(list.lastElementChild).toHaveClass("media-recycle-bin");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /cu.wav/ })).toBeInTheDocument();
    expect(container.querySelector(".media-pool-item.is-recycled")).toBeTruthy();
  });

  it("offers restore and a permanent delete on recycled footage only", () => {
    const onRestore = vi.fn();
    const onRemove = vi.fn();
    render(<MediaPool {...props({ assets: [recycled], onRestore, onRemove })} />);
    fireEvent.click(screen.getByRole("button", { name: /RECYCLE BIN/ }));

    // The work toggles are gone: nothing in the bin queues for anything.
    expect(screen.queryByLabelText(/hàng đợi Speech to text/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalledWith(recycled);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onRemove).toHaveBeenCalledWith(recycled);
  });

  it("counts only live footage in the summary", () => {
    const { container } = render(<MediaPool {...props({ assets: [asset, recycled] })} />);
    expect(container.querySelector(".media-pool-summary span")).toHaveTextContent("1 ASSETS");
  });

  it("reveals a footage in the desktop and can park it out of every batch", () => {
    const onReveal = vi.fn();
    const onSetDisabled = vi.fn();
    render(<MediaPool {...props({ onReveal, onSetDisabled })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Reveal in Desktop/ }));
    expect(onReveal).toHaveBeenCalledWith(asset);

    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Disable footage/ }));
    expect(onSetDisabled).toHaveBeenCalledWith(asset, true);
  });

  it("offers to switch a parked footage back on", () => {
    const onSetDisabled = vi.fn();
    const parked = { ...asset, disabled: true };
    const { container } = render(<MediaPool {...props({ assets: [parked], onSetDisabled })} />);
    expect(container.querySelector(".media-pool-item.is-disabled")).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Enable footage/ }));
    expect(onSetDisabled).toHaveBeenCalledWith(parked, false);
  });
});
