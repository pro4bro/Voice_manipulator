import { useEffect, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { StudioContext } from "../modules/registry/ModuleRegistry";
const lifecycle = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("../modules/registry/ModuleRegistry", () => ({ ModuleRegistry: () => {
  const [zoom, setZoom] = useState(1);
  useEffect(() => { lifecycle.mounts++; }, []);
  return <button onClick={() => setZoom(zoom * 2)}>Zoom {zoom}</button>;
} }));
import { ProgressiveModule } from "./ProgressiveModule";

it("does not unmount the open Version when its composition receives a rendered output ID", () => {
  lifecycle.mounts = 0;
  const context = { workflow: "voice-manipulator", take: { id: "original" }, voiceVersions: { activeVersion: { id: "v1" } } } as StudioContext;
  const view = render(<ProgressiveModule id="timeline" context={context} />);
  fireEvent.click(screen.getByText("Zoom 1"));
  view.rerender(<ProgressiveModule id="timeline" context={{ ...context, take: { ...context.take!, id: "solo-master" } }} />);
  expect(screen.getByText("Zoom 2")).toBeInTheDocument();
  expect(lifecycle.mounts).toBe(1);
});
