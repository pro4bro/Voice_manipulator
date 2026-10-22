import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { ProjectMediaAsset } from "../../domain/types";
import type { SubtitleAlignmentProposal } from "../../domain/subtitle-alignment";
import { SubtitleRefinementPanel } from "./SubtitleRefinementPanel";
import { ghostIntervals, SubtitleTimingGhosts, SubtitleTimingProvider } from "./SubtitleTimingPreview";

vi.mock("../../api/client", () => ({ api: { getSubtitleAlignment: vi.fn(), previewSubtitleTiming: vi.fn(), applySubtitleTimingPreview: vi.fn(), restoreSubtitleAlignment: vi.fn() } }));
const asset = { id: "track", name: "Interview", text: "hello stay", duration: 10, transcriptionStatus: "complete", words: [
  { text: "hello", start: 1, end: 2 }, { text: "stay", start: 2.4, end: 2.8, timingSource: "manual" },
] } as ProjectMediaAsset;
const proposal: SubtitleAlignmentProposal = { id: "p", assetId: "track", mode: "pipeline", inputSignature: "source", state: "proposed", stale: false,
  startOffsetMs: 0, endOffsetMs: 0, diagnostics: { conflictIndexes: [0, 1] }, aligner: { status: "not-used" }, summary: { ready: 0, review: 1, locked: 1, unchanged: 0 }, rows: [
    { index: 0, text: "hello", before: { start: 1, end: 2 }, after: { start: 1.5, end: 2.5 }, status: "review", method: "pipeline", reasons: [], score: null },
    { index: 1, text: "stay", before: { start: 2.4, end: 2.8 }, after: { start: 2.4, end: 2.8 }, status: "locked", method: "manual", reasons: [], score: null },
  ] };
const paint = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSubtitleAlignment).mockResolvedValue(null);
  vi.mocked(api.previewSubtitleTiming).mockResolvedValue(proposal);
  vi.mocked(api.applySubtitleTimingPreview).mockResolvedValue({ asset: { ...asset, words: [{ ...asset.words[0], start: 1.5, end: 2.5 }, asset.words[1]] }, proposal: { ...proposal, state: "applied" } });
  vi.mocked(api.restoreSubtitleAlignment).mockResolvedValue({ asset, proposal: { ...proposal, state: "restored" } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ scale: vi.fn(), fillRect: paint, strokeRect: vi.fn(), save: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillText: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function view(input = asset, onApplied = vi.fn()) {
  return <SubtitleTimingProvider><SubtitleRefinementPanel projectId="project" assets={[input]} prepare={vi.fn(async () => {})} onApplied={onApplied} />
    <SubtitleTimingGhosts assetId={input.id} words={input.words} start={0} span={10} /></SubtitleTimingProvider>;
}

it("shows editable offsets, contextual ghost coordinates and one bulk Apply without word checklists", async () => {
  const applied = vi.fn(); render(view(asset, applied));
  fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
  fireEvent.change(screen.getByLabelText("Nhập offset thủ công: Offset IN (ms)"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("Nhập offset thủ công: Offset OUT (ms)"), { target: { value: "500" } });
  expect(api.previewSubtitleTiming).not.toHaveBeenCalled();
  expect(api.applySubtitleTimingPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Ghost Preview" }));
  expect(await screen.findByRole("img", { name: "Ghost Preview · 1 từ · 1 từ xung đột" })).toBeInTheDocument();
  expect(paint).toHaveBeenCalledWith(150, 1, 100, 21);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText(/2 từ xung đột timing/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apply New Timing" }));
  await waitFor(() => expect(api.applySubtitleTimingPreview).toHaveBeenCalledWith("project", "track", "p"));
  expect(applied).toHaveBeenCalledWith(expect.objectContaining({ words: [expect.objectContaining({ start: 1.5 }), asset.words[1]] }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Khôi phục timing" }));
  await waitFor(() => expect(api.restoreSubtitleAlignment).toHaveBeenCalledWith("project", "track", "p"));
});

it("invalidates Ghost and Apply after parameters or source change", async () => {
  const current = render(view());
  fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
  fireEvent.click(screen.getByRole("button", { name: "Ghost Preview" }));
  await screen.findByRole("img");
  fireEvent.change(screen.getByLabelText("Nhập offset thủ công: Offset IN (ms)"), { target: { value: "100" } });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply New Timing" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Ghost Preview" }));
  await screen.findByRole("img");
  current.rerender(view({ ...asset, words: [{ ...asset.words[0], text: "changed" }, asset.words[1]] }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply New Timing" })).toBeDisabled();
});

it("uses source-clock positions, excludes unchanged words and rejects a different track or source revision", () => {
  const preview = { assetId: "track", sourceWordsKey: JSON.stringify(asset.words), rows: proposal.rows, conflictIndexes: [0, 1] };
  expect(ghostIntervals(preview, "track", asset.words, 1, 5)).toEqual([{ index: 0, text: "hello", left: .1, width: .2, conflict: true }]);
  expect(ghostIntervals(preview, "other-track", asset.words, 0, 10)).toEqual([]);
  expect(ghostIntervals(preview, "track", [], 0, 10)).toEqual([]);
});

it("clears a selection-only preview when the selected words change", async () => {
  const input = { ...asset, updatedAt: "rev-1" };
  const renderSelection = (indexes: number[]) => <SubtitleTimingProvider><SubtitleRefinementPanel projectId="project" assets={[input]}
    prepare={vi.fn(async () => {})} onApplied={vi.fn()} selection={{ indexes, anchor: 0, scope: { kind: "asset", id: "track", revision: "rev-1" } }} />
    <SubtitleTimingGhosts assetId="track" words={input.words} start={0} span={10} /></SubtitleTimingProvider>;
  const current = render(renderSelection([0]));
  fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Chỉ các từ đang chọn" }));
  fireEvent.click(screen.getByRole("button", { name: "Ghost Preview" }));
  await screen.findByRole("img");
  expect(api.previewSubtitleTiming).toHaveBeenCalledWith("project", "track", expect.any(Array), [0]);
  current.rerender(renderSelection([1]));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply New Timing" })).toBeDisabled();
});

it("renders saved conflict coordinates after reopen even when lexical order differs from time order", () => {
  render(<SubtitleTimingGhosts assetId="track" words={[{ text: "moved", start: 2, end: 3, subtitleTimingConflict: true },
    { text: "unchanged", start: 1.8, end: 2.2 }]} start={0} span={10} />);
  expect(screen.getByRole("img", { name: "Xung đột timing · 1 từ" })).toBeInTheDocument();
  expect(paint).toHaveBeenCalledWith(200, 1, 100, 21);
});
