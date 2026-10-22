import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { ProjectMediaAsset } from "../../domain/types";
import { ModuleRegistry, type StudioContext } from "./ModuleRegistry";
import { SubtitleTimingProvider } from "../script/SubtitleTimingPreview";
import { SUBTITLE_ALIGNMENT_METHODS } from "../../domain/subtitle-alignment";

vi.mock("../../api/client", () => ({ api: { getSubtitleAlignment: vi.fn(async () => null), previewSubtitleTiming: vi.fn(), subtitleAlignmentEngines: vi.fn(), previewSubtitleEngine: vi.fn() } }));

it("opens all refinement methods from the Input right-column module on any finalized project", async () => {
  const asset = { id: "arbitrary", name: "Interview.wav", duration: 10, text: "hello", words: [{ text: "hello", start: 1, end: 2 }], transcriptionStatus: "complete", updatedAt: "now" } as ProjectMediaAsset;
  const context = { projectId: "not-conviction", workflow: "speech-to-text", mediaAssets: [asset], selectedAssetId: asset.id,
    selectedImportedTrackId: null, wordSelection: { indexes: [0], anchor: 0 }, onPrepareSubtitleAlignment: vi.fn(async () => {}),
    onSubtitleAlignmentApplied: vi.fn() } as unknown as StudioContext;
  vi.mocked(api.previewSubtitleTiming).mockResolvedValue({ id: "p", assetId: asset.id, state: "proposed", stale: false, mode: "pipeline", inputSignature: "x", startOffsetMs: 0, endOffsetMs: 0, rows: [], summary: { ready: 0, review: 0, locked: 0, unchanged: 0 }, diagnostics: {}, aligner: { status: "unavailable" } });
  vi.mocked(api.subtitleAlignmentEngines).mockResolvedValue({ engines: [{ id: "mfa", label: "MFA", description: "align", license: "MIT", available: true, reason: "", models: [{ id: "mfa:vi", label: "Vietnamese", language: "vi", license: "MIT", available: true, reason: "" }] }] });
  render(<SubtitleTimingProvider><ModuleRegistry id="subtitle-refinement" context={context} /></SubtitleTimingProvider>);
  expect(screen.getByRole("heading", { name: "Tinh chỉnh subtitle" })).toBeInTheDocument();
  await screen.findByLabelText("Engine căn chỉnh subtitle");
  await waitFor(() => expect(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" })).toBeEnabled());
  fireEvent.click(screen.getByText("Tùy chọn nâng cao: phương pháp bổ sung"));
  for (const method of SUBTITLE_ALIGNMENT_METHODS) expect(screen.getByRole("checkbox", { name: method.label })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Nhập offset thủ công" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Kiểm tra độ lệch chữ / voice" }));
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" }));
  await waitFor(() => expect(api.previewSubtitleEngine).toHaveBeenCalledWith("not-conviction", "arbitrary", expect.objectContaining({ engineId: "mfa", methods: expect.arrayContaining([expect.objectContaining({ mode: "diagnose" })]) })));
});
