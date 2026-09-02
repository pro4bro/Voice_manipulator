import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { EngineStatus, Project, ProjectCreate, ThemeMode } from "../domain/types";
import { Icon } from "../ui/Icon";

interface ProjectHubProps {
  projects: Project[];
  engine: EngineStatus | null;
  defaultLocation: string;
  busy: boolean;
  error: string | null;
  onCreate: (project: ProjectCreate) => Promise<boolean>;
  onOpen: (project: Project) => void;
  onOpenExisting: (path: string) => Promise<boolean>;
  onPickLocation: (initialPath: string) => Promise<string | null>;
  onRetry: () => void;
  onRevealProject: (project: Project) => void;
  /** `permanent` erases the folder; otherwise the project only leaves the list. */
  onRemoveProject: (project: Project, permanent: boolean) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function newDraft(location: string): ProjectCreate {
  return { name: "", location, language: null, accent: null, sampleRate: null, purpose: null };
}

function projectInitials(name: string) {
  return name.split(/\s+/u).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export function ProjectHub({ projects, engine, defaultLocation, busy, error, onCreate, onOpen, onOpenExisting, onPickLocation, onRetry, onRevealProject, onRemoveProject, theme, onToggleTheme }: ProjectHubProps) {
  const [menu, setMenu] = useState<{ project: Project; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showCreate, setShowCreate] = useState(projects.length === 0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && menuRef.current?.contains(event.target)) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [menu]);
  const [draft, setDraft] = useState<ProjectCreate>(() => newDraft(defaultLocation));
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [pickingFolder, setPickingFolder] = useState(false);

  useEffect(() => {
    if (defaultLocation) setDraft((current) => current.location ? current : { ...current, location: defaultLocation });
  }, [defaultLocation]);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi-VN");
    if (!needle) return projects;
    return projects.filter((project) => [project.name, project.projectPath, project.language, project.accent]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("vi-VN").includes(needle)));
  }, [projects, query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.location.trim()) return;
    const created = await onCreate({ ...draft, name: draft.name.trim(), location: draft.location.trim() });
    if (created) {
      setDraft(newDraft(defaultLocation));
      setShowDetails(false);
      setShowCreate(false);
    }
  }

  async function browseLocation() {
    setPickingFolder(true);
    try {
      const selected = await onPickLocation(draft.location || defaultLocation);
      if (selected) setDraft((current) => ({ ...current, location: selected }));
    } finally {
      setPickingFolder(false);
    }
  }

  async function browseExistingProject() {
    setPickingFolder(true);
    try {
      const selected = await onPickLocation(defaultLocation);
      if (selected) await onOpenExisting(selected);
    } finally {
      setPickingFolder(false);
    }
  }

  return (
    <main className="project-hub">
      <header className="hub-header">
        <div className="brand-lockup" aria-label="Pro4Bro Voice Manipulator">
          <span className="brand-mark">P4B<i /></span>
          <span><b>PRO4BRO</b><strong>VOICE MANIPULATOR</strong></span>
        </div>
        <div className="hub-header__actions">
          <button aria-label={theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"} className="theme-toggle" onClick={onToggleTheme} title={theme === "light" ? "Dark mode" : "Light mode"} type="button"><Icon name={theme === "light" ? "moon" : "sun"} /></button>
          <div className={`engine-chip ${engine?.installed ? "is-ready" : "is-offline"}`}>
            <i /><span><b>OMNIVOICE</b><small>{engine?.installed ? `${engine.branch ?? "detached"} · ${engine.revision?.slice(0, 8)}` : "Engine offline"}</small></span>
          </div>
          <button className="button button--quiet" disabled={busy || pickingFolder} onClick={() => void browseExistingProject()} type="button"><Icon name="folder" />Open project</button>
          <button className="button button--accent" onClick={() => setShowCreate(true)} type="button"><Icon name="plus" />New project</button>
        </div>
      </header>

      <div className="hub-layout">
        <aside className="library-rail">
          <div className="library-rail__title"><span>PROJECT LIBRARY</span><b>Local Workspace</b></div>
          <nav aria-label="Project library">
            <button className="is-active" type="button"><Icon name="grid" /><span>All projects</span><b>{projects.length}</b></button>
            <button disabled type="button"><Icon name="folder" /><span>Collections</span><small>SOON</small></button>
            <button disabled type="button"><Icon name="waveform" /><span>Quick recordings</span><small>SOON</small></button>
          </nav>
          <div className="library-location"><span>DEFAULT LOCATION</span><b title={defaultLocation}>{defaultLocation || "Đang tải..."}</b></div>
          <div className="library-engine"><span><i />LOCAL PROCESSING</span><p>Dữ liệu project và audio không rời khỏi máy.</p></div>
        </aside>

        <section className="project-browser">
          <header className="project-browser__header">
            <div><span>LOCAL / PROJECTS</span><h1>Projects</h1><p>Mở lại phiên làm việc hoặc tạo một workspace mới.</p></div>
            <div className="browser-tools">
              <label className="project-search"><Icon name="search" /><input aria-label="Tìm project" onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" value={query} /></label>
              <div className="view-toggle" aria-label="Kiểu hiển thị">
                <button aria-label="Dạng lưới" className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} type="button"><Icon name="grid" /></button>
                <button aria-label="Dạng danh sách" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} type="button"><Icon name="list" /></button>
              </div>
            </div>
          </header>

          {error ? <div className="hub-error"><b>Local API chưa sẵn sàng</b><span>{error}</span><button onClick={onRetry} type="button">Thử lại</button></div> : null}

          <div className={`project-grid project-grid--${view}`}>
            <button className="project-card project-card--new" onClick={() => setShowCreate(true)} type="button">
              <span className="new-project-icon"><Icon name="plus" /></span><strong>New project</strong><small>Tạo workspace âm thanh mới</small>
            </button>
            {visibleProjects.map((project, index) => (
              <button className="project-card" key={project.id} onClick={() => onOpen(project)} onContextMenu={(event) => { event.preventDefault(); setMenu({ project, left: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), top: Math.max(8, Math.min(event.clientY, window.innerHeight - 200)) }); }} type="button">
                <span className="project-preview">
                  <b>{projectInitials(project.name) || "P4"}</b>
                  <span>{Array.from({ length: 28 }, (_, bar) => <i key={bar} style={{ height: `${18 + Math.abs(Math.sin((bar + index) * .51)) * 64}%` }} />)}</span>
                  <small>{project.sampleRate ? `${project.sampleRate / 1000} KHZ` : "AUDIO PROJECT"}</small>
                </span>
                <span className="project-card__copy"><strong>{project.name}</strong><small>{project.language?.toUpperCase() ?? "NO LANGUAGE"}{project.accent ? ` · ${project.accent.replace("vi-", "")}` : ""}</small><em title={project.projectPath}>{project.projectPath}</em></span>
                <footer><time>{new Date(project.updatedAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric" })}</time><span>OPEN PROJECT <Icon name="arrow" /></span></footer>
              </button>
            ))}
          </div>

          {menu ? <div className="project-context-menu" ref={menuRef} role="menu" style={{ left: menu.left, top: menu.top }}>
            <header><span>PROJECT</span><b>{menu.project.name}</b></header>
            <button onClick={() => { const target = menu.project; setMenu(null); onRevealProject(target); }} role="menuitem" type="button"><Icon name="folder" /> Reveal in Desktop</button>
            <button onClick={() => { const target = menu.project; setMenu(null); onRemoveProject(target, false); }} role="menuitem" type="button"><Icon name="back" /> Remove Project</button>
            <button className="project-context-menu__danger" onClick={() => { const target = menu.project; setMenu(null); onRemoveProject(target, true); }} role="menuitem" type="button"><Icon name="trash" /> Delete Project</button>
            <small>Remove chỉ bỏ khỏi danh sách, file vẫn còn trên ổ. Delete xóa cả thư mục project.</small>
          </div> : null}

          {!visibleProjects.length && query ? <div className="project-empty"><Icon name="search" /><b>Không tìm thấy project</b><span>Thử tên hoặc đường dẫn khác.</span></div> : null}
          <footer className="project-browser__footer"><span>{visibleProjects.length} PROJECT{visibleProjects.length === 1 ? "" : "S"}</span><span>PRO4BRO LOCAL LIBRARY</span></footer>
        </section>
      </div>

      {showCreate ? (
        <div className="create-project" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
          <button className="create-project__backdrop" aria-label="Đóng" onClick={() => projects.length && setShowCreate(false)} type="button" />
          <form onSubmit={submit}>
            <header><div><span>CREATE PROJECT</span><b>New local workspace</b></div><button aria-label="Đóng" disabled={!projects.length} onClick={() => setShowCreate(false)} type="button">×</button></header>
            <div className="create-project__intro"><span>01</span><div><h2 id="create-project-title">Project setup</h2><p>Chọn tên và nơi lưu. Mỗi project có thư mục asset, cache, job và export riêng.</p></div></div>
            <label><span>PROJECT NAME <b>REQUIRED</b></span><input autoFocus maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Tên project" value={draft.name} /></label>
            <label><span>Thư mục lưu project <b>REQUIRED</b></span><div className="location-input"><input aria-label="Thư mục lưu project" onChange={(event) => setDraft({ ...draft, location: event.target.value })} spellCheck={false} value={draft.location} /><button disabled={pickingFolder} onClick={() => void browseLocation()} type="button"><Icon name="folder" />{pickingFolder ? "Đang mở..." : "Browse"}</button></div><small>App sẽ tạo một thư mục mang tên project bên trong location này.</small></label>
            <button aria-expanded={showDetails} className="project-details-toggle" onClick={() => setShowDetails((value) => !value)} type="button"><span><Icon name="settings" /><b>Thông tin project</b><small>Tùy chọn · dùng để mô tả và chuẩn bị pipeline</small></span><Icon name="chevron" /></button>
            {showDetails ? (
              <div className="project-details">
                <label><span>Ngôn ngữ</span><select aria-label="Ngôn ngữ" onChange={(event) => setDraft({ ...draft, language: event.target.value || null })} value={draft.language ?? ""}><option value="">Không đặt</option><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
                <label><span>Chất giọng</span><select aria-label="Chất giọng" onChange={(event) => setDraft({ ...draft, accent: event.target.value || null })} value={draft.accent ?? ""}><option value="">Không đặt</option><option value="vi-South">Miền Nam</option><option value="vi-North">Miền Bắc</option><option value="vi-Central">Miền Trung</option></select></label>
                <label><span>Sample rate</span><select aria-label="Sample rate" onChange={(event) => setDraft({ ...draft, sampleRate: event.target.value ? Number(event.target.value) : null })} value={draft.sampleRate ?? ""}><option value="">Không đặt</option><option value="24000">24 kHz · OmniVoice</option><option value="44100">44.1 kHz</option><option value="48000">48 kHz · Production</option></select></label>
              </div>
            ) : null}
            <footer><button className="button button--quiet" disabled={!projects.length} onClick={() => setShowCreate(false)} type="button">Cancel</button><button className="button button--accent" disabled={busy || !draft.name.trim() || !draft.location.trim()} type="submit">{busy ? "Creating..." : "Create project"}<Icon name="arrow" /></button></footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
