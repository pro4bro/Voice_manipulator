import { useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { EngineStatus, Project, ProjectCreate, RuntimeAction, RuntimeWorkloadState, ThemeMode, WorkspacePage } from "../domain/types";
import { ProjectHub } from "./ProjectHub";
import { RuntimeMenuItems } from "./RuntimeMenuItems";
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
  const [runtime, setRuntime] = useState<RuntimeWorkloadState | null>(null);
  const runtimeRef = useRef<RuntimeWorkloadState | null>(null);

  function rememberRuntime(next: RuntimeWorkloadState) {
    runtimeRef.current = next;
    setRuntime(next);
  }

  async function revealProject(project: Project) {
    try {
      await api.revealProjectFolder(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không mở được thư mục project");
    }
  }

  async function removeProject(project: Project, permanent: boolean) {
    // Only the irreversible one asks. Removing merely forgets where it is.
    if (permanent && !window.confirm(`Xóa hẳn project "${project.name}"?

Toàn bộ thư mục ${project.projectPath} sẽ bị xóa khỏi ổ cứng và không khôi phục được.`)) return;
    try {
      if (permanent) await api.destroyProject(project.id);
      else await api.forgetProject(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không xóa được project");
    }
  }

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

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const next = await api.getRuntimeStatus();
        if (cancelled) return;
        rememberRuntime(next);
        if (next.api === "running") await load();
        else setLoading(false);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Không kết nối được runtime controller");
        setLoading(false);
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void api.getRuntimeStatus().then((next) => {
        const previous = runtimeRef.current;
        rememberRuntime(next);
        if (next.overall === "running" && !next.busy && (previous?.overall !== "running" || previous.busy)) void load();
      }).catch(() => undefined);
    }, runtime?.busy ? 750 : 4000);
    return () => window.clearInterval(timer);
  }, [runtime?.busy]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pro4bro:theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => current === "light" ? "dark" : "light");
  }

  async function controlRuntime(action: RuntimeAction) {
    setError(null);
    try {
      rememberRuntime(await api.controlRuntime(action));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không điều khiển được runtime");
      throw cause;
    }
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

  if (runtime && !runtime.busy && runtime.overall !== "running") {
    return <RuntimeOfflineScreen error={error} onAction={controlRuntime} onToggleTheme={toggleTheme} runtime={runtime} theme={theme} />;
  }

  if (activeProject) {
    return <WorkspaceShell engine={engine} onBack={() => setActiveProject(null)} onPageChange={changePage} onRuntimeAction={controlRuntime} onToggleTheme={toggleTheme} project={activeProject} runtime={runtime} theme={theme} />;
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
      onRevealProject={(project) => void revealProject(project)}
      onRemoveProject={(project, permanent) => void removeProject(project, permanent)}
      projects={projects}
      onToggleTheme={toggleTheme}
      theme={theme}
    />
  );
}

function RuntimeOfflineScreen({ runtime, error, theme, onAction, onToggleTheme }: {
  runtime: RuntimeWorkloadState;
  error: string | null;
  theme: ThemeMode;
  onAction: (action: RuntimeAction) => Promise<void>;
  onToggleTheme: () => void;
}) {
  return (
    <main className="runtime-offline-screen">
      <section>
        <span className="brand-mark">P4B<i /></span>
        <p>WINDOWS / RUNTIME CONTROL</p>
        <h1>Project workloads are off</h1>
        <p>API, STT engine, model workers và background tasks đã dừng. Runtime controller siêu nhẹ vẫn giữ màn hình này để có thể bật lại toàn bộ hệ thống.</p>
        <div className="runtime-offline-actions" role="menu"><RuntimeMenuItems onAction={onAction} runtime={runtime} /></div>
        {runtime.lastError || error ? <small role="alert">{runtime.lastError ?? error}</small> : null}
        <button className="runtime-theme-button" onClick={onToggleTheme} type="button">{theme === "light" ? "Dark mode" : "Light mode"}</button>
      </section>
    </main>
  );
}
