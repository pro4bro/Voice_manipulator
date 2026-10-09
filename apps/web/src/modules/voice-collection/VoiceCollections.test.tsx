import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { VoiceCollection, VoiceCollectionImport } from "../../domain/types";
import { VoiceCollections } from "./VoiceCollections";
import { CollectionDialog } from "./CollectionDialog";

vi.mock("../../api/client", () => ({ api: { listVoiceCollections: vi.fn(), createVoiceCollection: vi.fn(), importCollectionVoice: vi.fn(), addVoiceToCollection: vi.fn(), getOmniVoiceProfileSchema: vi.fn() } }));
const collection = { id: "collection-1", name: "Giọng miền Nam", properties: { language: "Tiếng Việt", languageId: "vi", region: "Miền Nam", gender: "female", age: "adult", attributes: {} }, entries: [{ id: "entry-1", sourceProjectId: "source", sourceProjectName: "Project gốc", voice: { id: "voice-1", name: "Giọng An", kind: "lora" }, speaker: { id: "speaker-1", name: "An" } }] } as VoiceCollection;
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

it("flushes project edits before importing and returns the saved voice/profile to the workspace", async () => {
  const result = { voice: { id: "imported-voice" }, speaker: { id: "imported-speaker" }, catalog: { speakers: [] } } as unknown as VoiceCollectionImport;
  vi.mocked(api.importCollectionVoice).mockResolvedValue(result);
  const prepare = vi.fn().mockResolvedValue(undefined); const imported = vi.fn();
  render(<VoiceCollections projectId="destination" onPrepareExport={prepare} onImported={imported} />);
  fireEvent.click(await screen.findByRole("button", { name: "Import voice" }));
  await waitFor(() => expect(imported).toHaveBeenCalledWith(result));
  expect(api.importCollectionVoice).toHaveBeenCalledWith("collection-1", "entry-1", "destination");
  expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.importCollectionVoice).mock.invocationCallOrder[0]);
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
