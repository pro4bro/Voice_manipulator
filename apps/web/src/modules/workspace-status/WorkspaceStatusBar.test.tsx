import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceStatusBar } from "./WorkspaceStatusBar";
import type { ActivityTask } from "../../domain/types";

function task(overrides: Partial<ActivityTask> = {}): ActivityTask {
  return {
    id: "t1", kind: "stt", label: "Speech to Text · buổi họp", detail: "40%", status: "running",
    fraction: 0.4, etaSeconds: null, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    finishedAt: null, seconds: null, ...overrides,
  };
}

describe("status bar", () => {
  it("says READY only when nothing is running", () => {
    render(<WorkspaceStatusBar metrics={null} tasks={[]} />);

    expect(screen.getByText("Không có background task đang chạy")).toBeTruthy();
  });

  it("shows the job in front and counts the rest", () => {
    render(<WorkspaceStatusBar metrics={null} tasks={[
      task(),
      task({ id: "t2", kind: "training", label: "Training · Anh Vũ", detail: "step 120/550", fraction: 0.3 }),
      task({ id: "t3", kind: "model", label: "Nạp OmniVoice", fraction: null }),
    ]} />);

    expect(screen.getByText("TRAINING")).toBeTruthy();
    expect(screen.getByText("Training · Anh Vũ")).toBeTruthy();
    expect(screen.getByText(/step 120\/550/)).toBeTruthy();
    expect(screen.getByText(/\+2 việc khác/)).toBeTruthy();
  });

  it("keeps a just-finished job on screen with how long it took", () => {
    render(<WorkspaceStatusBar metrics={null} tasks={[task({
      kind: "tts", label: "Đọc Script · 12 đoạn", detail: "12 đoạn · 2 dùng lại",
      status: "complete", fraction: 1, finishedAt: new Date().toISOString(), seconds: 95,
    })]} />);

    expect(screen.getByText("TẠO GIỌNG")).toBeTruthy();
    expect(screen.getByText(/Xong sau 1m 35s/)).toBeTruthy();
  });
});
