import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectMediaAsset } from "../../domain/types";
import { MediaPool } from "./MediaPool";

const asset: ProjectMediaAsset = {
  id: "asset-1",
  name: "interview.mov",
  sourceExtension: ".mov",
  mediaKind: "video",
  sourcePath: "assets/media/asset-1/source.mov",
  studioItemId: "studio/interview.wav",
  url: "/api/studio/media/studio/interview.wav",
  duration: 42,
  sampleRate: 24000,
  text: "Xin chào",
  words: [],
  origin: "import",
  createdAt: "2026-08-23T00:00:00Z",
  updatedAt: "2026-08-23T00:00:00Z",
  revisions: [{ id: "rev-1", source: "stt", text: "Xin chào", createdAt: "2026-08-23T00:00:00Z" }],
};

describe("MediaPool", () => {
  it("imports common media formats and selects an asset with its own history", () => {
    const onSelect = vi.fn();
    render(<MediaPool assets={[asset]} busy={false} onImport={vi.fn()} onSelect={onSelect} selectedAssetId={null} />);

    const input = screen.getByLabelText("Import media") as HTMLInputElement;
    expect(input.accept).toContain(".mov");
    expect(input.accept).toContain(".mkv");
    expect(input.accept).toContain(".wav");
    expect(screen.getByText("1 revision")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /interview.mov/ }));
    expect(onSelect).toHaveBeenCalledWith("asset-1");
  });
});
