import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ModuleRegistry, type StudioContext } from "./ModuleRegistry";

vi.mock("../obs-capture/ObsCapture", () => ({ ObsCapture: () => <h2>OBS capture controls</h2> }));

it("mounts OBS tools only for OBS capture source, independently of archive viewing", () => {
  const context = { mediaAssets: [], workflow: "speech-to-text", obsCaptureEnabled: false,
    obsTimelineActive: true, wordSelection: { indexes: [] } } as unknown as StudioContext;
  const view = render(<ModuleRegistry id="obs-capture" context={context} />);
  expect(screen.queryByText("OBS capture controls")).not.toBeInTheDocument();
  view.rerender(<ModuleRegistry id="obs-capture" context={{ ...context, obsCaptureEnabled: true }} />);
  expect(screen.getByText("OBS capture controls")).toBeInTheDocument();
});
