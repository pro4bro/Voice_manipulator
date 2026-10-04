import { useEffect, useRef, useState, type KeyboardEvent } from "react";

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

  async function removeProjects(projectsToForget: Project[]) {
    const results = await Promise.allSettled(projectsToForget.map((project) => api.forgetProject(project.id)));
    const forgotten = projectsToForget.filter((_, index) => results[index].status === "fulfilled");
    const forgottenIds = new Set(forgotten.map((project) => project.id));
    if (forgottenIds.size) setProjects((current) => current.filter((project) => !forgottenIds.has(project.id)));
    if (forgotten.length !== projectsToForget.length) {
      const failedNames = projectsToForget.filter((_, index) => results[index].status === "rejected").map((project) => project.name);
      setError(`Đã bỏ ${forgotten.length}/${projectsToForget.length} project khỏi danh sách. Không thể bỏ: ${failedNames.join(", ")}.`);
    }
  }

  async function deleteProjects(projectsToDelete: Project[]) {
    const results = await Promise.allSettled(projectsToDelete.map((project) => api.destroyProject(project.id)));
    const deleted = projectsToDelete.filter((_, index) => results[index].status === "fulfilled");
    const deletedIds = new Set(deleted.map((project) => project.id));
    if (deletedIds.size) setProjects((current) => current.filter((project) => !deletedIds.has(project.id)));
    if (deleted.length !== projectsToDelete.length) {
      const failedNames = projectsToDelete.filter((_, index) => results[index].status === "rejected").map((project) => project.name);
      setError(`Đã xóa ${deleted.length}/${projectsToDelete.length} project. Không thể xóa: ${failedNames.join(", ")}.`);
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

  // Runtime availability does not end the editing session. Unmounting here
  // discards footage selection, Script follow, scroll and transcript cursors.
  if (activeProject) {
    const reconnecting = Boolean(runtime && (runtime.busy || runtime.overall !== "running"));
    return <>
      <div className="workspace-runtime-content" inert={reconnecting}>
        <WorkspaceShell key={activeProject.id} engine={engine} onBack={() => setActiveProject(null)} onPageChange={changePage} onRuntimeAction={controlRuntime} onToggleTheme={toggleTheme} project={activeProject} runtime={runtime} theme={theme} />
      </div>
      {reconnecting && runtime ? <RuntimeRecoveryOverlay error={error} onAction={controlRuntime} onToggleTheme={toggleTheme} runtime={runtime} theme={theme} /> : null}
    </>;
  }

  if (loading) {
    return <main className="boot-screen"><img alt="Pro4Bro" className="brand-mark" src="/pro4bro-logo.png" /><b>Đang khởi động local workspace</b><div><i /><i /><i /></div></main>;
  }

  if (runtime && !runtime.busy && runtime.overall !== "running") {
    return <RuntimeOfflineScreen error={error} onAction={controlRuntime} onToggleTheme={toggleTheme} runtime={runtime} theme={theme} />;
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
      onRemoveProjects={(projectsToForget) => void removeProjects(projectsToForget)}
      onDeleteProjects={(projectsToDelete) => void deleteProjects(projectsToDelete)}
      projects={projects}
      onToggleTheme={toggleTheme}
      theme={theme}
    />
  );
}

function RuntimeRecoveryOverlay(props: Parameters<typeof RuntimeOfflineScreen>[0]) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Workspace shortcuts must not act on the retained editing surface.
    event.stopPropagation();
    if (event.key !== "Tab") return;
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    const first = buttons?.[0];
    const last = buttons?.[buttons.length - 1];
    const focused = document.activeElement;
    if (!first || !last) { event.preventDefault(); return; }
    if (focused === dialog.current || (event.shiftKey ? focused === first : focused === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
  return <div aria-label="Kết nối lại runtime" aria-modal="true" className="runtime-recovery-overlay" onKeyDown={handleKeyDown} ref={dialog} role="dialog" tabIndex={-1}>
    <RuntimeOfflineScreen {...props} />
  </div>;
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
        <img alt="Pro4Bro" className="brand-mark" src="/pro4bro-logo.png" />
        <p>WINDOWS / RUNTIME CONTROL</p>
        <h1>{runtime.busy ? "Đang kết nối lại runtime" : "Runtime chưa sẵn sàng"}</h1>
        <p>{runtime.busy ? "Đang xử lý yêu cầu runtime. Workspace sẽ tiếp tục khi các dịch vụ sẵn sàng." : "Một hoặc nhiều dịch vụ đang dừng hoặc không khả dụng. Bật lại hoặc restart để tiếp tục."} Project và lựa chọn trong workspace đang mở được giữ lại.</p>
        <div className="runtime-offline-actions" role="menu"><RuntimeMenuItems onAction={onAction} runtime={runtime} /></div>
        {runtime.lastError || error ? <small role="alert">{runtime.lastError ?? error}</small> : null}
        <button className="runtime-theme-button" onClick={onToggleTheme} type="button">{theme === "light" ? "Dark mode" : "Light mode"}</button>
      </section>
    </main>
  );
}
