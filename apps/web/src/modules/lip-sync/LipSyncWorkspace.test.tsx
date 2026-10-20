import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProjectMediaAsset, VoiceOutput } from "../../domain/types";
import { LipSyncWorkspace } from "./LipSyncWorkspace";

const video = { id: "footage-1", name: "Scene 01.mp4", mediaKind: "video", duration: 10,
  sourceExtension: ".mp4", deletedAt: null, disabled: false } as ProjectMediaAsset;
const output = { id: "voice-1", name: "Lời thoại đã tạo", voiceName: "Mai", duration: 5,
  audioAvailable: true } as VoiceOutput;

describe("LipSync workspace", () => {
  const resize = () => undefined;
  it("uses project video and generated audio with independent timeline positions", () => {
    const view = render(<LipSyncWorkspace assets={[video]} outputs={[output]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
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

  it("trims both clips from the shared timeline without changing source duration", () => {
    const view = render(<LipSyncWorkspace assets={[video]} outputs={[output]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
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
    fireEvent.pointerUp(moveVideo, { clientX: 200, pointerId: 1 });
    expect((screen.getAllByLabelText("Vị trí trên timeline (s)")[0] as HTMLInputElement).value).toBe("1");
  });

  it("keeps the preview empty without a source and excludes recycled footage", () => {
    render(<LipSyncWorkspace assets={[{ ...video, deletedAt: "2026-10-20" }]} outputs={[]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    expect(screen.getByText("Chưa có video trong Media Pool. Import footage tại page Input.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scene 01.mp4/ })).not.toBeInTheDocument();
  });
});
