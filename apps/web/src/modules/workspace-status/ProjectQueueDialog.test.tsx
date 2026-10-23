import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityTask } from "../../domain/types";
import { ProjectQueueDialog } from "./ProjectQueueDialog";

function task(id: string, overrides: Partial<ActivityTask> = {}): ActivityTask {
  return { id, projectId: "p1", kind: "stt", label: id, detail: "", status: "running", fraction: 0.2, etaSeconds: null, startedAt: "2026-01-01", updatedAt: "2026-01-01", footageId: "f1", ...overrides };
}

describe("ProjectQueueDialog", () => {
  it("filters foreign project tasks and opens footage children in workflow order", () => {
    const close = vi.fn();
    render(<ProjectQueueDialog projectId="p1" onClose={close} tasks={[
      task("diarize", { kind: "diarization", label: "Speaker Diarization", fraction: 0.4 }),
      task("align", { kind: "alignment", label: "Align Subtitle", fraction: 0.3 }),
      task("stt", { kind: "stt", label: "STT", assetId: "track-a", fraction: 0.2 }),
      task("import", { kind: "import", label: "Import", fraction: 0.1 }),
      task("foreign", { projectId: "p2", label: "Foreign work" }),
    ]} />);
    const article = screen.getByText("Import").closest("article");
    expect(article).toBeTruthy();
    const rows = within(article!).getAllByRole("listitem").map((row) => row.querySelector("span")?.textContent);
    expect(rows).toEqual(expect.arrayContaining([expect.stringContaining("Import"), expect.stringContaining("STT"), expect.stringContaining("Align Subtitle"), expect.stringContaining("Speaker Diarization")]));
    expect(rows.map((row) => row?.split(" ")[0])).toEqual(["Import", "STT", "Align", "Speaker"]);
    expect(screen.queryByText("Foreign work")).toBeNull();
  });

  it("renders an indeterminate aggregate when any slot has unknown progress", () => {
    render(<ProjectQueueDialog projectId="p1" onClose={() => undefined} tasks={[
      task("known", { footageId: "f1", fraction: 0.7 }),
      task("unknown", { footageId: "f2", fraction: null }),
    ]} />);
    const progress = screen.getByLabelText("Tiến trình tổng") as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(false);
  });

  it("shows compact footage steps with current operation, one decimal percent and status colors", () => {
    render(<ProjectQueueDialog projectId="p1" onClose={() => undefined} assets={[{ id: "f1", name: "meeting.wav" } as never]} tasks={[
      task("import", { kind: "import", footageId: "f1", status: "complete", fraction: 0.35, detail: "import detail" }),
      task("stt", { kind: "stt", footageId: "f1", assetId: "track-1", status: "queued", fraction: 0.36 }),
      task("align", { kind: "alignment", footageId: "f1", assetId: "track-2", status: "running", fraction: 0.355 }),
    ]} />);
    const slotName = screen.getByText("meeting.wav", { selector: ".project-queue__slot-name > span" });
    expect(slotName.parentElement?.textContent).toContain("Align Subtitle");
    const article = slotName.closest("article")!;
    expect(article.querySelector(".project-queue__slot-head strong")?.textContent).toBe("35.5%");
    expect(within(article).getByText("Import", { selector: ".project-queue__step-main > span" }).closest("li")?.className).toContain("is-complete");
    expect(within(article).getByText("STT", { selector: ".project-queue__step-main > span" }).closest("li")?.className).toContain("is-queued");
    expect(within(article).getByText("Align Subtitle", { selector: ".project-queue__step-main > span" }).closest("li")?.className).toContain("is-running");
    expect(within(article).getByLabelText("Align Subtitle 35.5%").hasAttribute("value")).toBe(true);
    expect(screen.getByText("import detail").closest("details")?.open).toBe(false);
  });

  it("renders parent and nested child progress without double-counting the parent", () => {
    render(<ProjectQueueDialog projectId="p1" onClose={() => undefined} tasks={[
      task("batch", { kind: "generate", label: "Voice batch", status: "running", fraction: 0.1 }),
      task("row-a", { kind: "tts", label: "Line A", assetId: "row-a", parentTaskId: "batch", status: "complete", fraction: 1, startedAt: "2026-01-02" }),
      task("row-b", { kind: "tts", label: "Line B", assetId: "row-b", parentTaskId: "batch", status: "running", fraction: 0.5, startedAt: "2026-01-03" }),
    ]} />);
    fireEvent.click(screen.getByRole("tab", { name: /Generate/ }));
    const slot = screen.getByText("Voice batch", { selector: ".project-queue__slot-name > span" }).closest("article")!;
    expect(slot.querySelector(".project-queue__slot-head strong")?.textContent).toBe("75%");
    expect(within(slot).getByText("Generate")).toBeTruthy();
    expect(within(slot).getByText("Line A")).toBeTruthy();
    expect(within(slot).getByText("Line B")).toBeTruthy();
    expect(slot.querySelectorAll(".project-queue__nested .project-queue__step-main progress")).toHaveLength(2);
  });

  it("supports arrow key navigation across queue tabs", () => {
    render(<ProjectQueueDialog projectId="p1" onClose={() => undefined} tasks={[]} />);
    const footage = screen.getByRole("tab", { name: /Footage/ });
    footage.focus();
    fireEvent.keyDown(footage, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Training/ })).toHaveFocus();
    expect(screen.getByRole("tab", { name: /Training/ })).toHaveAttribute("aria-selected", "true");
  });
});
