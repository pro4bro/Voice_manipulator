import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import type { Project, RuntimeWorkloadState } from "../domain/types";
import { App } from "./App";

const apiMocks = vi.hoisted(() => ({
  getRuntimeStatus: vi.fn(), listProjects: vi.fn(), getOmniVoiceStatus: vi.fn(),
  getSystemPaths: vi.fn(), controlRuntime: vi.fn(), destroyProject: vi.fn(),
}));
vi.mock("../api/client", () => ({ api: apiMocks }));
vi.mock("./ProjectHub", () => ({ ProjectHub: ({ projects, onOpen, onDeleteProjects }: {
  projects: Project[]; onOpen: (project: Project) => void; onDeleteProjects?: (projects: Project[]) => void;
}) => <><button onClick={() => onOpen(projects[0])}>Open project</button><button onClick={() => onDeleteProjects?.(projects)}>Delete selected projects ({projects.length})</button><span>Hub project count {projects.length}</span></> }));
// Exercise App's lifecycle boundary: state below it must survive reconnect.
// The real media/Script components are checked in the running-browser gate.
vi.mock("./WorkspaceShell", () => ({ WorkspaceShell: ({ project }: { project: Project }) => {
  const [footage, setFootage] = useState("");
  const [follow, setFollow] = useState(true);
  return <section data-testid="workspace">
    <b>{project.name}</b>
    <input aria-label="Selected footage" value={footage} onChange={(event) => setFootage(event.target.value)} />
    <button onClick={() => setFollow(!follow)}>Follow {String(follow)}</button>
  </section>;
} }));

const project = { id: "project", name: "Recovery project", lastPage: "speech-to-text" } as Project;
const running: RuntimeWorkloadState = {
  overall: "running", api: "running", studio: "running", busy: false,
  activeAction: null, lastAction: null, lastError: null, processes: [], updatedAt: "2026-10-03",
};
let status: RuntimeWorkloadState;
async function poll() {
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
}
async function openWorkspace() {
  render(<App />);
  await act(async () => {});
  fireEvent.click(screen.getByText("Open project"));
  fireEvent.change(screen.getByLabelText("Selected footage"), { target: { value: "recording-two" } });
  fireEvent.click(screen.getByText("Follow true"));
  return screen.getByTestId("workspace");
}

describe("workspace lifetime across runtime recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    status = running;
    apiMocks.getRuntimeStatus.mockImplementation(async () => status);
    apiMocks.listProjects.mockResolvedValue([project]);
    apiMocks.getOmniVoiceStatus.mockResolvedValue(null);
    apiMocks.getSystemPaths.mockResolvedValue({ defaultProjectLocation: "projects" });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("retains the same workspace while API is absent and after recovery", async () => {
    const workspace = await openWorkspace();
    status = { ...running, overall: "partial", api: "stopped" };
    await poll();
    expect(screen.getByRole("heading", { name: /workloads|kết nối|runtime/i })).toBeInTheDocument();
    expect(workspace).toBeInTheDocument();
    expect(workspace.closest("[inert]")).not.toBeNull();
    status = running;
    await poll();
    expect(screen.getByTestId("workspace")).toBe(workspace);
    expect(screen.getByLabelText("Selected footage")).toHaveValue("recording-two");
    expect(screen.getByText("Follow false")).toBeInTheDocument();
    expect(workspace.closest("[inert]")).toBeNull();
  });

  it("does not remount the workspace during a slow post-restart project refresh", async () => {
    const workspace = await openWorkspace();
    status = { ...running, overall: "busy", busy: true, activeAction: "restart" };
    await poll();
    let finish!: (projects: Project[]) => void;
    apiMocks.listProjects.mockImplementation(() => new Promise<Project[]>((resolve) => { finish = resolve; }));
    status = running;
    await poll();
    expect(workspace).toBeInTheDocument();
    await act(async () => { finish([project]); });
    expect(screen.getByTestId("workspace")).toBe(workspace);
    expect(screen.getByLabelText("Selected footage")).toHaveValue("recording-two");
    expect(screen.getByText("Follow false")).toBeInTheDocument();
  });

  it("permanently deletes every selected project from the Hub after API success", async () => {
    const secondProject = { ...project, id: "project-two", name: "Second project" };
    apiMocks.listProjects.mockResolvedValue([project, secondProject]);
    apiMocks.destroyProject.mockResolvedValue(undefined);
    render(<App />);
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Delete selected projects (2)" }));
    await act(async () => {});

    expect(apiMocks.destroyProject).toHaveBeenCalledTimes(2);
    expect(apiMocks.destroyProject).toHaveBeenNthCalledWith(1, project.id);
    expect(apiMocks.destroyProject).toHaveBeenNthCalledWith(2, secondProject.id);
    expect(screen.getByText("Hub project count 0")).toBeInTheDocument();
  });
});
