import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeWorkloadState } from "../domain/types";
import { RuntimeMenuItems } from "./RuntimeMenuItems";

const running: RuntimeWorkloadState = {
  overall: "running",
  api: "running",
  studio: "running",
  busy: false,
  activeAction: null,
  lastAction: null,
  lastError: null,
  processes: [
    { role: "controller", label: "Runtime controller", port: 18119, state: "running", pid: 100 },
    { role: "api", label: "Pro4Bro API", port: 18120, state: "running", pid: 200 },
    { role: "studio", label: "OmniVoice Studio", port: 18081, state: "running", pid: 300 },
  ],
  updatedAt: "2026-08-29T00:00:00Z",
};

describe("RuntimeMenuItems", () => {
  it("keeps start, restart and stop controls together", () => {
    const onAction = vi.fn();
    render(<div role="menu"><RuntimeMenuItems onAction={onAction} runtime={running} /></div>);

    expect(screen.getByRole("menuitem", { name: /turn on all/i })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /restart all/i })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /turn off all/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("menuitem", { name: /restart all/i }));
    expect(onAction).toHaveBeenCalledWith("restart");
  });

  it("disables every action while the controller is busy", () => {
    render(<div role="menu"><RuntimeMenuItems onAction={vi.fn()} runtime={{ ...running, overall: "busy", busy: true, activeAction: "stop" }} /></div>);
    screen.getAllByRole("menuitem").forEach((button) => expect(button).toBeDisabled());
  });

  it("names each listener so the operator can tell what is actually up", () => {
    render(<div role="menu"><RuntimeMenuItems onAction={vi.fn()} runtime={running} /></div>);

    const listed = screen.getByRole("list", { name: /tiến trình đang chạy/i });
    expect(listed).toHaveTextContent("Pro4Bro API");
    expect(listed).toHaveTextContent("18120");
    expect(listed).toHaveTextContent("200");
  });

  it("calls out a port held by something that is not ours", () => {
    // A plain port check reported this as healthy, so the workspace showed every
    // system on while nothing of ours was answering.
    const blocked: RuntimeWorkloadState = {
      ...running,
      overall: "blocked",
      api: "foreign",
      processes: running.processes.map((process) =>
        process.role === "api" ? { ...process, state: "foreign", pid: 999 } : process,
      ),
    };

    render(<div role="menu"><RuntimeMenuItems onAction={vi.fn()} runtime={blocked} /></div>);

    expect(screen.getByRole("status")).toHaveTextContent(/PORT BỊ CHIẾM/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/Pro4Bro API \(18120\)/);
  });
});
