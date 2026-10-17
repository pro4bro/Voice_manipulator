import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectHub } from "./ProjectHub";
import { api } from "../api/client";

function renderFolderBrowse(onPickLocation: (initialPath: string) => Promise<string | null>) {
  vi.spyOn(api, "listVoiceCollections").mockResolvedValue([]);
  return render(<ProjectHub projects={[]} busy={false} defaultLocation="projects" engine={null}
    error={null} onCreate={vi.fn()} onOpen={vi.fn()} onOpenExisting={vi.fn()}
    onPickLocation={onPickLocation} onRetry={vi.fn()} onRevealProject={vi.fn()}
    onRemoveProject={vi.fn()} theme="dark" onToggleTheme={vi.fn()} />);
}

describe("ProjectHub folder dialog recovery", () => {
  it("shows a picker error and allows retry without restarting or losing the project name", async () => {
    const pick = vi.fn().mockRejectedValueOnce(new Error("Không mở được trình chọn thư mục"))
      .mockResolvedValueOnce("projects/đã chọn");
    renderFolderBrowse(pick);
    fireEvent.change(screen.getByRole("textbox", { name: /PROJECT NAME/ }), { target: { value: "Test 11" } });
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không mở được trình chọn thư mục");
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Thư mục lưu project" })).toHaveValue("projects/đã chọn"));
    expect(screen.getByRole("textbox", { name: /PROJECT NAME/ })).toHaveValue("Test 11");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a manually edited folder when an older dialog returns", async () => {
    let finish!: (path: string | null) => void;
    renderFolderBrowse(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    expect(screen.getByRole("button", { name: "Đang mở..." })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Thư mục lưu project" }), { target: { value: "projects/manual" } });
    finish("projects/old-dialog");
    await waitFor(() => expect(screen.getByRole("button", { name: "Browse" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Thư mục lưu project" })).toHaveValue("projects/manual");
  });

  it("can cancel and reopen the native picker without clearing the draft", async () => {
    const pick = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("projects/new");
    renderFolderBrowse(pick);
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Browse" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Thư mục lưu project" })).toHaveValue("projects");
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Thư mục lưu project" })).toHaveValue("projects/new"));
  });
});

describe("ProjectHub", () => {
  it("shows a count of unique archived profiles rather than models and removes the old project eyebrow", async () => {
    const entry = { sourceProjectId: "source", speaker: { id: "speaker-1", name: "An" } };
    const list = vi.spyOn(api, "listVoiceCollections").mockResolvedValue([
      { id: "one", entries: [entry, entry] }, { id: "two", entries: [entry, { ...entry, speaker: { id: "speaker-2", name: "Bình" } }] },
    ] as never);
    try {
      render(<ProjectHub projects={[{ id: "project-1", name: "Source", projectPath: "projects/Source", updatedAt: "2026-10-09" } as never]} busy={false} defaultLocation="projects" engine={null} error={null} onCreate={vi.fn()} onOpen={vi.fn()} onOpenExisting={vi.fn()} onPickLocation={vi.fn()} onRetry={vi.fn()} onRevealProject={vi.fn()} onRemoveProject={vi.fn()} theme="dark" onToggleTheme={vi.fn()} />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Voice Collection" })).toHaveTextContent("2"));
      expect(screen.queryByText("LOCAL / PROJECTS")).not.toBeInTheDocument();
    } finally { list.mockRestore(); }
  });
  it("opens the functioning Voice Collection browser and returns to projects", async () => {
    const list = vi.spyOn(api, "listVoiceCollections").mockResolvedValue([]);
    const schema = vi.spyOn(api, "getOmniVoiceProfileSchema").mockResolvedValue({ languages: [], facets: [] } as never);
    render(<ProjectHub projects={[{ id: "project-1", name: "Source", projectPath: "projects/Source", updatedAt: "2026-10-09" } as never]} busy={false} defaultLocation="projects" engine={null} error={null} onCreate={vi.fn()} onOpen={vi.fn()} onOpenExisting={vi.fn()} onPickLocation={vi.fn()} onRetry={vi.fn()} onRevealProject={vi.fn()} onRemoveProject={vi.fn()} theme="dark" onToggleTheme={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Voice Collection" }));
    await screen.findByText("Tạo collection để gom voice đã train từ các project.");
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /All projects/ }));
    expect(screen.getByText("Source")).toBeInTheDocument();
    list.mockRestore(); schema.mockRestore();
  });
  it("keeps the create form and draft open when persistence fails", async () => {
    const onCreate = vi.fn().mockResolvedValue(false);
    render(
      <ProjectHub
        busy={false}
        defaultLocation={"projects"}
        engine={null}
        error="Disk unavailable"
        onCreate={onCreate}
        onOpen={() => undefined}
        onOpenExisting={vi.fn()}
        onPickLocation={vi.fn()}
        onRetry={() => undefined}
        onRevealProject={vi.fn()}
        onRemoveProject={vi.fn()}
        projects={[]}
        theme="light"
        onToggleTheme={vi.fn()}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: /PROJECT NAME/ });
    fireEvent.change(nameInput, { target: { value: "Giọng miền Nam" } });
    fireEvent.click(screen.getByRole("button", { name: /Create project/ }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Project setup" })).toBeInTheDocument();
    expect(nameInput).toHaveValue("Giọng miền Nam");
  });

  it("asks for a storage location and keeps technical metadata optional", () => {
    render(
      <ProjectHub
        busy={false}
        defaultLocation={"projects"}
        engine={null}
        error={null}
        onCreate={vi.fn().mockResolvedValue(false)}
        onOpen={() => undefined}
        onOpenExisting={vi.fn()}
        onPickLocation={vi.fn()}
        onRetry={() => undefined}
        onRevealProject={vi.fn()}
        onRemoveProject={vi.fn()}
        projects={[]}
        theme="light"
        onToggleTheme={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Thư mục lưu project" })).toHaveValue("projects");
    expect(screen.queryByRole("combobox", { name: "Ngôn ngữ" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Thông tin project/ }));

    expect(screen.getByRole("combobox", { name: "Ngôn ngữ" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Chất giọng" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sample rate" })).toBeInTheDocument();
  });

  it("can reconnect a project folder after it is moved", async () => {
    const onOpenExisting = vi.fn().mockResolvedValue(true);
    render(
      <ProjectHub
        busy={false}
        defaultLocation={"projects"}
        engine={null}
        error={null}
        onCreate={vi.fn().mockResolvedValue(false)}
        onOpen={() => undefined}
        onOpenExisting={onOpenExisting}
        onPickLocation={vi.fn().mockResolvedValue("projects/moved-project")}
        onRetry={() => undefined}
        onRevealProject={vi.fn()}
        onRemoveProject={vi.fn()}
        projects={[{
          id: "project-1",
          name: "Existing",
          projectPath: "projects/existing",
          location: null,
          language: null,
          accent: null,
          sampleRate: null,
          purpose: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          lastPage: "speech-to-text",
        }]}
        theme="light"
        onToggleTheme={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open project/ }));
    await waitFor(() => expect(onOpenExisting).toHaveBeenCalledWith("projects/moved-project"));
  });

  it("offers reveal, remove and delete on a right-clicked project", () => {
    const onRevealProject = vi.fn();
    const onRemoveProject = vi.fn();
    const project = {
      id: "project-1", name: "Existing", projectPath: "projects/existing", location: null,
      language: null, accent: null, sampleRate: null, purpose: null,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", lastPage: "speech-to-text" as const,
    };
    render(
      <ProjectHub
        busy={false}
        defaultLocation={"projects"}
        engine={null}
        error={null}
        onCreate={vi.fn().mockResolvedValue(false)}
        onOpen={() => undefined}
        onOpenExisting={vi.fn()}
        onPickLocation={vi.fn()}
        onRetry={() => undefined}
        onRevealProject={onRevealProject}
        onRemoveProject={onRemoveProject}
        projects={[project]}
        theme="light"
        onToggleTheme={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: /Existing/ }));

    fireEvent.click(screen.getByRole("menuitem", { name: /Reveal in Desktop/ }));
    expect(onRevealProject).toHaveBeenCalledWith(project);

    fireEvent.contextMenu(screen.getByRole("button", { name: /Existing/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove Project/ }));
    // Remove keeps the files: that is the whole difference from Delete.
    expect(onRemoveProject).toHaveBeenCalledWith(project, false);

    fireEvent.contextMenu(screen.getByRole("button", { name: /Existing/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete Project/ }));
    expect(onRemoveProject).toHaveBeenCalledWith(project, true);
  });

  it("selects project cards by modifiers and permanently deletes the selected batch from the context menu", () => {
    const projects = ["Alpha", "Beta", "Gamma"].map((name, index) => ({
      id: `project-${index}`, name, projectPath: `projects/${name}`, location: null,
      language: null, accent: null, sampleRate: null, purpose: null,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", lastPage: "speech-to-text" as const,
    }));
    const onOpen = vi.fn();
    const onRemoveProjects = vi.fn();
    const onRemoveProject = vi.fn();
    const onDeleteProjects = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render(<ProjectHub busy={false} defaultLocation="projects" engine={null} error={null} onCreate={vi.fn().mockResolvedValue(false)} onOpen={onOpen} onOpenExisting={vi.fn()} onPickLocation={vi.fn()} onRetry={vi.fn()} onRevealProject={vi.fn()} onRemoveProject={onRemoveProject} onRemoveProjects={onRemoveProjects} onDeleteProjects={onDeleteProjects} projects={projects} theme="light" onToggleTheme={vi.fn()} />);
      const alpha = screen.getByRole("button", { name: /Alpha/ });
      const beta = screen.getByRole("button", { name: /Beta/ });
      const gamma = screen.getByRole("button", { name: /Gamma/ });
      fireEvent.click(alpha, { ctrlKey: true });
      fireEvent.click(gamma, { shiftKey: true });
      expect([alpha, beta, gamma].map((card) => card.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
      fireEvent.click(beta, { ctrlKey: true });
      expect(beta).toHaveAttribute("aria-pressed", "false");
      fireEvent.keyDown(gamma, { key: "a", ctrlKey: true });
      expect(beta).toHaveAttribute("aria-pressed", "true");
      expect(onOpen).not.toHaveBeenCalled();

      fireEvent.contextMenu(gamma);
      fireEvent.click(screen.getByRole("menuitem", { name: /Delete Projects \(3\)/ }));
      expect(confirm).toHaveBeenCalledOnce();
      expect(onDeleteProjects).toHaveBeenCalledWith(projects);
      expect(onRemoveProjects).not.toHaveBeenCalled();
      expect(onRemoveProject).not.toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });
});
