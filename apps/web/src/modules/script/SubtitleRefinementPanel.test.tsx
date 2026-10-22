import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { ProjectMediaAsset } from "../../domain/types";
import type { SubtitleAlignmentProposal } from "../../domain/subtitle-alignment";
import { SubtitleRefinementPanel } from "./SubtitleRefinementPanel";
import { ghostIntervals, SubtitleTimingGhosts, SubtitleTimingProvider } from "./SubtitleTimingPreview";

vi.mock("../../api/client", () => ({ api: { getSubtitleAlignment: vi.fn(), previewSubtitleTiming: vi.fn(), subtitleAlignmentEngines: vi.fn(), previewSubtitleEngine: vi.fn(), applySubtitleTimingPreview: vi.fn(), restoreSubtitleAlignment: vi.fn() } }));
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
  vi.mocked(api.subtitleAlignmentEngines).mockResolvedValue({ engines: [
    { id: "mfa", label: "MFA", description: "Forced alignment", license: "MIT", available: true, reason: "", models: [
      { id: "mfa:vi", label: "Vietnamese", language: "vi", license: "MIT", available: true, reason: "" },
      { id: "mfa:en", label: "English", language: "en", license: "MIT", available: true, reason: "" },
    ] },
    { id: "stable-ts", label: "stable-ts", description: "Whisper alignment", license: "MIT", available: true, reason: "", models: ["tiny", "base", "small", "medium", "large-v3"].map((id) => ({ id, label: id, language: "en" as const, license: "MIT", available: true, reason: "" })) },
    { id: "easyaligner", label: "EasyAligner", description: "EasyAligner", license: "MIT", available: true, reason: "", models: [
      { id: "easy:vi", label: "Vietnamese", language: "vi", license: "MIT", available: true, reason: "" },
      { id: "easy:en", label: "English", language: "en", license: "MIT", available: true, reason: "" },
    ] },
  ] });
  vi.mocked(api.previewSubtitleTiming).mockResolvedValue(proposal);
  vi.mocked(api.previewSubtitleEngine).mockResolvedValue(proposal);
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
  await screen.findByRole("option", { name: "MFA" });
  expect(screen.queryByLabelText("Nhập offset thủ thủ công: Offset IN (ms)")).not.toBeInTheDocument();
  expect(api.previewSubtitleEngine).not.toHaveBeenCalled();
  expect(api.applySubtitleTimingPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" }));
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
  await screen.findByRole("option", { name: "MFA" });
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" }));
  await screen.findByRole("img");
  fireEvent.change(screen.getByLabelText("Beam"), { target: { value: "12" } });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply New Timing" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" }));
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
  await screen.findByRole("option", { name: "MFA" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Chỉ các từ đang chọn" }));
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" }));
  await screen.findByRole("img");
  expect(api.previewSubtitleEngine).toHaveBeenCalledWith("project", "track", expect.objectContaining({ indexes: [0] }));
  current.rerender(renderSelection([1]));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply New Timing" })).toBeDisabled();
});

it("shows engine-specific settings without inferring until explicit start and sends the chosen settings", async () => {
  render(view());
  await screen.findByRole("option", { name: "MFA" });
  expect(screen.getByLabelText("Engine căn chỉnh subtitle")).toHaveValue("mfa");
  expect(screen.getByLabelText("Ngôn ngữ MFA")).toHaveValue("vi");
  expect(screen.queryByLabelText("Model stable-ts")).not.toBeInTheDocument();
  expect(api.previewSubtitleEngine).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Ngôn ngữ MFA"), { target: { value: "en" } });
  expect(api.previewSubtitleEngine).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" }));
  await waitFor(() => expect(api.previewSubtitleEngine).toHaveBeenCalledWith("project", "track", expect.objectContaining({
    engineId: "mfa", settings: { language: "en", beam: 10, retryBeam: 40 }, maxMoveMs: 2000,
  })));
  expect(api.previewSubtitleTiming).not.toHaveBeenCalled();
});

it("rejects an engine result that resolves after the engine selection changes", async () => {
  let resolvePreview!: (value: SubtitleAlignmentProposal) => void;
  vi.mocked(api.previewSubtitleEngine).mockReturnValueOnce(new Promise((resolve) => { resolvePreview = resolve; }));
  render(view());
  await screen.findByRole("option", { name: "MFA" });
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" }));
  await waitFor(() => expect(api.previewSubtitleEngine).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Engine căn chỉnh subtitle"), { target: { value: "stable-ts" } });
  resolvePreview(proposal);
  await waitFor(() => expect(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" })).toBeEnabled());
  expect(screen.queryByRole("img", { name: /Ghost Preview/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply New Timing" })).toBeDisabled();
});

it("keeps per-engine settings, clears an existing ghost on engine changes and blocks unavailable engines", async () => {
  vi.mocked(api.subtitleAlignmentEngines).mockResolvedValueOnce({ engines: [
    { id: "mfa", label: "MFA", description: "", license: "MIT", available: true, reason: "", models: [{ id: "mfa:vi", label: "Vietnamese", language: "vi", license: "MIT", available: true, reason: "" }] },
    { id: "stable-ts", label: "stable-ts", description: "", license: "MIT", available: true, reason: "", models: ["tiny", "base", "small", "medium", "large-v3"].map((id) => ({ id, label: id, license: "MIT", available: true, reason: "" })) },
    { id: "easyaligner", label: "EasyAligner", description: "", license: "MIT", available: false, reason: "Missing runtime", models: [] },
  ] });
  render(view());
  await screen.findByRole("option", { name: "MFA" });
  fireEvent.change(screen.getByLabelText("Engine căn chỉnh subtitle"), { target: { value: "stable-ts" } });
  expect(screen.getByLabelText("Model stable-ts")).toHaveValue("base");
  fireEvent.change(screen.getByLabelText("Model stable-ts"), { target: { value: "small" } });
  expect(api.previewSubtitleEngine).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Engine căn chỉnh subtitle"), { target: { value: "mfa" } });
  expect(screen.getByLabelText("Ngôn ngữ MFA")).toHaveValue("vi");
  fireEvent.change(screen.getByLabelText("Engine căn chỉnh subtitle"), { target: { value: "stable-ts" } });
  expect(screen.getByLabelText("Model stable-ts")).toHaveValue("small");
  fireEvent.change(screen.getByLabelText("Engine căn chỉnh subtitle"), { target: { value: "easyaligner" } });
  expect(screen.getByText(/Missing runtime/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bắt đầu tinh chỉnh" })).toBeDisabled();
  expect(screen.queryByRole("img", { name: /Ghost Preview/ })).not.toBeInTheDocument();
});

it("renders saved conflict coordinates after reopen even when lexical order differs from time order", () => {
  render(<SubtitleTimingGhosts assetId="track" words={[{ text: "moved", start: 2, end: 3, subtitleTimingConflict: true },
    { text: "unchanged", start: 1.8, end: 2.2 }]} start={0} span={10} />);
  expect(screen.getByRole("img", { name: "Xung đột timing · 1 từ" })).toBeInTheDocument();
  expect(paint).toHaveBeenCalledWith(200, 1, 100, 21);
});
