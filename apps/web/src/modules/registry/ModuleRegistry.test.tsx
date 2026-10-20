import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { EMPTY_SELECTION } from "../../domain/word-selection";
import type { ProjectMediaAsset } from "../../domain/types";
import { ModuleRegistry, type StudioContext } from "./ModuleRegistry";

function importContext(values: Record<string, unknown>) {
  return {
    workflow: "speech-to-text", mediaAssets: [], selectedAssetId: null, mediaBusy: false,
    trainingCatalog: { speakers: [], environmentProfiles: [], settings: {} },
    profileSchema: null, selectedVoice: "", projectVoices: [], sttEngines: [], asrAdapters: [],
    ...values,
  } as unknown as StudioContext;
}

it.each(["media-pool", "library-panel"] as const)("%s shows the picked host file and dispatches the cache choice", async (id) => {
  const onConfirmNativeMediaImport = vi.fn();
  render(<ModuleRegistry id={id} context={importContext({
    pendingNativeMediaPaths: ["D:/media/clip.wav"], onConfirmNativeMediaImport,
  })} />);
  expect(await screen.findByLabelText("Footage clip.wav: ĐANG CHỜ IMPORT")).toBeInTheDocument();
  const cache = screen.getByRole("checkbox", { name: "Cache file" });
  expect(cache).toBeChecked();
  fireEvent.click(cache);
  fireEvent.click(screen.getByRole("button", { name: "Import 1 file" }));
  expect(onConfirmNativeMediaImport).toHaveBeenCalledWith(["D:/media/clip.wav"], false);
});

it.each(["media-pool", "library-panel"] as const)("%s displays queued failures and routes retry", (id) => {
  const onRetryPendingImport = vi.fn();
  render(<ModuleRegistry id={id} context={importContext({
    pendingMediaImports: [
      { id: "queued", name: "queued.wav", status: "caching" },
      { id: "failed", name: "failed.mp4", status: "error", detail: "Cannot decode media", retryable: true },
    ], onRetryPendingImport,
  })} />);
  expect(screen.getByLabelText("Footage queued.wav: ĐANG CACHE")).toBeInTheDocument();
  expect(screen.getByLabelText("Footage failed.mp4: LỖI IMPORT")).toHaveTextContent("Cannot decode media");
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(onRetryPendingImport).toHaveBeenCalledWith("failed");
});

it("shows no stale transcript or track switch when nothing is selected", () => {
  const context = { workflow: "speech-to-text", script: "stale", selectedAssetId: null, selectedImportedTrackId: null,
    mediaAssets: [], take: { words: [{ text: "stale", start: 0, end: 1 }] }, trainingCatalog: { speakers: [], environmentProfiles: [] },
    readingSession: null, wordSelection: EMPTY_SELECTION, obsTimelineActive: false, onScriptChange: vi.fn() } as unknown as StudioContext;
  render(<ModuleRegistry context={context} id="script" />);
  expect(screen.queryByText("stale")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Script transcript" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Chọn footage để xem nội dung.");
  expect(screen.queryByRole("button", { name: /MỞ SCRIPT/ })).not.toBeInTheDocument();
});

it("shows no waveform or transport data until footage is selected", () => {
  const context = { workflow: "speech-to-text", selectedAssetId: null, selectedImportedTrackId: null,
    mediaAssets: [], take: { name: "stale.wav", url: "/stale.wav", duration: 6 },
    obsTimelineActive: false, recordingPreview: null } as unknown as StudioContext;
  render(<ModuleRegistry context={context} id="timeline" />);
  expect(screen.queryByLabelText("Waveform timeline")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Phát" })).not.toBeInTheDocument();
  expect(screen.queryByText("stale.wav")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Chọn footage để xem nội dung.");
});

it("does not load any transcript when several footage are selected", () => {
  const assets = ["a", "b", "c"].map((id) => ({ id, name: id, text: `Transcript ${id}`, words: [], duration: 4, importSelected: true }));
  const context = { workflow: "speech-to-text", script: "Transcript a", selectedAssetId: "a", selectedScriptAssetIds: ["a", "b"], selectedImportedTrackId: null,
    mediaAssets: assets, take: null, trainingCatalog: { speakers: [], environmentProfiles: [] }, readingSession: null,
    wordSelection: EMPTY_SELECTION, obsTimelineActive: false, onScriptChange: vi.fn(), onSelectImportedTrack: vi.fn() } as unknown as StudioContext;
  render(<ModuleRegistry context={context} id="script" />);
  expect(screen.queryByText("Transcript b")).not.toBeInTheDocument();
  expect(screen.queryByText("Transcript a")).not.toBeInTheDocument();
  expect(screen.queryByText("Transcript c")).not.toBeInTheDocument();
});

it("does not fall back to live OBS rows after deselecting archived footage", () => {
  const context = { workflow: "speech-to-text", script: "stale OBS", selectedAssetId: "archive", selectedImportedTrackId: null,
    selectedScriptAssetIds: [], mediaAssets: [{ id: "archive", obsRecordingId: "recording", words: [], text: "stale OBS" }], take: null,
    trainingCatalog: { speakers: [], environmentProfiles: [] }, readingSession: null, wordSelection: EMPTY_SELECTION,
    obsTimelineActive: true, obsTimelineRecordingId: "recording", obsTranscriptRows: [], onScriptChange: vi.fn() } as unknown as StudioContext;
  render(<ModuleRegistry context={context} id="script" />);
  expect(screen.queryByRole("region", { name: "Lượt nói OBS LiveLink" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Script transcript" })).not.toBeInTheDocument();
});

it("excludes untrained footage from Voice Training Media Pool", () => {
  const asset = { duration: 4, text: "", words: [], revisions: [], speakerProfileIds: [], environmentProfileIds: [], emotion: "normal", sourceExtension: ".wav", mediaKind: "audio", status: "ready", importSelected: true };
  const context = { workflow: "voice-training", mediaAssets: [{ ...asset, id: "a", name: "Train me", trainingSelected: true }, { ...asset, id: "b", name: "Do not train", trainingSelected: false }],
    selectedAssetId: null, mediaBusy: false, trainingCatalog: { speakers: [], environmentProfiles: [] }, sttEngines: [], asrAdapters: [] } as unknown as StudioContext;
  render(<ModuleRegistry context={context} id="media-pool" />);
  expect(screen.getByText("Train me")).toBeInTheDocument();
  expect(screen.queryByText("Do not train")).not.toBeInTheDocument();
});

it("keeps the full Script editor while OBS LiveLink rows are visible", () => {
  const context = {
    workflow: "speech-to-text",
    script: "Nội dung Script đang mở",
    mediaAssets: [],
    selectedAssetId: null,
    take: null,
    trainingCatalog: { speakers: [], environmentProfiles: [] },
    readingSession: null,
    wordSelection: EMPTY_SELECTION,
    obsTimelineActive: true,
    obsTimelineRecordingId: "recording-123",
    obsTranscriptRows: [],
    obsTranscriptError: null,
    obsPlayheadSeconds: 0,
    onObsTranscriptSeek: vi.fn(),
    onScriptChange: vi.fn(),
  } as unknown as StudioContext;

  render(<ModuleRegistry context={context} id="script" />);
  expect(screen.getByRole("region", { name: "Lượt nói OBS LiveLink" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /MỞ SCRIPT|MỞ LIVE DRAFT/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Script transcript" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear Text" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "FIND / REPLACE" }));
  expect(screen.getByRole("textbox", { name: "Tìm text" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Lượt nói OBS LiveLink" })).toBeInTheDocument();
});

it("keeps imported channel Script in the editor and routes Timeline to multitrack lanes", () => {
  const parent = { id: "archive", name: "interview.mkv", duration: 40, text: "" } as unknown as ProjectMediaAsset;
  const tracks = [
    { id: "a", name: "Desk", text: "Desk says hello", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 1, duration: 40, words: [], url: null },
    { id: "b", name: "Mic", text: "Mic says hello", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 2, duration: 40, words: [], url: null },
  ] as unknown as ProjectMediaAsset[];
  const onSelectImportedTrack = vi.fn();
  const context = { workflow: "speech-to-text", script: "Desk says hello", selectedAssetId: "archive", selectedImportedTrackId: "a",
    mediaAssets: [parent, ...tracks], take: { name: "Desk", duration: 40 }, onSelectImportedTrack,
    onObsTimelineCutsChange: vi.fn(), onScriptChange: vi.fn(), trainingCatalog: { speakers: [], environmentProfiles: [] },
    wordSelection: EMPTY_SELECTION, readingSession: null, obsTimelineActive: false } as unknown as StudioContext;
  const script = render(<ModuleRegistry context={context} id="script" />);
  expect(screen.queryByRole("group", { name: "Script theo channel" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Script transcript" })).toHaveValue("Desk says hello");
  script.unmount();
  render(<ModuleRegistry context={context} id="timeline" />);
  expect(screen.getByLabelText("Timeline đa kênh import")).toBeInTheDocument();
  expect(screen.getAllByLabelText(/Waveform Channel/)).toHaveLength(1);
});

it("shows the parent's imported channel turns in chronological order and opens a child Script", () => {
  const parent = { id: "archive", name: "interview.mkv", duration: 40, text: "", words: [] } as unknown as ProjectMediaAsset;
  const tracks = [
    { id: "a", name: "Mic", text: "Hello", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 1, duration: 40,
      words: [{ text: "Hello", start: 3, end: 4 }], url: null },
    { id: "b", name: "Desk", text: "Earlier", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 2, duration: 40,
      words: [{ text: "Earlier", start: 1, end: 2 }], url: null },
  ] as unknown as ProjectMediaAsset[];
  const onSelectImportedTrack = vi.fn();
  const context = { workflow: "speech-to-text", script: "", selectedAssetId: "archive", selectedImportedTrackId: null,
    mediaAssets: [parent, ...tracks], take: { name: "interview.mkv", duration: 40 }, onSelectImportedTrack,
    onScriptChange: vi.fn(), trainingCatalog: { speakers: [], environmentProfiles: [] },
    wordSelection: EMPTY_SELECTION, readingSession: null, obsTimelineActive: false } as unknown as StudioContext;
  render(<ModuleRegistry context={context} id="script" />);
  const list = screen.getByRole("grid", { name: "Lượt nói theo thời gian" });
  expect([...list.querySelectorAll<HTMLElement>(".script-table__row")].map((item) => item.dataset.channelId)).toEqual(["b", "a"]);
  fireEvent.click(screen.getByRole("button", { name: "Mở Desk tại 00:01.00" }));
  expect(onSelectImportedTrack).toHaveBeenCalledWith("b");
});

it("withdraws unchecked imported tracks from the working Timeline", () => {
  const parent = { id: "archive", name: "long.mkv", duration: 4000, importSelected: true } as ProjectMediaAsset;
  const tracks = [
    { id: "a", name: "Desk", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 1, importSelected: false, duration: 4000, text: "", words: [], removedRanges: [], url: null },
    { id: "b", name: "Mic", sourceArchiveAssetId: "archive", sourceArchiveStreamIndex: 2, importSelected: true, duration: 4000, text: "", words: [], removedRanges: [], url: null },
  ] as unknown as ProjectMediaAsset[];
  const context = { workflow: "speech-to-text", mediaAssets: [parent, ...tracks], selectedAssetId: "archive", selectedImportedTrackId: "b",
    take: { name: "Mic", duration: 4000 }, onSelectImportedTrack: vi.fn(), onObsTimelineCutsChange: vi.fn(),
    trainingCatalog: { speakers: [], environmentProfiles: [] }, wordSelection: EMPTY_SELECTION, readingSession: null,
    obsTimelineActive: false } as unknown as StudioContext;
  render(<ModuleRegistry context={context} id="timeline" />);
  expect(screen.getByLabelText("Timeline đa kênh import")).toBeInTheDocument();
  expect(screen.getAllByLabelText(/Waveform Channel/)).toHaveLength(1);
  expect(screen.queryByText("Desk")).not.toBeInTheDocument();
});

it("routes Sound Library bulk deletion to the grouped callback", () => {
  const speakers = ["An", "Bình"].map((name, index) => ({ id: `speaker-${index}`, name, language: "vi", languageId: "vi", region: null, age: null, gender: "male", attributes: {}, color: "#888", createdAt: "2026-09-29T00:00:00Z" }));
  const onDeleteSpeakers = vi.fn();
  const onDeleteSpeaker = vi.fn();
  const context = {
    workflow: "speech-to-text", mediaAssets: [], selectedAssetId: null, mediaBusy: false,
    trainingCatalog: { speakers, environmentProfiles: [], settings: { targetSpeakerIds: [], environmentProfileId: null } },
    profileSchema: null, selectedVoice: "", projectVoices: [], sttEngines: [], asrAdapters: [],
    onDeleteSpeakers, onDeleteSpeaker, onCatalogChange: vi.fn(), onVoiceChange: vi.fn(),
  } as unknown as StudioContext;
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<ModuleRegistry context={context} id="library-panel" />);
    fireEvent.click(screen.getByRole("tab", { name: /Sound Library/ }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn profile An" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn profile Bình" }), { shiftKey: true });
    fireEvent.contextMenu(screen.getByText("An"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Xoá profiles đã chọn" }));
    expect(onDeleteSpeakers).toHaveBeenCalledWith(speakers);
    expect(onDeleteSpeaker).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(1);
  } finally { confirm.mockRestore(); }
});
