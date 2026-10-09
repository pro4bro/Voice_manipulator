import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { VoiceCollection, VoiceCollectionImport } from "../../domain/types";
import { VoiceCollections } from "./VoiceCollections";
import { CollectionDialog } from "./CollectionDialog";

vi.mock("../../api/client", () => ({ api: { listVoiceCollections: vi.fn(), createVoiceCollection: vi.fn(), importCollectionVoice: vi.fn(), addVoiceToCollection: vi.fn(), getOmniVoiceProfileSchema: vi.fn() } }));
const collection = { id: "collection-1", name: "Giọng miền Nam", properties: { language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", gender: "female", age: "adult", attributes: {} }, entries: [{ id: "entry-1", sourceProjectId: "source", sourceProjectName: "Project gốc", voice: { id: "voice-1", name: "Giọng An", kind: "lora" }, speaker: { id: "speaker-1", name: "An" } }] } as VoiceCollection;
const makeEntry = (id: string, sourceProjectId: string, sourceProjectName: string, voiceId: string, voiceName: string, kind: VoiceCollection["entries"][number]["voice"]["kind"], speakerId: string, speakerName: string): VoiceCollection["entries"][number] => ({
  ...collection.entries[0], id, sourceProjectId, sourceProjectName,
  voice: { ...collection.entries[0].voice, id: voiceId, name: voiceName, kind },
  speaker: { ...collection.entries[0].speaker, id: speakerId, name: speakerName },
});
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.listVoiceCollections).mockResolvedValue([collection]); vi.mocked(api.getOmniVoiceProfileSchema).mockResolvedValue({ languages: [], facets: [] } as never); });

it("creates a collection with shared profile classifications from the inline New Collection option", async () => {
  vi.mocked(api.createVoiceCollection).mockResolvedValue({ ...collection, id: "collection-2", name: "Kho mới", entries: [] });
  render(<VoiceCollections schema={null} />);
  await screen.findByText("Giọng An");
  fireEvent.change(screen.getByLabelText("Chọn Voice Collection"), { target: { value: "__new__" } });
  fireEvent.change(screen.getByLabelText("Tên collection"), { target: { value: "Kho mới" } });
  fireEvent.change(screen.getByLabelText("Miền / vùng"), { target: { value: "Miền Trung" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo collection" }));
  await waitFor(() => expect(api.createVoiceCollection).toHaveBeenCalledWith("Kho mới", expect.objectContaining({ region: "Miền Trung" })));
  await waitFor(() => expect(screen.getByLabelText("Chọn Voice Collection")).toHaveValue("collection-2"));
});

it("renders collection entries for browsing without project import selection", async () => {
  render(<VoiceCollections />);
  await screen.findByText("Giọng An");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Import/ })).not.toBeInTheDocument();
});

it("groups exact speaker/project tuples, lets a profile select all, and submits only chosen models serially", async () => {
  const result = { voice: { id: "imported-voice" }, speaker: { id: "imported-speaker" }, catalog: { speakers: [] } } as unknown as VoiceCollectionImport;
  const entries = [
    collection.entries[0],
    makeEntry("entry-2", "source", "Project gốc", "voice-2", "Giọng An full", "full", "speaker-1", "An"),
    makeEntry("entry-3", "other", "Project khác", "voice-3", "Giọng An", "lora", "speaker-99", "An"),
  ];
  vi.mocked(api.listVoiceCollections).mockResolvedValue([{ ...collection, entries }]);
  vi.mocked(api.importCollectionVoice).mockResolvedValue(result);
  const prepare = vi.fn().mockResolvedValue(undefined); const imported = vi.fn();
  render(<VoiceCollections projectId="destination" onPrepareExport={prepare} onImported={imported} />);
  const sourceProfile = await screen.findByRole("checkbox", { name: "Chọn toàn bộ model của An · Project gốc" });
  expect(screen.getByRole("button", { name: "Thu gọn model An · Project gốc" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Thu gọn model An · Project khác" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(sourceProfile);
  const importButton = screen.getByRole("button", { name: "Import đã chọn (2)" });
  fireEvent.click(importButton);
  await waitFor(() => expect(imported).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.importCollectionVoice).mock.calls).toEqual([
    ["collection-1", "entry-1", "destination"],
    ["collection-1", "entry-2", "destination"],
  ]);
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.importCollectionVoice).mock.invocationCallOrder[0]);
  expect(vi.mocked(api.importCollectionVoice).mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[1]);
  expect(prepare.mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(api.importCollectionVoice).mock.invocationCallOrder[1]);
  expect(screen.getByRole("button", { name: "Import đã chọn (0)" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Chọn toàn bộ model của An · Project khác" })).not.toBeChecked();
});

it("allows selective model import and header partial selection toggles to all then none", async () => {
  vi.mocked(api.listVoiceCollections).mockResolvedValue([{ ...collection, entries: [
    collection.entries[0],
    makeEntry("entry-2", "source", "Project gốc", "voice-2", "Giọng An full", "full", "speaker-1", "An"),
  ] }]);
  render(<VoiceCollections projectId="destination" />);
  const first = await screen.findByRole("checkbox", { name: "Chọn model Giọng An · An · Project gốc" });
  const second = screen.getByRole("checkbox", { name: "Chọn model Giọng An full · An · Project gốc" });
  const profile = screen.getByRole("checkbox", { name: "Chọn toàn bộ model của An · Project gốc" });
  fireEvent.click(first);
  expect(profile).toBePartiallyChecked();
  expect(screen.getByRole("button", { name: "Import đã chọn (1)" })).toBeEnabled();
  fireEvent.click(profile);
  expect(first).toBeChecked();
  expect(second).toBeChecked();
  fireEvent.click(profile);
  expect(first).not.toBeChecked();
  expect(second).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Import đã chọn (0)" })).toBeDisabled();
});

it("keeps failed and unprocessed choices selected after a partial import and retries only those", async () => {
  const entries = [collection.entries[0],
    makeEntry("entry-2", "source", "Project gốc", "voice-2", "Giọng An full", "full", "speaker-1", "An"),
    makeEntry("entry-3", "source", "Project gốc", "voice-3", "Giọng An clone", "clone", "speaker-1", "An")];
  vi.mocked(api.listVoiceCollections).mockResolvedValue([{ ...collection, entries }]);
  const result = { voice: { id: "imported" }, speaker: { id: "speaker" }, catalog: { speakers: [] } } as unknown as VoiceCollectionImport;
  vi.mocked(api.importCollectionVoice).mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("Artifact copy failed"));
  const imported = vi.fn(); const prepare = vi.fn().mockResolvedValue(undefined);
  render(<VoiceCollections projectId="destination" onPrepareExport={prepare} onImported={imported} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Chọn toàn bộ model của An · Project gốc" }));
  fireEvent.click(screen.getByRole("button", { name: "Import đã chọn (3)" }));
  await screen.findByRole("alert");
  expect(imported).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert")).toHaveTextContent(/Đã import 1.*còn 2.*Artifact copy failed/i);
  expect(screen.getByRole("checkbox", { name: "Chọn model Giọng An · An · Project gốc" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Chọn model Giọng An full · An · Project gốc" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Chọn model Giọng An clone · An · Project gốc" })).toBeChecked();
  expect(api.importCollectionVoice).toHaveBeenCalledTimes(2);
  vi.mocked(api.importCollectionVoice).mockResolvedValue(result);
  fireEvent.click(screen.getByRole("button", { name: "Import đã chọn (2)" }));
  await waitFor(() => expect(api.importCollectionVoice).toHaveBeenCalledTimes(4));
  expect(vi.mocked(api.importCollectionVoice).mock.calls.slice(2)).toEqual([
    ["collection-1", "entry-2", "destination"], ["collection-1", "entry-3", "destination"],
  ]);
  expect(prepare).toHaveBeenCalledTimes(4);
});

it("locks entry selection while importing and resets selection and expansion on collection switch", async () => {
  let resolveImport!: (value: VoiceCollectionImport) => void;
  const secondCollection = { ...collection, id: "collection-2", name: "Khác", entries: [
    makeEntry("entry-other", "other", "Khác", "voice-other", "Voice khác", "lora", "speaker-other", "Bình"),
  ] };
  vi.mocked(api.listVoiceCollections).mockResolvedValue([collection, secondCollection]);
  vi.mocked(api.importCollectionVoice).mockImplementation(() => new Promise((resolve) => { resolveImport = resolve; }));
  render(<VoiceCollections projectId="destination" />);
  const first = await screen.findByRole("checkbox", { name: "Chọn model Giọng An · An · Project gốc" });
  fireEvent.click(first);
  fireEvent.click(screen.getByRole("button", { name: "Import đã chọn (1)" }));
  await waitFor(() => expect(api.importCollectionVoice).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("checkbox", { name: "Chọn toàn bộ model của An · Project gốc" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Thu gọn model An · Project gốc" })).toBeDisabled();
  expect(screen.getByLabelText("Chọn Voice Collection")).toBeDisabled();
  resolveImport({ voice: { id: "imported" }, speaker: { id: "speaker" }, catalog: { speakers: [] } } as unknown as VoiceCollectionImport);
  await screen.findByText("Đã import 1 voice.");
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn model Giọng An · An · Project gốc" }));
  fireEvent.click(screen.getByRole("button", { name: "Thu gọn model An · Project gốc" }));
  fireEvent.change(screen.getByLabelText("Chọn Voice Collection"), { target: { value: "collection-2" } });
  expect(await screen.findByRole("checkbox", { name: "Chọn toàn bộ model của Bình · Khác" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Import đã chọn (0)" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Chọn Voice Collection"), { target: { value: "collection-1" } });
  expect(screen.getByRole("button", { name: "Thu gọn model An · Project gốc" })).toHaveAttribute("aria-expanded", "true");
});

it("does not expose import selection in collection export mode", async () => {
  render(<VoiceCollections projectId="destination" exportVoiceId="voice-to-export" />);
  await screen.findByText("Giọng An");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Import đã chọn/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add to Collection" })).toBeEnabled();
});

it("keeps a collection dialog open while copying and reports artifact rejection without success", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.addVoiceToCollection).mockImplementation(() => new Promise((_resolve, rejecter) => { reject = rejecter; }));
  const close = vi.fn();
  render(<CollectionDialog projectId="source" exportVoiceId="voice-1" onClose={close} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to Collection" }));
  expect(screen.getByRole("button", { name: "Đóng" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  await waitFor(() => expect(api.addVoiceToCollection).toHaveBeenCalled());
  reject(new Error("Required adapter is missing"));
  await screen.findByRole("alert");
  expect(screen.queryByText("Đã thêm voice vào collection.")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Đóng" })).toBeEnabled());
});
