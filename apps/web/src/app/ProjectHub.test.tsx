import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectHub } from "./ProjectHub";

describe("ProjectHub", () => {
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
});
