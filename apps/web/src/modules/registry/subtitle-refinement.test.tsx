import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { ProjectMediaAsset } from "../../domain/types";
import { ModuleRegistry, type StudioContext } from "./ModuleRegistry";

vi.mock("../../api/client", () => ({ api: { getSubtitleAlignment: vi.fn(async () => null), analyzeSubtitleAlignment: vi.fn() } }));

it("opens all refinement methods from the Input right-column module on any finalized project", async () => {
  const asset = { id: "arbitrary", name: "Interview.wav", duration: 10, text: "hello", words: [{ text: "hello", start: 1, end: 2 }], transcriptionStatus: "complete", updatedAt: "now" } as ProjectMediaAsset;
  const context = { projectId: "not-conviction", workflow: "speech-to-text", mediaAssets: [asset], selectedAssetId: asset.id,
    selectedImportedTrackId: null, wordSelection: { indexes: [0], anchor: 0 }, onPrepareSubtitleAlignment: vi.fn(async () => {}),
    onSubtitleAlignmentApplied: vi.fn() } as unknown as StudioContext;
  vi.mocked(api.analyzeSubtitleAlignment).mockResolvedValue({ id: "p", assetId: asset.id, state: "proposed", stale: false, mode: "diagnose", inputSignature: "x", startOffsetMs: 0, endOffsetMs: 0, rows: [], summary: { ready: 0, review: 0, locked: 0, unchanged: 0 }, diagnostics: {}, aligner: { status: "unavailable" } });
  render(<ModuleRegistry id="subtitle-refinement" context={context} />);
  expect(screen.getByRole("heading", { name: "Tinh chỉnh subtitle" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mở tinh chỉnh subtitle" }));
  const methods = screen.getByLabelText("Phương pháp tinh chỉnh");
  expect(methods.querySelectorAll("option")).toHaveLength(8);
  fireEvent.change(methods, { target: { value: "diagnose" } });
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra độ lệch" }));
  await waitFor(() => expect(api.analyzeSubtitleAlignment).toHaveBeenCalledWith("not-conviction", "arbitrary", expect.objectContaining({ mode: "diagnose" })));
});
