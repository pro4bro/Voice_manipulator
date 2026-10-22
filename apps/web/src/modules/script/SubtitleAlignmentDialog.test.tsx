import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { SubtitleAlignmentProposal } from "../../domain/subtitle-alignment";
import type { ProjectMediaAsset } from "../../domain/types";
import type { WordSelection } from "../../domain/word-selection";
import { SubtitleAlignmentControl } from "./SubtitleAlignmentDialog";

vi.mock("../../api/client", () => ({ api: {
  getSubtitleAlignment: vi.fn(), analyzeSubtitleAlignment: vi.fn(), applySubtitleAlignment: vi.fn(), restoreSubtitleAlignment: vi.fn(),
} }));

const asset = (id = "track-a", words: Array<{ text: string; start: number; end: number; timingSource?: string }> = [{ text: "xin", start: 1, end: 1.2, timingSource: "faster-whisper-dtw" }]) => ({
  id, name: id, sourceExtension: "wav", mediaKind: "audio", sourcePath: "audio.wav", studioItemId: null, url: null, duration: 8, sampleRate: 24000,
  text: words.map((word) => word.text).join(" "), words, origin: "import", status: "ready", transcriptionStatus: "complete", transcriptionSelected: true,
  transcriptionError: null, aiReviewStatus: "pending", trainingSelected: false, captureTier: "import", speakerProfileIds: [], environmentProfileIds: [],
  emotion: "normal", createdAt: "", updatedAt: "", revisions: [],
}) as unknown as ProjectMediaAsset;
function proposal(rows: SubtitleAlignmentProposal["rows"], state: SubtitleAlignmentProposal["state"] = "proposed"): SubtitleAlignmentProposal {
  return { id: "proposal-1", assetId: "track-a", state, stale: false, inputSignature: "server-signature", mode: "auto", startOffsetMs: 0, endOffsetMs: 0,
    rows, summary: { ready: 1, review: 1, locked: 1, unchanged: 0 }, diagnostics: {}, aligner: { status: "ready" } };
}
const rows: SubtitleAlignmentProposal["rows"] = [
  { index: 0, text: "xin", before: { start: 1, end: 1.2 }, after: { start: .95, end: 1.18 }, status: "ready", method: "acoustic", reasons: [], score: .9 },
  { index: 1, text: "chào", before: { start: 1.3, end: 1.5 }, after: { start: 1.28, end: 1.52 }, status: "review", method: "edge", reasons: ["uncertain"], score: .4 },
  { index: 2, text: "bạn", before: { start: 1.6, end: 1.8 }, after: { start: 1.6, end: 1.8 }, status: "locked", method: "manual", reasons: [], score: null },
];
const selection: WordSelection = { indexes: [0, 1], anchor: 1, scope: { kind: "asset", id: "track-a", revision: "rev-1" } };
const props = (overrides: Partial<Parameters<typeof SubtitleAlignmentControl>[0]> = {}) => ({ projectId: "project", assets: [asset()], selection, prepare: vi.fn(async () => {}), onApplied: vi.fn(), ...overrides });
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ points: [{ min: -.2, max: .3 }] }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSubtitleAlignment).mockResolvedValue(null);
  vi.mocked(api.analyzeSubtitleAlignment).mockResolvedValue(proposal(rows));
  vi.mocked(api.applySubtitleAlignment).mockResolvedValue({ asset: asset(), proposal: proposal(rows, "applied") });
  vi.mocked(api.restoreSubtitleAlignment).mockResolvedValue({ asset: asset(), proposal: proposal(rows, "restored") });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("SubtitleAlignmentControl", () => {
  it("opens an Input ghost as read-only with a valid legacy method control", async () => {
    vi.mocked(api.getSubtitleAlignment).mockResolvedValue({ ...proposal(rows), mode: "pipeline" });
    render(<SubtitleAlignmentControl {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    await screen.findByText(/Ghost Preview từ Input/);
    expect(screen.getByLabelText("Phương pháp tinh chỉnh")).toHaveValue("auto");
    expect(screen.getByLabelText("IN từ 1")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Áp dụng 1 từ đã chọn" })).toBeDisabled();
  });
  it("restores the saved method and offsets before making another proposal", async () => {
    vi.mocked(api.getSubtitleAlignment).mockResolvedValue({ ...proposal(rows), mode: "offset", startOffsetMs: 80, endOffsetMs: 110 });
    render(<SubtitleAlignmentControl {...props({ selection: undefined })} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    await waitFor(() => expect(screen.getByLabelText("Phương pháp tinh chỉnh")).toHaveValue("offset"));
    expect(screen.getByLabelText("Offset IN (ms)")).toHaveValue(80);
    expect(screen.getByLabelText("Offset OUT (ms)")).toHaveValue(110);
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await waitFor(() => expect(api.analyzeSubtitleAlignment).toHaveBeenCalledWith("project", "track-a", { mode: "offset", startOffsetMs: 80, endOffsetMs: 110 }));
  });

  it("shows drift evidence and keeps diagnosis read-only even with editable proposal rows", async () => {
    const diagnostic = { ...proposal(rows), mode: "diagnose" as const };
    diagnostic.diagnostics.drift = { status: "large-drift", scopeWords: 3, comparedWords: 2, unassessedCount: 1,
      evidenceCoverage: 2 / 3, largeCount: 1, severeCount: 1, quietCount: 0, invalidCount: 0,
      largeThresholdMs: 250, severeThresholdMs: 500, suspects: [{ index: 0, text: "xin", start: 1, end: 1.2,
        ctcStart: 1.7, ctcEnd: 1.9, startOffsetMs: 700, endOffsetMs: 700, flags: ["severe-displacement"], waveformSupport: true }] };
    vi.mocked(api.analyzeSubtitleAlignment).mockResolvedValue(diagnostic);
    render(<SubtitleAlignmentControl {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.change(screen.getByLabelText("Phương pháp tinh chỉnh"), { target: { value: "diagnose" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra độ lệch" }));
    expect(await screen.findByText("Có dấu hiệu chữ lệch xa voice")).toBeInTheDocument();
    expect(screen.getByText(/Đối chiếu được 2\/3 từ/)).toBeInTheDocument();
    expect(screen.getByLabelText("IN từ 1")).toBeDisabled();
    expect(screen.getByLabelText("Chọn từ xin 1")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Áp dụng 1 từ đã chọn" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nghe mốc đối chiếu CTC" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Phương pháp tinh chỉnh"), { target: { value: "waveform" } });
    expect(screen.queryByText("Có dấu hiệu chữ lệch xa voice")).not.toBeInTheDocument();
    expect(api.applySubtitleAlignment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await waitFor(() => expect(api.analyzeSubtitleAlignment).toHaveBeenLastCalledWith("project", "track-a", expect.objectContaining({ mode: "waveform" })));
  });

  it("prefills a measured common offset without analyzing or applying until requested", async () => {
    const result = proposal(rows);
    result.diagnostics.local_offset_group = { anchor_count: 12, median_start_offset: .133, median_end_offset: .099 };
    vi.mocked(api.analyzeSubtitleAlignment).mockResolvedValue(result);
    render(<SubtitleAlignmentControl {...props({ selection: undefined })} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo đề xuất" }));
    fireEvent.click(await screen.findByRole("button", { name: "Thử offset chung +116 ms" }));
    expect(screen.getByLabelText("Offset IN (ms)")).toHaveValue(116);
    expect(screen.getByLabelText("Offset OUT (ms)")).toHaveValue(116);
    expect(api.analyzeSubtitleAlignment).toHaveBeenCalledTimes(1);
    expect(api.applySubtitleAlignment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await waitFor(() => expect(api.analyzeSubtitleAlignment).toHaveBeenLastCalledWith("project", "track-a", { mode: "offset", startOffsetMs: 116, endOffsetMs: 116 }));
  });

  it("requires confirmation again when a ready proposal is edited and displays PCM landmarks", async () => {
    const result = proposal(rows);
    result.diagnostics.waveform_landmarks = [{ time: 1, kind: "onset", strength: .9 }];
    vi.mocked(api.analyzeSubtitleAlignment).mockResolvedValue(result);
    render(<SubtitleAlignmentControl {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo đề xuất" }));
    await screen.findByText(/Âm tăng rõ · 1.000s/);
    fireEvent.change(screen.getByLabelText("IN từ 1"), { target: { value: "0.98" } });
    expect(screen.getByRole("button", { name: "Áp dụng 0 từ đã chọn" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã nghe và xác nhận mốc" }));
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng 1 từ đã chọn" }));
    await waitFor(() => expect(api.applySubtitleAlignment).toHaveBeenCalledWith("project", "track-a", "proposal-1", [0], [{ index: 0, start: .98, end: 1.18, reviewed: true }]));
  });

  it("does not restart the audition timer when playback resolves after closing", async () => {
    let resolvePlay: (() => void) | undefined;
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => new Promise<void>((resolve) => { resolvePlay = resolve; }));
    render(<SubtitleAlignmentControl {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo đề xuất" }));
    await screen.findByText(/Sẵn sàng/);
    fireEvent.click(screen.getByRole("button", { name: "Nghe trước" }));
    fireEvent.click(screen.getByRole("button", { name: "Đóng căn chỉnh subtitle" }));
    const timer = vi.spyOn(globalThis, "setInterval");
    await act(async () => { resolvePlay?.(); });
    expect(timer).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends independent offsets and only the matching selected indexes", async () => {
    const input = props(); render(<SubtitleAlignmentControl {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.change(await screen.findByLabelText("Phương pháp tinh chỉnh"), { target: { value: "offset" } });
    fireEvent.change(screen.getByLabelText("Offset IN (ms)"), { target: { value: "-80" } });
    fireEvent.change(screen.getByLabelText("Offset OUT (ms)"), { target: { value: "35" } });
    fireEvent.click(screen.getByLabelText("Từ đang chọn (2)"));
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await waitFor(() => expect(api.analyzeSubtitleAlignment).toHaveBeenCalledWith("project", "track-a", { mode: "offset", startOffsetMs: -80, endOffsetMs: 35, indexes: [0, 1] }));
    expect(input.prepare).toHaveBeenCalledWith("track-a");
    expect(await screen.findByText("Cần nghe lại")).toBeInTheDocument();
    expect(screen.getByLabelText("Chọn từ bạn 3")).toBeDisabled();
  });

  it("requires heard confirmation and valid manual bounds before applying review rows", async () => {
    render(<SubtitleAlignmentControl {...props({ selection: undefined })} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await screen.findByText(/Sẵn sàng/);
    fireEvent.click(screen.getByLabelText("Chọn từ xin 1"));
    const reviewWord = screen.getByRole("button", { name: /chào/ }); fireEvent.click(reviewWord);
    expect(screen.getByRole("button", { name: "Áp dụng 0 từ đã chọn" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã nghe và xác nhận mốc" }));
    fireEvent.change(screen.getByLabelText("IN từ 2"), { target: { value: "1.31" } });
    fireEvent.change(screen.getByLabelText("OUT từ 2"), { target: { value: "1.49" } });
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã nghe và xác nhận mốc" }));
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng 1 từ đã chọn" }));
    await waitFor(() => expect(api.applySubtitleAlignment).toHaveBeenCalledWith("project", "track-a", "proposal-1", [1], [{ index: 1, start: 1.31, end: 1.49, reviewed: true }]));
  });

  it("clears selected proposals when the Script changes and fences a late analysis after close", async () => {
    const deferred: { resolve?: (value: SubtitleAlignmentProposal) => void } = {};
    vi.mocked(api.analyzeSubtitleAlignment).mockImplementation(() => new Promise((resolve) => { deferred.resolve = resolve; }));
    const input = props(); const view = render(<SubtitleAlignmentControl {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await waitFor(() => expect(api.analyzeSubtitleAlignment).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Đóng căn chỉnh subtitle" }));
    await act(async () => { deferred.resolve?.(proposal(rows)); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.mocked(api.analyzeSubtitleAlignment).mockResolvedValue(proposal(rows));
    view.rerender(<SubtitleAlignmentControl {...input} assets={[asset("track-a", [{ text: "xin", start: 1.05, end: 1.2 }])]} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await screen.findByText(/Sẵn sàng/);
    view.rerender(<SubtitleAlignmentControl {...input} assets={[asset("track-a", [{ text: "xin", start: 1.06, end: 1.2 }])]} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/đổi/i);
    expect(screen.getByRole("button", { name: "Áp dụng 0 từ đã chọn" })).toBeDisabled();
  });

  it("delivers saved assets on apply/restore and prepares both mutations", async () => {
    const input = props({ selection: undefined }); render(<SubtitleAlignmentControl {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo đề xuất" }));
    await screen.findByText(/Sẵn sàng/);
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng 1 từ đã chọn" }));
    await waitFor(() => expect(input.onApplied).toHaveBeenCalledWith(expect.objectContaining({ id: "track-a" })));
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục bản đã áp dụng" }));
    await waitFor(() => expect(api.restoreSubtitleAlignment).toHaveBeenCalledWith("project", "track-a", "proposal-1"));
    expect(input.prepare).toHaveBeenCalledTimes(3); // analyze, apply, restore
    expect(input.onApplied).toHaveBeenCalledTimes(2);
  });

  it("delivers an in-flight applied asset after switching tracks without replacing the new track view", async () => {
    let resolveApply: ((value: { asset: ProjectMediaAsset; proposal: SubtitleAlignmentProposal }) => void) | undefined;
    vi.mocked(api.applySubtitleAlignment).mockImplementation(() => new Promise((resolve) => { resolveApply = resolve; }));
    const input = props({ assets: [asset(), asset("track-b")], selection: undefined }); render(<SubtitleAlignmentControl {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo đề xuất" }));
    await screen.findByText(/Sẵn sàng/);
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng 1 từ đã chọn" }));
    await waitFor(() => expect(api.applySubtitleAlignment).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Track căn chỉnh"), { target: { value: "track-b" } });
    await act(async () => { resolveApply?.({ asset: asset(), proposal: proposal(rows, "applied") }); });
    await waitFor(() => expect(input.onApplied).toHaveBeenCalledWith(expect.objectContaining({ id: "track-a" })));
    expect(screen.getByLabelText("Track căn chỉnh")).toHaveValue("track-b");
    expect(screen.queryByText("Đã áp dụng căn chỉnh. Có thể khôi phục từ bản đã lưu.")).not.toBeInTheDocument();
  });

  it("stops the shared player when the track changes", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const input = props({ assets: [asset(), asset("track-b")] }); render(<SubtitleAlignmentControl {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Căn chỉnh subtitle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo đề xuất" }));
    await screen.findByText(/Sẵn sàng/);
    fireEvent.click(await screen.findByRole("button", { name: "Nghe trước" }));
    fireEvent.change(screen.getByLabelText("Track căn chỉnh"), { target: { value: "track-b" } });
    await waitFor(() => expect(api.getSubtitleAlignment).toHaveBeenCalledWith("project", "track-b"));
    expect(pause).toHaveBeenCalled();
  });
});
