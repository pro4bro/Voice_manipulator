import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { EngineStatus, Project, ProjectCreate, ThemeMode, WorkspacePage } from "../domain/types";
import { ProjectHub } from "./ProjectHub";
import { WorkspaceShell } from "./WorkspaceShell";

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("pro4bro:theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [defaultLocation, setDefaultLocation] = useState("");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projectList, engineStatus, systemPaths] = await Promise.all([
        api.listProjects(),
        api.getOmniVoiceStatus(),
        api.getSystemPaths(),
      ]);
      setProjects(projectList);
      setEngine(engineStatus);
      setDefaultLocation(systemPaths.defaultProjectLocation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pro4bro:theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => current === "light" ? "dark" : "light");
  }

  async function createProject(payload: ProjectCreate) {
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject(payload);
      setProjects((current) => [project, ...current]);
      setActiveProject(project);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được project");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openExistingProject(path: string) {
    setBusy(true);
    setError(null);
    try {
      const project = await api.openProject(path);
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setActiveProject(project);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không mở được project");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changePage(page: WorkspacePage) {
    if (!activeProject) throw new Error("No active project");
    const updated = await api.setLastPage(activeProject.id, page);
    setActiveProject(updated);
    setProjects((current) => current.map((project) => project.id === updated.id ? updated : project));
    return updated;
  }

  if (loading) {
    return <main className="boot-screen"><span className="brand-mark">P4B<i /></span><b>Đang khởi động local workspace</b><div><i /><i /><i /></div></main>;
  }

  if (activeProject) {
    return <WorkspaceShell engine={engine} onBack={() => setActiveProject(null)} onPageChange={changePage} onToggleTheme={toggleTheme} project={activeProject} theme={theme} />;
  }

  return (
    <ProjectHub
      busy={busy}
      defaultLocation={defaultLocation}
      engine={engine}
      error={error}
      onCreate={createProject}
      onOpen={setActiveProject}
      onOpenExisting={openExistingProject}
      onPickLocation={async (initialPath) => (await api.pickFolder(initialPath)).path}
      onRetry={() => void load()}
      projects={projects}
      onToggleTheme={toggleTheme}
      theme={theme}
    />
  );
}
