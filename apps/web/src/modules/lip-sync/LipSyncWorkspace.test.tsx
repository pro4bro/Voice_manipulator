import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { ProjectMediaAsset, VoiceOutput } from "../../domain/types";
import { emptyLipSync } from "../../domain/lipsync";
import { api } from "../../api/client";
import { LipSyncWorkspace } from "./LipSyncWorkspace";

const video = { id: "footage-1", name: "Scene 01.mp4", mediaKind: "video", duration: 10,
  sourceExtension: ".mp4", deletedAt: null, disabled: false } as ProjectMediaAsset;
const output = { id: "voice-1", name: "Lời thoại đã tạo", voiceName: "Mai", duration: 5,
  audioAvailable: true } as VoiceOutput;

describe("LipSync workspace", () => {
  const resize = () => undefined;
  beforeEach(() => {
    vi.spyOn(api, "getLipSync").mockImplementation(async () => emptyLipSync());
    vi.spyOn(api, "getLipSyncRuntime").mockResolvedValue({ analysis: { ready: false, blockers: [] }, render: { ready: false, blockers: [] } });
    vi.spyOn(api, "listLipSyncJobs").mockResolvedValue([]);
    vi.spyOn(api, "getTrainingCatalog").mockResolvedValue({ speakers: [] } as never);
  });
  afterEach(() => vi.restoreAllMocks());
  it("uses project video and generated audio with independent timeline positions", async () => {
    const view = render(<LipSyncWorkspace assets={[video]} outputs={[output]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    await screen.findByText("Bố cục đã tải");
    fireEvent.click(screen.getByRole("button", { name: /Scene 01.mp4/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Voice Output/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lời thoại đã tạo/ }));
    expect(view.container.querySelector("video")?.getAttribute("src")).toBe("/api/projects/project-1/media/footage-1/video");
    expect(view.container.querySelector("audio")?.getAttribute("src")).toBe("/api/projects/project-1/voice-outputs/voice-1/audio");
    const starts = screen.getAllByLabelText("Vị trí trên timeline (s)");
    fireEvent.change(starts[0], { target: { value: "2.25" } });
    fireEvent.change(starts[1], { target: { value: "3.5" } });
    expect(screen.getByText(/VIDEO · 00:02.25/)).toBeInTheDocument();
    expect(screen.getByText(/VOICE · 00:03.50/)).toBeInTheDocument();
    expect(view.container.querySelector(".timeline-module--alignment .timeline-canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phóng to timeline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate LipSync" })).toBeDisabled();
  });

  it("trims both clips from the shared timeline without changing source duration", async () => {
    const view = render(<LipSyncWorkspace assets={[video]} outputs={[output]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    await screen.findByText("Bố cục đã tải");
    fireEvent.click(screen.getByRole("button", { name: /Scene 01.mp4/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Voice Output/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lời thoại đã tạo/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Co mép cuối video" }), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Co mép đầu voice" }), { key: "ArrowRight" });
    expect(screen.getByText(/VIDEO · 00:00.00–00:09.95/)).toBeInTheDocument();
    expect(screen.getByText(/VOICE · 00:00.05–00:05.00/)).toBeInTheDocument();
    expect((screen.getAllByLabelText("Điểm OUT nguồn (s)")[0] as HTMLInputElement).value).toBe("9.95");
    expect((screen.getAllByLabelText("Điểm IN nguồn (s)")[1] as HTMLInputElement).value).toBe("0.05");
    const canvas = view.container.querySelector(".alignment-canvas") as HTMLElement;
    canvas.getBoundingClientRect = () => ({ left: 0, right: 1000, top: 0, bottom: 200, width: 1000, height: 200, x: 0, y: 0, toJSON: () => ({}) });
    const moveVideo = screen.getByRole("button", { name: "Di chuyển video Scene 01.mp4" });
    fireEvent.pointerDown(moveVideo, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(moveVideo, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(moveVideo, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(moveVideo, { clientX: 300, pointerId: 1 });
    expect((screen.getAllByLabelText("Vị trí trên timeline (s)")[0] as HTMLInputElement).value).toBe("1.99");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect((screen.getAllByLabelText("Vị trí trên timeline (s)")[0] as HTMLInputElement).value).toBe("0");
  });

  it("keeps the preview empty without a source and excludes recycled footage", async () => {
    render(<LipSyncWorkspace assets={[{ ...video, deletedAt: "2026-10-20" }]} outputs={[]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    await screen.findByText("Bố cục đã tải");
    expect(screen.getByText("Chưa có video trong Media Pool. Import footage tại page Input.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scene 01.mp4/ })).not.toBeInTheDocument();
  });

  it("lists the three downloaded source candidates without enabling render", async () => {
    const catalog = vi.spyOn(api, "getEngineCatalog").mockResolvedValue(["MuseTalk 1.5", "LatentSync 1.6", "Wav2Lip · nghiên cứu"].map((label, index) => ({
      id: `lip-${index}`, label, family: label, engine: label, mode: "lip-sync", description: "Video + voice", order: index,
      runnable: false, installed: true, available: false, status: "Chưa có adapter render.", notes: [index === 2 ? "Chỉ dùng nghiên cứu" : "Kiểm tra license weights"],
      repository: { root: "lipsync", path: label, entrypoint: "inference.py" }, parameters: [], origin: "shipped",
    })));
    try {
      render(<LipSyncWorkspace assets={[video]} outputs={[output]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    await screen.findByText("Bố cục đã tải");
      expect(await screen.findByText("MuseTalk 1.5")).toBeInTheDocument();
      expect(screen.getByText("LatentSync 1.6")).toBeInTheDocument();
      expect(screen.getByText("Wav2Lip · nghiên cứu")).toBeInTheDocument();
      expect(screen.getAllByText(/Source đã tải/)).toHaveLength(3);
      fireEvent.click(screen.getByRole("radio", { name: /LatentSync 1.6/ }));
      expect(screen.getByRole("radio", { name: /LatentSync 1.6/ })).toBeChecked();
      expect(screen.getByRole("button", { name: "Generate LipSync" })).toBeDisabled();
      expect(catalog).toHaveBeenCalledWith("lip-sync");
    } finally { catalog.mockRestore(); }
  });

  it("previews the top layer, edits clips independently and saves the portable composition", async () => {
    const save = vi.spyOn(api, "saveLipSync").mockImplementation(async (_id, document) => ({ ...document, revision: document.revision + 1 }));
    const second = { ...video, id: "footage-2", name: "Cut B.mp4", duration: 4 };
    const view = render(<LipSyncWorkspace assets={[video, second]} outputs={[]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    await screen.findByText("Bố cục đã tải");
    fireEvent.click(screen.getByRole("button", { name: /Scene 01.mp4/ }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm layer video" }));
    fireEvent.click(screen.getByRole("button", { name: /Cut B.mp4/ }));
    expect(view.container.querySelector("video")?.getAttribute("src")).toContain("footage-2/video");
    fireEvent.click(screen.getByRole("button", { name: "Bật/tắt Video 2" }));
    expect(view.container.querySelector("video")?.getAttribute("src")).toContain("footage-1/video");
    fireEvent.click(screen.getByRole("button", { name: "Bật/tắt Video 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Nhân bản clip" }));
    expect(screen.getAllByRole("button", { name: "Di chuyển video Cut B.mp4" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByRole("button", { name: "Di chuyển video Cut B.mp4" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu bố cục" }));
    await screen.findByText("Bố cục đã tải");
    expect(save.mock.calls[0][1].clips).toHaveLength(3);
    expect(save.mock.calls[0][1].layers[0].name).toBe("Video 2");
  });

  it("keeps detection and sync scopes separate and invalidates coverage after editing", async () => {
    const inspect = vi.spyOn(api, "inspectLipSyncCoverage").mockResolvedValue({ detection: [], sync: [] });
    render(<LipSyncWorkspace assets={[video]} outputs={[]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    await screen.findByText("Bố cục đã tải");
    fireEvent.click(screen.getByRole("button", { name: /Scene 01.mp4/ }));
    fireEvent.change(screen.getByLabelText("Phạm vi nhận diện · cách lấy video"), { target: { value: "source" } });
    fireEvent.click(screen.getByLabelText("Chọn đoạn · Phạm vi nhận diện"));
    fireEvent.change(screen.getByLabelText("Phạm vi nhận diện · bắt đầu"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Phạm vi nhận diện · kết thúc"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Xem phạm vi xử lý" }));
    await screen.findByText("Phạm vi dự kiến · chưa nhận diện/chưa render");
    expect(inspect.mock.calls[0][1].detectionScope).toMatchObject({ mode: "source", range: { start: 2, end: 7 } });
    expect(inspect.mock.calls[0][1].syncScope).toMatchObject({ mode: "visible", range: null });
    fireEvent.change(screen.getByLabelText("Phạm vi nhận diện · bắt đầu"), { target: { value: "3" } });
    expect(screen.queryByText("Phạm vi dự kiến · chưa nhận diện/chưa render")).not.toBeInTheDocument();
  });


});
