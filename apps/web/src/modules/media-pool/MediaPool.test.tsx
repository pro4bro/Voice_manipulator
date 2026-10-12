import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { ObsLiveLinkRecordingJournal, ProjectMediaAsset, SpeakerProfile, TrainingModelOption } from "../../domain/types";
import { MediaPool, sttChoices } from "./MediaPool";
import type { MediaPoolOrganization } from "./media-organization";

const asset: ProjectMediaAsset = {
  id: "asset-1", name: "interview.mov", sourceExtension: ".mov", mediaKind: "video", sourcePath: "assets/media/asset-1/source.mov",
  studioItemId: "studio/interview.wav", url: "/api/studio/media/studio/interview.wav", duration: 42, sampleRate: 24000, text: "Xin chào", words: [], origin: "import",
  transcriptionStatus: "complete", transcriptionSelected: false, transcriptionError: null, aiReviewStatus: "skipped", trainingSelected: false, captureTier: "import", speakerProfileIds: [], environmentProfileIds: [], emotion: "normal",
  createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", revisions: [{ id: "rev-1", source: "stt", text: "Xin chào", createdAt: "2026-08-23T00:00:00Z" }],
};

function props(overrides = {}) {
  return {
    assets: [asset], busy: false, environments: [], onImport: vi.fn(), onSelect: vi.fn(), onSendToTraining: vi.fn(),
    onToggleTraining: vi.fn(), onToggleTranscription: vi.fn(), onQueueTranscriptions: vi.fn(), onRemove: vi.fn(), onBatchAction: vi.fn(), onUpdateAnnotations: vi.fn(),
    selectedAssetId: null, speakers: [], workflow: "speech-to-text" as const, onControlTranscriptions: vi.fn(), onRestore: vi.fn(), onReveal: vi.fn(), onSetDisabled: vi.fn(), ...overrides,
  };
}

describe("MediaPool", () => {
  it("keeps cancelled footage's transcript while showing that STT was stopped", () => {
    render(<MediaPool {...props({ assets: [{ ...asset, transcriptionStatus: "cancelled" }] })} />);
    expect(screen.getByText(/STT ĐÃ HUỶ/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tiến trình Speech to text/)).not.toBeInTheDocument();
  });
  it("offers the same confirmed Stop for detailed OBS STT before archive completion", async () => {
    const live = { protocolVersion: 3, recording: { recordingId: "take-live", projectId: "project", displayName: "OBS take live",
      status: "recording", archiveStatus: "pending", startedMonotonicNs: 0, endedMonotonicNs: null,
      pauseCauses: [], videoSpanIds: [], channelIntervals: [] }, durableChannelIds: ["mic"],
      detailedStt: { tracks: { mic: { initialFrames: 24000, cursor: 0 } }, active: true },
    } as ObsLiveLinkRecordingJournal;
    const list = vi.spyOn(api, "listObsLiveLinkRecordings").mockResolvedValue([live]);
    const stop = vi.spyOn(api, "stopObsLiveLinkDetailedStt").mockResolvedValueOnce({
      ...live.detailedStt, stopMode: "queue", active: true,
    }).mockResolvedValue({ ...live.detailedStt, stopMode: "all", active: false });
    try {
      render(<MediaPool {...props({ assets: [], projectId: "project" })} />);
      fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
      await waitFor(() => expect(stop).toHaveBeenCalledWith("project", "take-live", "queue"));
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
      fireEvent.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() => expect(stop).toHaveBeenCalledWith("project", "take-live", "all"));
      expect(await screen.findByRole("button", { name: "Chạy tiếp STT" })).toBeEnabled();
    } finally { list.mockRestore(); stop.mockRestore(); }
  });
  it("publishes footage and multi-track Script selection without opening modifier-clicked tracks", async () => {
    const tracks = ["a", "b"].map((id) => ({ ...asset, id, name: `Mic ${id}`, sourceArchiveAssetId: asset.id }));
    const onScriptSelectionChange = vi.fn();
    const onSelectTrack = vi.fn();
    render(<MediaPool {...props({ assets: [asset, ...tracks], onScriptSelectionChange, onSelectTrack })} />);
    fireEvent.click(screen.getByRole("button", { name: `Xổ track của ${asset.name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Mở Script Mic a" }));
    await waitFor(() => expect(onScriptSelectionChange).toHaveBeenLastCalledWith(["a"]));
    fireEvent.click(screen.getByRole("button", { name: "Mở Script Mic b" }), { shiftKey: true });
    await waitFor(() => expect(onScriptSelectionChange).toHaveBeenLastCalledWith(["a", "b"]));
    expect(onSelectTrack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mở Script Mic a" }), { ctrlKey: true });
    await waitFor(() => expect(onScriptSelectionChange).toHaveBeenLastCalledWith(["b"]));
    fireEvent.click(screen.getByRole("button", { name: "Mở Script Mic b" }), { ctrlKey: true });
    await waitFor(() => expect(onScriptSelectionChange).toHaveBeenLastCalledWith([]));
  });
  it("opens live OBS tracks and previews acknowledged PCM before the MKA exists", async () => {
    const live = { recording: { recordingId: "take-live", projectId: "project", displayName: "Lesson",
      status: "recording", archiveStatus: "pending" }, durableChannelIds: ["mic"], channels: [
      { channelId: "mic", relayLabel: "Mic", nativeName: "USB microphone", slot: 1, forwardApplied: true },
      { channelId: "desk", relayLabel: "Desk", slot: 2, forwardApplied: true },
    ] } as ObsLiveLinkRecordingJournal;
    const list = vi.spyOn(api, "listObsLiveLinkRecordings").mockResolvedValue([live]);
    const preview = vi.spyOn(api, "previewObsLiveLinkChannel").mockResolvedValue({
      blob: new Blob(["wav"], { type: "audio/wav" }), startSeconds: 12, endSeconds: 15,
    });
    const previousCreate = URL.createObjectURL;
    const previousRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:live-preview");
    URL.revokeObjectURL = vi.fn();
    const onOpenObsRecording = vi.fn();
    const onOpenObsTrack = vi.fn();
    try {
      const view = render(<MediaPool {...props({ assets: [], projectId: "project",
        selectedObsRecordingId: "take-live", onOpenObsRecording, onOpenObsTrack })} />);
      const row = await screen.findByLabelText("Footage OBS Lesson: ĐANG GHI");
      expect(row).toHaveClass("is-selected");
      fireEvent.click(row.querySelector(".media-pool-item__main")!);
      expect(onOpenObsRecording).toHaveBeenCalledWith("take-live");
      expect(screen.getByRole("button", { name: "Mở Mic đang ghi" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Mở Mic đang ghi" }));
      expect(onOpenObsTrack).toHaveBeenCalledWith("take-live", "mic");
      expect(screen.getByRole("button", { name: "Nghe PCM đã lưu của Desk" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Nghe PCM đã lưu của Mic" }));
      await waitFor(() => expect(preview).toHaveBeenCalledWith("project", "take-live", "mic"));
      expect(await screen.findByLabelText("Nghe lại Mic")).toHaveAttribute("src", "blob:live-preview");
      expect(row).toHaveTextContent("PCM 00:12–00:15");
      view.unmount();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:live-preview");
    } finally {
      list.mockRestore();
      preview.mockRestore();
      URL.createObjectURL = previousCreate;
      URL.revokeObjectURL = previousRevoke;
    }
  });
  it("starts detailed STT on selected durable OBS tracks while recording", async () => {
    const live = { recording: { recordingId: "take-live", projectId: "project", displayName: "OBS take live",
      status: "recording", archiveStatus: "pending" },
      durableChannelIds: ["mic", "desktop"],
      channels: [
        { channelId: "mic", relayLabel: "Mic", slot: 1, forwardApplied: true },
        { channelId: "desktop", relayLabel: "Desktop", slot: 2, forwardApplied: true },
        { channelId: "empty", relayLabel: "Empty", slot: 3, forwardApplied: true },
      ] } as ObsLiveLinkRecordingJournal;
    const list = vi.spyOn(api, "listObsLiveLinkRecordings").mockResolvedValue([live]);
    const start = vi.spyOn(api, "startObsLiveLinkDetailedStt").mockResolvedValue({ segmentSeconds: 90,
      tracks: { mic: { initialFrames: 240000, cursor: 0 } } });
    try {
      render(<MediaPool {...props({ assets: [], projectId: "project" })} />);
      await screen.findByLabelText("Footage OBS OBS take live: ĐANG GHI");
      fireEvent.click(screen.getByRole("button", { name: "STT kỹ" }));
      expect(screen.queryByLabelText("STT kỹ Empty")).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("STT kỹ Desktop"));
      fireEvent.change(screen.getByLabelText("Độ dài block STT OBS"), { target: { value: "90" } });
      fireEvent.click(screen.getByRole("button", { name: "Bắt đầu STT kỹ" }));
      await waitFor(() => expect(start).toHaveBeenCalledWith("project", "take-live", 90, ["mic"]));
      expect(await screen.findByText(/STT kỹ đang chạy cho 1 track/)).toBeInTheDocument();
    } finally {
      list.mockRestore();
      start.mockRestore();
    }
  });
  it("shows a live OBS footage row and replaces it when its MKA is ready", async () => {
    const recording = { recordingId: "take-live", projectId: "project", displayName: "OBS take live",
      status: "recording", archiveStatus: "pending" };
    const live = { recording } as ObsLiveLinkRecordingJournal;
    const ready = { recording: { ...recording, status: "stopped", archiveStatus: "ready" } } as ObsLiveLinkRecordingJournal;
    const list = vi.spyOn(api, "listObsLiveLinkRecordings").mockResolvedValueOnce([live]).mockResolvedValue([ready]);
    const onObsArchiveReady = vi.fn().mockResolvedValue(undefined);
    const onOpenObsRecording = vi.fn();
    try {
      const view = render(<MediaPool {...props({ assets: [], projectId: "project", onObsArchiveReady, onOpenObsRecording })} />);
      const pending = await screen.findByLabelText("Footage OBS OBS take live: ĐANG GHI");
      expect(pending).toHaveTextContent("Phiên thu đang mở · MKA chưa hoàn tất");
      fireEvent.click(pending.querySelector(".media-pool-item__main")!);
      expect(onOpenObsRecording).toHaveBeenCalledWith("take-live");
      await waitFor(() => expect(onObsArchiveReady).toHaveBeenCalledWith("take-live"), { timeout: 2500 });
      view.rerender(<MediaPool {...props({ assets: [{ ...asset, id: "archive", name: "OBS take live", sourceExtension: ".mka", obsRecordingId: "take-live" }], projectId: "project", onObsArchiveReady })} />);
      expect(screen.queryByLabelText("Footage OBS OBS take live: ĐANG CẬP NHẬT MEDIA POOL")).not.toBeInTheDocument();
      expect(list).toHaveBeenCalledWith("project");
    } finally {
      list.mockRestore();
    }
  });
  it("opens the native file picker from the primary IMPORT icon", () => {
    const onImportLocal = vi.fn();
    render(<MediaPool {...props({ onImportLocal })} />);
    fireEvent.click(screen.getByRole("button", { name: "Import footage từ máy Host" }));
    expect(onImportLocal).toHaveBeenCalledOnce();
  });

  it("keeps browser upload available and explains why it must cache", () => {
    render(<MediaPool {...props()} />);
    const input = screen.getByLabelText("Import file từ máy đang dùng") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload file qua trình duyệt" }));
    expect(click).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [new File(["a"], "upload.wav")] } });
    expect(screen.getByRole("checkbox", { name: "Cache file" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cache file" })).toBeDisabled();
  });

  it("keeps multi-file upload choices and starts the batch from an in-app import dialog", () => {
    const onImport = vi.fn();
    const first = new File(["a"], "first.wav", { type: "audio/wav" });
    const second = new File(["b"], "second.wav", { type: "audio/wav" });
    render(<MediaPool {...props({ onImport })} />);
    const input = screen.getByLabelText("Import file từ máy đang dùng") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload file qua trình duyệt" }));
    expect(click).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [first, second] } });
    expect(screen.getByLabelText("Footage first.wav: ĐANG CHỜ IMPORT")).toBeInTheDocument();
    expect(screen.getByLabelText("Footage second.wav: ĐANG CHỜ IMPORT")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Tùy chọn import media" })).toHaveTextContent("2 footage");
    expect(screen.getByLabelText("Đánh dấu STT cho first.wav")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Import 2 file" }));
    expect(onImport).toHaveBeenCalledWith([
      { file: first, transcribe: true }, { file: second, transcribe: true },
    ]);
    expect(screen.queryByRole("dialog", { name: "Tùy chọn import media" })).not.toBeInTheDocument();
  });

  it("keeps the immediate browser import slot until the workspace queue owns it, without duplicate rows", async () => {
    const file = new File(["audio"], "handoff.wav", { type: "audio/wav" });
    const existing = { ...asset, name: file.name };
    const view = render(<MediaPool {...props({ assets: [existing] })} />);
    const input = screen.getByLabelText("Import file từ máy đang dùng") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByLabelText("Footage handoff.wav: ĐANG CHỜ IMPORT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 file" }));
    expect(screen.getByLabelText("Footage handoff.wav: ĐANG IMPORT")).toBeInTheDocument();
    view.rerender(<MediaPool {...props({ assets: [existing], pendingMediaImports: [{ id: "job-1", name: "handoff.wav", status: "caching" }] })} />);
    await waitFor(() => expect(screen.getByLabelText("Footage handoff.wav: ĐANG CACHE")).toBeInTheDocument());
    expect(screen.getAllByLabelText(/Footage handoff\.wav:/)).toHaveLength(1);
  });

  it("asks native-file cache choice inside the app and keeps an import row visible", async () => {
    const onConfirmNativeMediaImport = vi.fn();
    const onRetryPendingImport = vi.fn();
    const view = render(<MediaPool {...props({
      assets: [], pendingNativeMediaPaths: ["C:/source/one.wav", "C:/source/two.wav"],
      onConfirmNativeMediaImport, onRetryPendingImport,
    })} />);
    expect(await screen.findByRole("dialog", { name: "Tùy chọn cache file media" })).toHaveTextContent("2 file");
    expect(screen.getByLabelText("Footage one.wav: ĐANG CHỜ IMPORT")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Cache file" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Import 2 file" }));
    expect(onConfirmNativeMediaImport).toHaveBeenCalledWith(["C:/source/one.wav", "C:/source/two.wav"], true);
    expect(screen.getByLabelText("Footage one.wav: ĐANG IMPORT")).toBeInTheDocument();
    view.rerender(<MediaPool {...props({ assets: [], pendingMediaImports: [{ id: "pending-1", name: "one.wav", status: "caching" }] })} />);
    await waitFor(() => expect(screen.getByLabelText("Footage one.wav: ĐANG CACHE")).toBeInTheDocument());
    expect(screen.getAllByLabelText(/Footage one\.wav:/)).toHaveLength(1);
    const failed = { id: "pending-2", name: "bad.wav", status: "error" as const, retryable: true, detail: "unsupported codec" };
    view.rerender(<MediaPool {...props({ assets: [], pendingMediaImports: [failed], onRetryPendingImport })} />);
    expect(screen.getByLabelText("Footage bad.wav: LỖI IMPORT")).toHaveTextContent("unsupported codec");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetryPendingImport).toHaveBeenCalledWith("pending-2");
    view.unmount();
  });

  it("imports a native file as a source link when Cache file is unticked", async () => {
    const onConfirmNativeMediaImport = vi.fn();
    render(<MediaPool {...props({ assets: [], pendingNativeMediaPaths: ["C:/source/one.wav"], onConfirmNativeMediaImport })} />);
    const cache = await screen.findByRole("checkbox", { name: "Cache file" });
    fireEvent.click(cache);
    expect(cache).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 file" }));
    expect(onConfirmNativeMediaImport).toHaveBeenCalledWith(["C:/source/one.wav"], false);
  });

  it("replaces the browser cache confirmation for pending native tracks with an app dialog", async () => {
    const onConfirmPendingLocalMedia = vi.fn();
    const pendingLocalMedia = { sourcePath: "C:/recording.wav", name: "recording.wav", tracks: [
      { streamIndex: 0, title: "Audio", codec: "pcm", channels: 2, imported: true, transcribe: false },
    ] };
    render(<MediaPool {...props({ assets: [], pendingLocalMedia, onConfirmPendingLocalMedia })} />);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import file đã hoàn tất" }));
    expect(screen.getByRole("dialog", { name: "Tùy chọn cache file media" })).toHaveTextContent("recording.wav");
    fireEvent.click(screen.getByRole("checkbox", { name: "Cache file" }));
    fireEvent.click(screen.getByRole("button", { name: "Import file" }));
    expect(onConfirmPendingLocalMedia).toHaveBeenCalledWith("import", undefined, false);
  });

  it("creates nested folders and moves footage in and back out without moving its source", async () => {
    const organization: MediaPoolOrganization = {
      schemaVersion: 1 as const,
      folders: [{ id: "folder-a", name: "Audio", parentFolderId: null, order: 0 }],
      assets: [{ assetId: asset.id, folderId: null, order: 0 }],
    };
    const read = vi.spyOn(api, "getMediaPoolOrganization").mockResolvedValue(organization);
    const save = vi.spyOn(api, "updateMediaPoolOrganization").mockImplementation(async (_projectId, next) => next);
    const sourcePath = asset.sourcePath;
    const view = render(<MediaPool {...props({ projectId: "project", assets: [asset], onImportLocal: vi.fn() })} />);
    try {
      await waitFor(() => expect(read).toHaveBeenCalledWith("project"));
      await screen.findByRole("button", { name: "Mở thư mục Audio" });
      fireEvent.click(screen.getByRole("button", { name: "Tạo thư mục con trong Audio" }));
      fireEvent.change(screen.getByLabelText("Tên thư mục mới"), { target: { value: "Interview" } });
      fireEvent.click(screen.getByRole("button", { name: "Tạo folder" }));
      await waitFor(() => expect(save).toHaveBeenLastCalledWith("project", expect.objectContaining({
        folders: expect.arrayContaining([expect.objectContaining({ name: "Interview", parentFolderId: "folder-a" })]),
      })));

      const assetRow = view.container.querySelector(".media-pool-item[draggable='true']") as HTMLElement;
      const transfer = { setData: vi.fn(), getData: vi.fn(() => asset.id), effectAllowed: "", dropEffect: "" };
      fireEvent.dragStart(assetRow, { dataTransfer: transfer });
      fireEvent.drop(screen.getByRole("button", { name: "Mở thư mục Audio" }), { dataTransfer: transfer });
      await waitFor(() => expect(save).toHaveBeenLastCalledWith("project", expect.objectContaining({
        assets: [expect.objectContaining({ assetId: asset.id, folderId: "folder-a" })],
      })));

      const movedAssetRow = view.container.querySelector(".media-pool-item[draggable='true']") as HTMLElement;
      fireEvent.dragStart(movedAssetRow, { dataTransfer: transfer });
      fireEvent.drop(view.container.querySelector(".media-organization-root")!, { dataTransfer: transfer });
      await waitFor(() => expect(save).toHaveBeenLastCalledWith("project", expect.objectContaining({
        assets: [expect.objectContaining({ assetId: asset.id, folderId: null })],
      })));
      expect(asset.sourcePath).toBe(sourcePath);
    } finally {
      read.mockRestore();
      save.mockRestore();
      view.unmount();
    }
  });

  it("keeps optimistic organization changes when an older queued save responds", async () => {
    const organization = {
      schemaVersion: 1 as const,
      folders: [],
      assets: [{ assetId: asset.id, folderId: null, order: 0 }],
    };
    const read = vi.spyOn(api, "getMediaPoolOrganization").mockResolvedValue(organization);
    const saves: Array<{ organization: MediaPoolOrganization; resolve: (value: MediaPoolOrganization) => void }> = [];
    const save = vi.spyOn(api, "updateMediaPoolOrganization").mockImplementation(async (_projectId, next) => {
      return await new Promise((resolve) => saves.push({ organization: structuredClone(next), resolve }));
    });
    const view = render(<MediaPool {...props({ projectId: "project", assets: [asset] })} />);
    try {
      await waitFor(() => expect(read).toHaveBeenCalledWith("project"));

      const addFolder = async (name: string) => {
        fireEvent.click(screen.getByRole("button", { name: "Tạo thư mục" }));
        fireEvent.change(screen.getByLabelText("Tên thư mục mới"), { target: { value: name } });
        fireEvent.click(screen.getByRole("button", { name: "Tạo folder" }));
      };
      await addFolder("Folder One");
      await addFolder("Folder Two");
      expect(saves).toHaveLength(1);

      await act(async () => saves[0].resolve(saves[0].organization));
      await waitFor(() => expect(saves).toHaveLength(2));
      expect(screen.getByRole("button", { name: "Mở thư mục Folder Two" })).toBeInTheDocument();

      const assetRow = view.container.querySelector(".media-pool-item[draggable='true']") as HTMLElement;
      const transfer = { setData: vi.fn(), getData: vi.fn(() => asset.id), effectAllowed: "", dropEffect: "" };
      fireEvent.dragStart(assetRow, { dataTransfer: transfer });
      fireEvent.drop(screen.getByRole("button", { name: "Mở thư mục Folder Two" }), { dataTransfer: transfer });
      await act(async () => saves[1].resolve(saves[1].organization));
      await waitFor(() => expect(saves).toHaveLength(3));
      expect(saves[2].organization).toEqual(expect.objectContaining({
        folders: expect.arrayContaining([
          expect.objectContaining({ name: "Folder One" }),
          expect.objectContaining({ name: "Folder Two" }),
        ]),
        assets: [expect.objectContaining({ assetId: asset.id, folderId: expect.any(String) })],
      }));
      await act(async () => saves[2].resolve(saves[2].organization));
    } finally {
      read.mockRestore();
      save.mockRestore();
      view.unmount();
    }
  });

  it("prunes permanently deleted assets from the saved organization before the next folder edit", async () => {
    const second = { ...asset, id: "asset-2", name: "second.wav", sourcePath: "assets/media/asset-2/source.wav" };
    const imported = { ...asset, id: "asset-3", name: "new-import.wav", sourcePath: "assets/media/asset-3/source.wav" };
    const organization: MediaPoolOrganization = {
      schemaVersion: 1,
      folders: [],
      assets: [
        { assetId: asset.id, folderId: null, order: 0 },
        { assetId: second.id, folderId: null, order: 1 },
      ],
    };
    const read = vi.spyOn(api, "getMediaPoolOrganization").mockResolvedValue(organization);
    const save = vi.spyOn(api, "updateMediaPoolOrganization").mockImplementation(async (_projectId, next) => next);
    const view = render(<MediaPool {...props({ projectId: "project", assets: [asset, second] })} />);
    try {
      await waitFor(() => expect(read).toHaveBeenCalledWith("project"));
      view.rerender(<MediaPool {...props({ projectId: "project", assets: [second] })} />);
      await waitFor(() => expect(save).toHaveBeenCalledWith("project", expect.objectContaining({
        assets: [expect.objectContaining({ assetId: second.id })],
      })));
      expect(save.mock.calls.at(-1)?.[1].assets.map((placement) => placement.assetId)).not.toContain(asset.id);

      view.rerender(<MediaPool {...props({ projectId: "project", assets: [second, imported] })} />);
      await waitFor(() => expect(save.mock.calls.at(-1)?.[1].assets).toEqual(expect.arrayContaining([
        expect.objectContaining({ assetId: second.id }),
        expect.objectContaining({ assetId: imported.id, folderId: null }),
      ])));

      fireEvent.click(screen.getByRole("button", { name: "Tạo thư mục" }));
      fireEvent.change(screen.getByLabelText("Tên thư mục mới"), { target: { value: "Clean Folder" } });
      fireEvent.click(screen.getByRole("button", { name: "Tạo folder" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Mở thư mục Clean Folder" })).toBeInTheDocument());

      const row = screen.getByRole("button", { name: /new-import\.wav/ }).closest(".media-pool-item") as HTMLElement;
      const transfer = { setData: vi.fn(), getData: vi.fn(() => imported.id), effectAllowed: "", dropEffect: "" };
      fireEvent.dragStart(row, { dataTransfer: transfer });
      fireEvent.drop(screen.getByRole("button", { name: "Mở thư mục Clean Folder" }), { dataTransfer: transfer });
      await waitFor(() => expect(save.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
        folders: expect.arrayContaining([expect.objectContaining({ name: "Clean Folder" })]),
        assets: expect.arrayContaining([
          expect.objectContaining({ assetId: second.id }),
          expect.objectContaining({ assetId: imported.id, folderId: expect.any(String) }),
        ]),
      })));
      expect(save.mock.calls.at(-1)?.[1].assets.map((placement) => placement.assetId)).not.toContain(asset.id);
    } finally {
      read.mockRestore();
      save.mockRestore();
      view.unmount();
    }
  });

  it("preserves loaded folder placements while the initial asset list is still empty", async () => {
    const organization: MediaPoolOrganization = {
      schemaVersion: 1,
      folders: [{ id: "saved-folder", name: "Saved Folder", parentFolderId: null, order: 0 }],
      assets: [{ assetId: asset.id, folderId: "saved-folder", order: 0 }],
    };
    const read = vi.spyOn(api, "getMediaPoolOrganization").mockResolvedValue(organization);
    const save = vi.spyOn(api, "updateMediaPoolOrganization").mockImplementation(async (_projectId, next) => next);
    const view = render(<MediaPool {...props({ projectId: "project", assets: [], busy: false })} />);
    try {
      await screen.findByRole("button", { name: "Mở thư mục Saved Folder" });
      view.rerender(<MediaPool {...props({ projectId: "project", assets: [asset], busy: false })} />);
      fireEvent.click(screen.getByRole("button", { name: "Mở thư mục Saved Folder" }));
      expect(screen.getByRole("button", { name: /interview\.mov/ })).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      save.mockRestore();
      view.unmount();
    }
  });

  it("clears the open footage when the empty part of the list is clicked", () => {
    const onSelect = vi.fn();
    const onClearSelection = vi.fn();
    render(<MediaPool {...props({ onSelect, onClearSelection, selectedAssetId: asset.id })} />);
    fireEvent.click(screen.getByRole("region", { name: "Danh sách Media Pool" }));
    expect(onClearSelection).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /interview\.mov/ }));
    expect(onSelect).toHaveBeenCalledWith(asset.id);
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it("offers a local growing-MKV path when an active recording is chosen through IMPORT", () => {
    const onImport = vi.fn();
    const onImportLocal = vi.fn();
    render(<MediaPool {...props({ onImport, onImportLocal })} />);
    fireEvent.change(screen.getByLabelText("Import file từ máy đang dùng"), {
      target: { files: [new File(["partial mkv"], "recording.mkv", { type: "video/x-matroska" })] },
    });
    const dialog = screen.getByRole("dialog", { name: "Tùy chọn import media" });
    expect(dialog).toHaveTextContent("MKV đang ghi");
    expect(screen.getByRole("button", { name: "Import file đã hoàn tất" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Theo dõi MKV đang ghi" }));
    expect(onImportLocal).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("configures import and STT per pending native track from the right-click menu", () => {
    const pendingLocalMedia = { sourcePath: "C:/recording.mkv", name: "recording.mkv", tracks: [
      { streamIndex: 1, title: "Mic", codec: "aac", channels: 2, imported: true, transcribe: false },
      { streamIndex: 2, title: "Desktop", codec: "aac", channels: 2, imported: true, transcribe: false },
    ] };
    const onPendingLocalTrackChange = vi.fn();
    const onConfirmPendingLocalMedia = vi.fn();
    render(<MediaPool {...props({ assets: [], pendingLocalMedia, onPendingLocalTrackChange, onConfirmPendingLocalMedia })} />);
    const menu = screen.getByRole("menu", { name: "Chọn track cho recording.mkv" });
    expect(menu).toHaveTextContent("Mic");
    expect(menu).toHaveTextContent("Desktop");
    fireEvent.click(screen.getByLabelText("Import track 1 Mic"));
    fireEvent.click(screen.getByLabelText("STT track 2 Desktop"));
    expect(onPendingLocalTrackChange).toHaveBeenCalledWith(1, "imported", false);
    expect(onPendingLocalTrackChange).toHaveBeenCalledWith(2, "transcribe", true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Theo dõi MKV đang ghi" }));
    expect(onConfirmPendingLocalMedia).toHaveBeenCalledWith("follow", 60);
  });

  it("starts following with live preview and defers detailed STT until its button is pressed", () => {
    const pendingLocalMedia = { sourcePath: "C:/recording.mkv", name: "recording.mkv", tracks: [
      { streamIndex: 1, title: "Mic", codec: "aac", channels: 2, imported: true, transcribe: true },
    ] };
    const onConfirmPendingLocalMedia = vi.fn();
    render(<MediaPool {...props({ assets: [], pendingLocalMedia, onConfirmPendingLocalMedia })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Chọn track cho recording.mkv" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Theo dõi MKV đang ghi" }));
    expect(screen.queryByRole("dialog", { name: "Thiết lập STT MKV" })).not.toBeInTheDocument();
    expect(onConfirmPendingLocalMedia).toHaveBeenCalledWith("follow", 60);
  });

  it("shows persisted imported and omitted tracks and selects STT for one child", () => {
    const parent = { ...asset, id: "parent", name: "video.mkv", growingMkvFollow: true, availableAudioTracks: [
      { streamIndex: 1, title: "Mic", codec: "aac", channels: 2, imported: false },
      { streamIndex: 2, title: "Desktop", codec: "aac", channels: 2, imported: true },
    ] };
    const child = { ...asset, id: "child", sourceArchiveAssetId: "parent", sourceArchiveStreamIndex: 2, transcriptionSelected: false };
    const onToggleTranscription = vi.fn();
    const onFinishGrowingMkv = vi.fn();
    render(<MediaPool {...props({ assets: [parent, child], onToggleTranscription, onFinishGrowingMkv })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /^video\.mkv/ }));
    expect(screen.getByLabelText("Đã import track 1 Mic")).not.toBeChecked();
    expect(screen.getByLabelText("Đã import track 2 Desktop")).toBeChecked();
    expect(screen.getByLabelText("STT track 1 Mic")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("STT track 2 Desktop"));
    expect(onToggleTranscription).toHaveBeenCalledWith("child", true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Finish MKV sau khi OBS dừng" }));
    expect(onFinishGrowingMkv).toHaveBeenCalledWith("parent");
  });

  it("shows four per-track stages and makes a mixed parent checkbox apply to all tracks", () => {
    const parent = { ...asset, id: "parent", name: "multi.mkv" };
    const desk = { ...asset, id: "desk", name: "Desk", sourceArchiveAssetId: "parent", importSelected: true, transcriptionSelected: true, diarizationSelected: false, trainingSelected: true };
    const mic = { ...asset, id: "mic", name: "Mic", sourceArchiveAssetId: "parent", importSelected: false, transcriptionSelected: false, diarizationSelected: false, trainingSelected: false };
    const onToggleImport = vi.fn();
    const onToggleDiarization = vi.fn();
    render(<MediaPool {...props({ assets: [parent, desk, mic], onToggleImport, onToggleDiarization })} />);

    const parentImport = screen.getByRole("checkbox", { name: "Import multi.mkv" }) as HTMLInputElement;
    expect(parentImport.indeterminate).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Xổ track của multi.mkv" }));
    expect(screen.getByRole("checkbox", { name: "Import Desk" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Import Mic" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "STT Desk" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Speaker Diarization Desk" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Train Desk" })).toBeChecked();
    fireEvent.click(parentImport);
    expect(onToggleImport).toHaveBeenCalledWith("parent", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Speaker Diarization Desk" }));
    expect(onToggleDiarization).toHaveBeenCalledWith("desk", true);
  });

  it("adds an omitted completed track and withdraws a materialized track without reimporting", () => {
    const parent = { ...asset, id: "parent", name: "video.mkv", availableAudioTracks: [
      { streamIndex: 1, title: "Mic", imported: false },
      { streamIndex: 2, title: "Desktop", imported: true },
    ] };
    const child = { ...asset, id: "child", sourceArchiveAssetId: "parent", sourceArchiveStreamIndex: 2, importSelected: true };
    const onToggleImport = vi.fn();
    render(<MediaPool {...props({ assets: [parent, child], onToggleImport })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /^video\.mkv/ }));
    fireEvent.click(screen.getByLabelText("Đã import track 1 Mic"));
    expect(onToggleImport).toHaveBeenCalledWith("parent", true, 1);
    fireEvent.click(screen.getByLabelText("Đã import track 2 Desktop"));
    expect(onToggleImport).toHaveBeenCalledWith("child", false);
  });

  it("starts detailed STT during a growing MKV with a minutes and seconds dialog", () => {
    const parent = { ...asset, id: "parent", name: "recording.mkv", growingMkvFollow: true };
    const child = { ...asset, id: "mic", sourceArchiveAssetId: "parent", transcriptionSelected: true };
    const onStartGrowingMkvDetailedStt = vi.fn();
    render(<MediaPool {...props({ assets: [parent, child], onStartGrowingMkvDetailedStt })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /^recording\.mkv/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "STT kỹ MKV đang ghi" }));
    fireEvent.change(screen.getByLabelText("Số phút STT kỹ"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Số giây STT kỹ"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu STT kỹ" }));
    expect(onStartGrowingMkvDetailedStt).toHaveBeenCalledWith("parent", 125);
  });

  it("opens detailed STT for the selected growing footage when more than one is present", () => {
    const first = { ...asset, id: "first", name: "first.mkv", growingMkvFollow: true };
    const second = { ...asset, id: "second", name: "second.mkv", growingMkvFollow: true };
    const tracks = [
      { ...asset, id: "first-track", sourceArchiveAssetId: "first", transcriptionSelected: true },
      { ...asset, id: "second-track", sourceArchiveAssetId: "second", transcriptionSelected: true },
    ];
    const onStartGrowingMkvDetailedStt = vi.fn();
    render(<MediaPool {...props({ assets: [first, second, ...tracks], selectedAssetId: "second", onStartGrowingMkvDetailedStt })} />);
    fireEvent.click(screen.getByRole("button", { name: /^Speech to text/ }));
    expect(screen.getByRole("dialog", { name: "Thiết lập STT MKV" })).toHaveTextContent("second.mkv");
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu STT kỹ" }));
    expect(onStartGrowingMkvDetailedStt).toHaveBeenCalledWith("second", 60);
  });

  it("can change STT selection on an imported MKV with one audio track", () => {
    const single = { ...asset, name: "single.mkv", availableAudioTracks: [
      { streamIndex: 1, title: "Mic", codec: "aac", channels: 2, imported: true },
    ] };
    const onToggleTranscription = vi.fn();
    render(<MediaPool {...props({ assets: [single], onToggleTranscription })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /single.mkv/ }));
    fireEvent.click(screen.getByLabelText("STT track 1 Mic"));
    expect(onToggleTranscription).toHaveBeenCalledWith("asset-1", true);
  });

  it("shows one footage per OBS recording and keeps its channels inside it", () => {
    const parent = { ...asset, id: "archive-1", name: "OBS LiveLink · take-one", sourceExtension: ".mka", sourcePath: "assets/obs-livelink/take-one/source.mka", obsRecordingId: "take-one", mediaKind: "audio" as const };
    const child = { ...asset, id: "channel-1", name: "Channel 1", sourceExtension: ".wav", obsRecordingId: "take-one", sourceArchiveAssetId: "archive-1", transcriptionSelected: true };
    const second = { ...parent, id: "archive-2", name: "OBS LiveLink · take-two", obsRecordingId: "take-two" };
    const onSelect = vi.fn();
    render(<MediaPool {...props({ assets: [parent, child, second], onSelect })} />);
    expect(screen.getByText("ASSETS").parentElement).toHaveTextContent("2 ASSETS");
    expect(screen.getByText(/1 TRACK/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở Script Track 1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^OBS LiveLink · take-one/ }));
    expect(onSelect).toHaveBeenCalledWith("archive-1");
  });
  it("imports common media formats and selects an asset with its own history", () => {
    const onSelect = vi.fn();
    render(<MediaPool {...props({ onSelect })} />);
    const input = screen.getByLabelText("Import file từ máy đang dùng") as HTMLInputElement;
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
    fireEvent.change(screen.getByLabelText("Import file từ máy đang dùng"), { target: { files } });
    fireEvent.click(screen.getByLabelText("Đánh dấu STT cho known-script.mov"));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 file" }));
    expect(onImport).toHaveBeenCalledWith([{ file: files[0], transcribe: true }, { file: files[1], transcribe: false }]);
  });

  it("marks footage that has not finished data preparation with what is left", () => {
    const words = [{ text: "xin", start: 0, end: 0.4, diarizationSpeakerId: "speaker-1" }];
    const prepared = { ...asset, id: "asset-2", name: "done.mov", words, diarizationStatus: "complete" as const, speakerProfileIds: ["speaker-1"] };
    render(<MediaPool {...props({ assets: [asset, prepared] })} />);

    const warnings = screen.getAllByRole("img", { name: /Chưa xong/ });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toHaveAccessibleName("Chưa xong: Speech to Text, Nhận diện speaker, Gán Speaker Profile");
    expect(warnings[0]).toHaveTextContent("!");
  });

  it("offers every speech-to-text engine the API describes and queues the chosen one", () => {
    const engine = (overrides: Partial<TrainingModelOption>): TrainingModelOption => ({
      id: "x", label: "x", family: "x", engine: "x", mode: "stt", description: "", order: 10, runnable: true,
      repository: { root: "x", path: ".", entrypoint: "x.py" }, notes: [], parameters: [], origin: "shipped", installed: true, available: true, status: "", ...overrides,
    });
    const engines = [
      engine({ id: "faster-whisper", label: "faster-whisper (Studio)", engine: "faster-whisper", parameters: [{ key: "model", label: "Model", group: "Model", kind: "choice", default: "large-v3", nullable: false, editable: true, advanced: false, options: [{ value: "small", label: "Small" }, { value: "large-v3", label: "Large v3" }] }] }),
      engine({ id: "vibevoice-asr", label: "VibeVoice-ASR (Microsoft)", engine: "vibevoice-asr", description: "Chậm, không có word timing." }),
      engine({ id: "future-asr", label: "Future ASR", engine: "future", available: false }),
    ];
    const onQueueTranscriptions = vi.fn();
    const queued = { ...asset, transcriptionSelected: true };
    render(<MediaPool {...props({ assets: [queued], onQueueTranscriptions, sttEngines: engines })} />);

    const select = screen.getByLabelText("Model Speech to Text");
    expect(select).toHaveValue("large-v3");
    expect(screen.getByRole("option", { name: /Future ASR · chưa sẵn sàng/ })).toBeDisabled();
    fireEvent.change(select, { target: { value: "vibevoice-asr" } });
    expect(screen.getByText("Chậm, không có word timing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Speech to text/ }));
    expect(onQueueTranscriptions).toHaveBeenCalledWith("vibevoice-asr");
    expect(sttChoices([]).map((choice) => choice.value)).toContain("large-v3");
    const adapter = { id: "asr-1", name: "An · VibeVoice-ASR LoRA", engine: "vibevoice-asr", baseModel: "microsoft/VibeVoice-ASR", adapterPath: "jobs/training/run-1/checkpoints", speakerProfileId: "speaker-an", sourceRunId: "run-1", createdAt: "" };
    expect(sttChoices(engines, [adapter]).find((choice) => choice.value === "vibevoice-asr@asr-1")?.label).toBe("+ An · VibeVoice-ASR LoRA");
  });

  it("selects only chosen footage for Voice Training", () => {
    const onToggleTraining = vi.fn();
    render(<MediaPool {...props({ onToggleTraining })} />);
    fireEvent.click(screen.getByLabelText("Dùng interview.mov cho Voice Training"));
    expect(onToggleTraining).toHaveBeenCalledWith("asset-1", true);
  });

  it("marks STT, diarization, and training toggles as busy with accessible status", () => {
    const running = { ...asset, transcriptionStatus: "processing" as const,
      diarizationStatus: "queued" as const, speakerProfileIds: ["speaker-1"] };
    render(<MediaPool {...props({ assets: [running], activeTrainingSpeakerIds: ["speaker-1"] })} />);
    expect(screen.getByRole("checkbox", { name: /Speech to text.*đang chạy/i })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("checkbox", { name: /Speaker Diarization interview\.mov.*đang chạy/i })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("checkbox", { name: /Voice Training.*đang chạy/i })).toHaveAttribute("aria-busy", "true");
  });

  it("shows nested folder slots in place and drops footage back to the root without a breadcrumb", async () => {
    const list = vi.spyOn(api, "getMediaPoolOrganization").mockResolvedValue({
      schemaVersion: 1,
      folders: [
        { id: "folder-a", name: "Folder A", parentFolderId: null, order: 0 },
        { id: "folder-b", name: "Folder B", parentFolderId: "folder-a", order: 0 },
      ],
      assets: [{ assetId: asset.id, folderId: "folder-b", order: 0 }],
    });
    const save = vi.spyOn(api, "updateMediaPoolOrganization").mockImplementation(async (_projectId, next) => next);
    try {
      const view = render(<MediaPool {...props({ projectId: "project", assets: [asset] })} />);
      await screen.findByRole("button", { name: "Mở thư mục Folder A" });
      expect(screen.queryByRole("button", { name: "Mở thư mục gốc" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Mở thư mục Folder A" }));
      expect(screen.getByRole("button", { name: "Mở thư mục Folder B" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Mở thư mục Folder B" }));
      expect(screen.getByRole("button", { name: /interview\.mov/ })).toBeInTheDocument();
      const transfer = { setData: vi.fn(), getData: vi.fn(() => asset.id), effectAllowed: "", dropEffect: "" };
      const assetRow = screen.getByRole("button", { name: /interview\.mov/ }).closest(".media-pool-item") as HTMLElement;
      fireEvent.dragStart(assetRow, { dataTransfer: transfer });
      fireEvent.drop(view.container.querySelector(".media-organization-root")!, { dataTransfer: transfer });
      await waitFor(() => expect(save).toHaveBeenLastCalledWith("project", expect.objectContaining({
        assets: [expect.objectContaining({ assetId: asset.id, folderId: null })],
      })));
      expect(list).toHaveBeenCalledWith("project");
    } finally { list.mockRestore(); save.mockRestore(); }
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

  it("turns Speech to text into Pause and two-level Stop while a batch is running", async () => {
    const onControlTranscriptions = vi.fn();
    const running = { ...asset, transcriptionStatus: "processing" as const, transcriptionSelected: true };
    render(<MediaPool {...props({ assets: [running], onControlTranscriptions })} />);
    expect(screen.queryByRole("button", { name: /^Speech to text/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    expect(onControlTranscriptions).toHaveBeenCalledWith("pause");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(onControlTranscriptions).toHaveBeenCalledWith("stop"));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onControlTranscriptions).not.toHaveBeenCalledWith("stop-all");
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(onControlTranscriptions).toHaveBeenCalledWith("stop-all"));
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
    fireEvent.click(screen.getByRole("menuitem", { name: /Dừng hàng đợi STT/ }));
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

  it("reveals a footage original and project copy separately and can park it out of every batch", () => {
    const onReveal = vi.fn();
    const onSetDisabled = vi.fn();
    render(<MediaPool {...props({ onReveal, onSetDisabled })} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reveal in Explorer" }));
    expect(onReveal).toHaveBeenCalledWith(asset, "original");
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reveal in Project Folder" }));
    expect(onReveal).toHaveBeenLastCalledWith(asset, "project");

    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Disable footage/ }));
    expect(onSetDisabled).toHaveBeenCalledWith(asset, true);
  });

  it("disables project reveal for an uncached original, including its child track", () => {
    const parent = { ...asset, hasExternalSource: true, localCacheEnabled: false };
    const child = { ...asset, id: "track-1", name: "Track 1", sourceArchiveAssetId: parent.id };
    const onReveal = vi.fn();
    const view = render(<MediaPool {...props({ assets: [parent, child], onReveal })} />);
    fireEvent.contextMenu(view.container.querySelector(".media-pool-item__main")!);
    expect(screen.getByRole("menuitem", { name: "Reveal in Project Folder" })).toBeDisabled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reveal in Explorer" }));
    expect(onReveal).toHaveBeenCalledWith(parent, "original");
    fireEvent.click(screen.getByRole("button", { name: "Xổ track của interview.mov" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: /Track 1/ }));
    expect(screen.getByRole("menuitem", { name: "Reveal in Project Folder" })).toBeDisabled();
  });

  it("selects recycled footage separately and restores a batch", () => {
    const second = { ...recycled, id: "asset-binned-2", name: "cu-2.wav" };
    const onBatchAction = vi.fn();
    render(<MediaPool {...props({ assets: [recycled, second], onBatchAction })} />);
    fireEvent.click(screen.getByRole("button", { name: /RECYCLE BIN/ }));
    const firstRow = screen.getByRole("button", { name: /cu.wav/ });
    const secondRow = screen.getByRole("button", { name: /cu-2.wav/ });
    fireEvent.click(firstRow);
    fireEvent.click(secondRow, { shiftKey: true });
    expect([firstRow, secondRow].map((row) => row.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    fireEvent.click(screen.getByRole("button", { name: "Restore đã chọn" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "restore", assetIds: ["asset-binned", "asset-binned-2"] });
  });

  it("deletes the selected bin rows together and offers an icon to empty the entire bin", () => {
    const second = { ...recycled, id: "asset-binned-2", name: "cu-2.wav" };
    const third = { ...recycled, id: "asset-binned-3", name: "cu-3.wav" };
    const onBatchAction = vi.fn();
    render(<MediaPool {...props({ assets: [recycled, second, third], onBatchAction })} />);
    fireEvent.click(screen.getByRole("button", { name: /RECYCLE BIN/ }));
    fireEvent.click(screen.getByRole("button", { name: /cu.wav/ }));
    fireEvent.click(screen.getByRole("button", { name: /cu-2.wav/ }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete đã chọn" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "delete", assetIds: ["asset-binned", "asset-binned-2"] });
    fireEvent.click(screen.getByRole("button", { name: "Empty Recycle Bin" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "delete", assetIds: ["asset-binned", "asset-binned-2", "asset-binned-3"] });
  });

  it("keeps selected bin rows on right-click and offers only bin actions", () => {
    const second = { ...recycled, id: "asset-binned-2", name: "cu-2.wav" };
    const onBatchAction = vi.fn();
    render(<MediaPool {...props({ assets: [recycled, second], onBatchAction })} />);
    fireEvent.click(screen.getByRole("button", { name: /RECYCLE BIN/ }));
    const first = screen.getByRole("button", { name: /cu.wav/ });
    const secondRow = screen.getByRole("button", { name: /cu-2.wav/ });
    fireEvent.click(first);
    fireEvent.click(secondRow, { shiftKey: true });
    fireEvent.contextMenu(first);
    const menu = screen.getByRole("menu");
    expect(menu.querySelectorAll("section")).toHaveLength(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete permanently (2)" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "delete", assetIds: ["asset-binned", "asset-binned-2"] });
  });

  it("selects a range, toggles individual footage, and scopes Ctrl+A to live Media Pool rows", () => {
    const assets = [asset, { ...asset, id: "asset-2", name: "second.wav" }, { ...asset, id: "asset-3", name: "third.wav" }];
    const onSelect = vi.fn();
    render(<MediaPool {...props({ assets, onSelect })} />);
    const first = screen.getByRole("button", { name: /interview.mov/ });
    const second = screen.getByRole("button", { name: /second.wav/ });
    const third = screen.getByRole("button", { name: /third.wav/ });
    fireEvent.click(first);
    fireEvent.click(third, { shiftKey: true });
    expect([first, second, third].map((item) => item.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
    fireEvent.click(second, { ctrlKey: true });
    expect(second).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(first);
    first.focus();
    fireEvent.keyDown(first, { key: "a", ctrlKey: true });
    expect([first, second, third].map((item) => item.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
    expect(onSelect).toHaveBeenCalledWith("asset-1");
  });

  it("keeps a multi-selection on right-click and sends batch edits and Remove to all selected footage", () => {
    const second = { ...asset, id: "asset-2", name: "second.wav", emotion: "sad" as const };
    const onBatchAction = vi.fn();
    const onRemove = vi.fn();
    render(<MediaPool {...props({ assets: [asset, second], onBatchAction, onRemove })} />);
    const firstRow = screen.getByRole("button", { name: /interview.mov/ });
    const secondRow = screen.getByRole("button", { name: /second.wav/ });
    fireEvent.click(firstRow);
    fireEvent.click(secondRow, { ctrlKey: true });
    fireEvent.contextMenu(firstRow);
    expect(firstRow).toHaveAttribute("aria-pressed", "true");
    expect(secondRow).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Exciting" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "annotations", changes: [
      { assetId: "asset-1", speakerProfileIds: [], environmentProfileIds: [], emotion: "exciting" },
      { assetId: "asset-2", speakerProfileIds: [], environmentProfileIds: [], emotion: "exciting" },
    ] });
    fireEvent.contextMenu(secondRow);
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "recycle", assetIds: ["asset-1", "asset-2"] });
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("adds a speaker to each selected footage without dropping its other tags", () => {
    const second = { ...asset, id: "asset-2", name: "second.wav", speakerProfileIds: ["existing"], environmentProfileIds: ["room"] };
    const speaker: SpeakerProfile = { id: "speaker-1", name: "Anh Vũ", language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", age: "middle-aged", gender: "male", attributes: {}, color: "#ff6745", createdAt: "2026-08-23T00:00:00Z" };
    const onBatchAction = vi.fn();
    render(<MediaPool {...props({ assets: [asset, second], speakers: [speaker], onBatchAction })} />);
    fireEvent.click(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("button", { name: /second.wav/ }), { ctrlKey: true });
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Anh Vũ" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "annotations", changes: [
      { assetId: "asset-1", speakerProfileIds: ["speaker-1"], environmentProfileIds: [], emotion: "normal" },
      { assetId: "asset-2", speakerProfileIds: ["existing", "speaker-1"], environmentProfileIds: ["room"], emotion: "normal" },
    ] });
    fireEvent.contextMenu(screen.getByRole("button", { name: /second.wav/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Disable footage/ }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "disabled", assetIds: ["asset-1", "asset-2"], disabled: true });
  });

  it("batches STT and TRAIN selection only for eligible selected footage", () => {
    const running = { ...asset, id: "asset-2", name: "running.wav", transcriptionStatus: "processing" as const };
    const noAudio = { ...asset, id: "asset-3", name: "silent.mov", status: "no-audio" as const };
    const onBatchAction = vi.fn();
    render(<MediaPool {...props({ assets: [asset, running, noAudio], onBatchAction })} />);
    const first = screen.getByRole("button", { name: /interview.mov/ });
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: /silent.mov/ }), { shiftKey: true });
    fireEvent.contextMenu(first);
    fireEvent.click(screen.getByRole("menuitem", { name: "Chọn STT (1)" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "selection", target: "stt", assetIds: ["asset-1"], selected: true });
    fireEvent.contextMenu(first);
    fireEvent.click(screen.getByRole("menuitem", { name: "Chọn TRAIN (2)" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "selection", target: "training", assetIds: ["asset-1", "asset-2"], selected: true });
  });

  it("does not open a second selected footage and preserves the list selection when the open asset clears", () => {
    const second = { ...asset, id: "asset-2", name: "second.wav" };
    const onSelect = vi.fn();
    const onClearSelection = vi.fn();
    const view = render(<MediaPool {...props({ assets: [asset, second], selectedAssetId: asset.id, onSelect, onClearSelection })} />);
    fireEvent.click(screen.getByRole("button", { name: /second\.wav/ }), { ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    view.rerender(<MediaPool {...props({ assets: [asset, second], selectedAssetId: null, onSelect, onClearSelection })} />);
    expect(view.container.querySelectorAll(".media-pool-item.is-selected")).toHaveLength(2);
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("applies a clicked stage checkbox state to every selected eligible footage", () => {
    const second = { ...asset, id: "asset-2", name: "second.wav", importSelected: false };
    const third = { ...asset, id: "asset-3", name: "third.wav", status: "no-audio" as const };
    const onBatchAction = vi.fn();
    render(<MediaPool {...props({ assets: [asset, second, third], onBatchAction })} />);
    fireEvent.click(screen.getByRole("button", { name: /interview.mov/ }));
    fireEvent.click(screen.getByRole("button", { name: /second.wav/ }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "Import second.wav" }));
    expect(onBatchAction).toHaveBeenCalledWith({ kind: "selection", target: "import", assetIds: ["asset-1", "asset-2"], selected: true });
  });

  it("lists context actions as ordered menu rows", () => {
    render(<MediaPool {...props()} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /interview.mov/ }));
    const menu = screen.getByRole("menu");
    expect(menu.querySelector("footer")?.textContent).not.toContain("RCLICK MENU");
    expect(Array.from(menu.querySelectorAll("footer button")).map((button) => button.textContent?.trim())).toEqual([
      "Reveal in Explorer", "Reveal in Project Folder", "Text History", "Disable footage", "Remove",
    ]);
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
