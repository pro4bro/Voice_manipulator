import { fireEvent, render, screen } from "@testing-library/react";
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

  it("opens only the current project's queue and counts pending work separately from attention", () => {
    const { rerender } = render(<WorkspaceStatusBar metrics={null} tasks={[
      task({ id: "foreign", projectId: "other", label: "Other project's task" }),
      task({ id: "global", projectId: null, label: "Global task" }),
    ]} projectId="current" queueTasks={[
      task({ id: "done", projectId: "current", status: "complete", kind: "import", label: "footage.wav", fraction: 1 }),
      task({ id: "pending", projectId: "current", status: "queued", kind: "stt" }),
      task({ id: "failed", projectId: "current", status: "failed" }),
      task({ id: "interrupted", projectId: "current", status: "interrupted" }),
      task({ id: "cancelled", projectId: "current", status: "cancelled" }),
      task({ id: "other-project", projectId: "other", label: "Foreign queued task" }),
    ]} />);

    fireEvent.click(screen.getByRole("button", { name: /Mở Queue/ }));
    expect(screen.getByRole("dialog", { name: "Queue" })).toBeTruthy();
    expect(screen.getAllByText("footage.wav").find((element) => element.closest(".project-queue__slot-name"))?.closest("article")?.className).toContain("is-complete");
    expect(screen.queryByText("Other project's task")).toBeNull();
    expect(screen.queryByText("Foreign queued task")).toBeNull();
    expect(screen.getByText("Global task")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mở Queue/ }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: /Mở Queue/ }).textContent).toContain("!2");

    rerender(<WorkspaceStatusBar metrics={null} tasks={[]} projectId="next-project" queueTasks={[]} />);
    expect(screen.queryByRole("dialog", { name: "Queue" })).toBeNull();
  });

  it("closes the queue with Escape", () => {
    render(<WorkspaceStatusBar metrics={null} tasks={[]} projectId="current" queueTasks={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mở Queue" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Queue" })).toBeNull();
  });

  it("shows indeterminate progress when the current status fraction is unknown", () => {
    render(<WorkspaceStatusBar metrics={null} tasks={[task({ fraction: null })]} />);
    const progress = screen.getByLabelText("Tiến trình chưa xác định") as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(false);
  });

  it("keeps active project activity visible during a queue poll gap and favors running work", () => {
    render(<WorkspaceStatusBar metrics={null} projectId="current" tasks={[
      task({ id: "running-stt", projectId: "current", kind: "stt", label: "Current recognition", status: "running" }),
      task({ id: "foreign", projectId: "other", kind: "training", label: "Foreign training" }),
    ]} queueTasks={[task({ id: "queued-training", projectId: "current", kind: "training", label: "Queued training", status: "queued" })]} />);

    expect(screen.getByText("Current recognition")).toBeTruthy();
    expect(screen.queryByText("Queued training")).toBeNull();
    expect(screen.queryByText("Foreign training")).toBeNull();
  });

  it("drops finished work from Status after the recent-completion window", () => {
    render(<WorkspaceStatusBar metrics={null} tasks={[task({
      status: "failed", label: "Old failure", finishedAt: new Date(Date.now() - 30_000).toISOString(),
    })]} />);
    expect(screen.getByText("Không có background task đang chạy")).toBeTruthy();
  });

  it("keeps dialog focus when current project queue props refresh", () => {
    const view = render(<WorkspaceStatusBar metrics={null} projectId="current" tasks={[]} queueTasks={[task({ projectId: "current" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /Mở Queue/ }));
    const closeButton = screen.getByRole("button", { name: "Đóng Queue" });
    closeButton.focus();
    view.rerender(<WorkspaceStatusBar metrics={null} projectId="current" tasks={[]} queueTasks={[task({ id: "t2", projectId: "current" })]} />);
    expect(screen.getByRole("button", { name: "Đóng Queue" })).toHaveFocus();
  });
});
