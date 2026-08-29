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
});
