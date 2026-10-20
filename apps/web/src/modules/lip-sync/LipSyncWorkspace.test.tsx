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
    expect(screen.getByText(/Video: 00:02.25/)).toHaveTextContent("Voice: 00:03.50");
    expect(screen.getByRole("button", { name: "Generate LipSync" })).toBeDisabled();
  });

  it("keeps the preview empty without a source and excludes recycled footage", () => {
    render(<LipSyncWorkspace assets={[{ ...video, deletedAt: "2026-10-20" }]} outputs={[]} projectId="project-1" leftWidth={300} rightWidth={340} onResizeStart={resize} onResizeKeyDown={resize} />);
    expect(screen.getByText("Chưa có video trong Media Pool. Import footage tại page Input.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scene 01.mp4/ })).not.toBeInTheDocument();
  });
});
