import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ActivityTask, ProjectMediaAsset } from "../../domain/types";
import { buildQueueSlots, isQueueDone, queueCategories, queueProgress, type QueueCategory, type QueueSlot, type QueueTask } from "./project-queue-model";
import "./project-queue.css";

interface ProjectQueueDialogProps {
  projectId: string;
  projectName?: string;
  tasks: ActivityTask[];
  assets?: ProjectMediaAsset[];
  onClose: () => void;
}

const percentFormat = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });
const percent = (value: number | null) => value === null ? "—" : percentFormat.format(value);
const statusText: Record<QueueSlot["status"], string> = { running: "Đang chạy", queued: "Đang chờ", failed: "Lỗi", cancelled: "Đã hủy", interrupted: "Bị gián đoạn", complete: "Hoàn tất" };
const operationOrder = ["import", "stt", "alignment", "diarization"];
const operationLabels: Record<string, string> = { import: "Import", stt: "STT", alignment: "Align Subtitle", diarization: "Speaker Diarization", training: "Training", tts: "Generate", generate: "Generate", lipsync: "Lip Sync", lip_sync: "Lip Sync", export: "Export" };
const operationLabel = (kind: string) => operationLabels[kind.toLowerCase()] ?? kind;

export function ProjectQueueDialog({ projectId, projectName, tasks, assets = [], onClose }: ProjectQueueDialogProps) {
  const [category, setCategory] = useState<QueueCategory>("footage");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  const slots = buildQueueSlots(projectTasks, category, assets);
  const active = slots.filter((slot) => !isQueueDone(slot));
  const done = slots.filter(isQueueDone);
  const progress = queueProgress(slots);
  const runningCount = slots.filter((slot) => slot.status === "running").length;
  const queuedCount = slots.filter((slot) => slot.status === "queued").length;
  const attentionCount = slots.filter((slot) => slot.status === "failed" || slot.status === "cancelled" || slot.status === "interrupted").length;

  useEffect(() => { setCategory("footage"); setCollapsed([]); }, [projectId]);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]')];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); triggerRef.current?.focus(); };
  }, [onClose]);

  function toggle(id: string) { setCollapsed((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]); }
  function renderSlot(slot: QueueSlot) {
    const opened = !collapsed.includes(slot.id);
    const operations = [...slot.tasks].sort((a, b) => {
      const left = operationOrder.indexOf(a.kind.toLowerCase());
      const right = operationOrder.indexOf(b.kind.toLowerCase());
      return (left < 0 ? operationOrder.length : left) - (right < 0 ? operationOrder.length : right) || a.startedAt.localeCompare(b.startedAt);
    });
    function renderStep(task: QueueTask, depth = 0): ReactNode {
      const childTasks = task.children ?? [];
      const asset = assets.find((item) => item.id === task.assetId);
      const label = category !== "footage" ? task.label : asset && asset.name !== slot.label
        ? `${operationLabel(task.kind)} · ${asset.name}` : operationLabel(task.kind);
      return <li className={`project-queue__step is-${task.status}`} key={task.id} style={{ "--step-depth": depth } as CSSProperties}>
        <div className="project-queue__step-main"><span>{label}</span><small>{statusText[task.status as QueueSlot["status"]] ?? task.status} · {percent(task.fraction)}</small><progress aria-label={`${label} ${percent(task.fraction)}`} max="1" value={task.fraction ?? undefined} /></div>
        {task.detail || task.error ? <details className="project-queue__step-details"><summary>Chi tiết</summary><p>{task.detail}</p>{task.error ? <p>{task.error}</p> : null}</details> : null}
        {childTasks.length ? <ul className="project-queue__nested">{childTasks.map((child) => renderStep(child, depth + 1))}</ul> : null}
      </li>;
    }
    return <article className={`project-queue__slot is-${slot.status}`} key={slot.id}>
      <button className="project-queue__slot-head" type="button" aria-expanded={opened} onClick={() => toggle(slot.id)}>
        <span className="project-queue__slot-name"><span>{slot.label}</span><small>{slot.currentOperation ? operationLabel(slot.currentOperation.kind) : ""}</small></span>
        <span className="project-queue__slot-state">{statusText[slot.status]}</span>
        <strong>{percent(slot.fraction)}</strong>
      </button>
      <progress aria-label={`${slot.label} ${percent(slot.fraction)}`} max="1" value={slot.fraction ?? undefined} />
      {opened ? <><ul className="project-queue__children">{operations.map((task) => renderStep(task))}</ul>{slot.history.length ? <details className="project-queue__history"><summary>Lịch sử cũ · {slot.history.length}</summary><ul>{slot.history.map((task) => <li key={task.id}>{operationLabel(task.kind)} · {statusText[task.status as QueueSlot["status"]] ?? task.status} · {percent(task.fraction)}</li>)}</ul></details> : null}</> : null}
    </article>;
  }

  return <div className="project-queue__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-label="Queue" aria-modal="true" className="project-queue" ref={dialogRef} role="dialog" tabIndex={-1}>
      <header className="project-queue__header"><div><h2>Queue</h2><small>{projectName ?? "Project"}</small></div><span>{runningCount} chạy · {queuedCount} chờ{attentionCount ? ` · ${attentionCount} cần xem lại` : ""}</span><button aria-label="Đóng Queue" onClick={onClose} type="button">×</button></header>
      <div className="project-queue__tabs" role="tablist" aria-label="Nhóm tác vụ">{queueCategories.map((tab) => {
        const count = buildQueueSlots(projectTasks, tab.id, assets).filter((slot) => !isQueueDone(slot)).length;
        return <button aria-selected={category === tab.id} id={`queue-tab-${tab.id}`} key={tab.id} onClick={() => setCategory(tab.id)} onKeyDown={(event) => {
          const tabs = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
          const index = tabs.indexOf(event.currentTarget);
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
            : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
              : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0 || !tabs[next]) return;
          event.preventDefault();
          tabs[next].focus();
          setCategory(queueCategories[next].id);
        }} role="tab" type="button">{tab.label}<span>{count}</span></button>;
      })}</div>
      <div aria-labelledby={`queue-tab-${category}`} className="project-queue__content" role="tabpanel">
        <div className="project-queue__overall"><span>Tiến trình tổng <b>{percent(progress)}</b></span><small>{done.length}/{slots.length} Done</small></div>
        <progress aria-label="Tiến trình tổng" max="1" value={progress ?? undefined} />
        <h3>Đang chờ & thực thi <span>{active.length}</span></h3>
        {active.length ? active.map(renderSlot) : <p className="project-queue__empty">Không có tác vụ</p>}
        <section className="project-queue__done"><h3>Done <span>{done.length}</span></h3>{done.length ? done.map(renderSlot) : <p className="project-queue__empty">Chưa có tác vụ hoàn tất</p>}</section>
      </div>
    </section>
  </div>;
}
