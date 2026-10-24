import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { OutputSlotMenu, type OutputSlotMenuAction } from "./OutputSlotMenu";
import "./output-slot-lifecycle.css";

import type { OutputRecycleEntry } from "../domain/output-lifecycle";
export type { OutputRecycleEntry } from "../domain/output-lifecycle";

/** Shared presentation for source footage and finished-product recycle bins. */
export function RecycleBinPanel({ count, open, onToggle, onEmpty, busy = false, title = "RECYCLE BIN", children }: {
  count: number; open: boolean; onToggle: () => void; onEmpty?: () => void;
  busy?: boolean; title?: string; children: ReactNode;
}) {
  if (!count) return null;
  return <section className={`media-recycle-bin output-recycle-bin ${open ? "is-open" : ""}`}>
    <div className="media-recycle-bin__header output-recycle-bin__header">
      <button aria-expanded={open} className="media-recycle-bin__toggle output-recycle-bin__toggle" onClick={onToggle} type="button"><Icon name="trash" /><b>{title}</b><span>{count}</span><i aria-hidden="true">{open ? "▾" : "▸"}</i></button>
      {onEmpty ? <button aria-label="Empty Recycle Bin" className="media-recycle-bin__empty output-recycle-bin__empty" disabled={busy} onClick={onEmpty} title="Empty Recycle Bin" type="button"><Icon name="trash" /></button> : null}
    </div>
    {open ? <div className="media-recycle-bin__list output-recycle-bin__list">{children}</div> : null}
  </section>;
}

export function OutputSlotActions({ label, disabled = false, onExport, onDelete, exportActions }: {
  label: string;
  disabled?: boolean;
  onExport: () => void | Promise<unknown>;
  onDelete: () => void | Promise<unknown>;
  exportActions?: OutputSlotMenuAction[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  async function invoke(action: () => void | Promise<unknown>) {
    setError(null);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  return <span className="output-slot-lifecycle__actions" aria-label={`${label} actions`}>
    {error ? <span className="output-slot-lifecycle__error" role="alert">{error}</span> : null}
    <button aria-label={`Export ${label}`} aria-haspopup={exportActions ? "menu" : undefined} className="output-slot-lifecycle__icon" disabled={disabled} onClick={(event) => { event.stopPropagation(); if (exportActions) { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left, y: rect.bottom }); } else void invoke(onExport); }} title={`Export ${label}`} type="button"><Icon name="download" /></button>
    <button aria-label={`Move ${label} to Recycle Bin`} className="output-slot-lifecycle__icon is-danger" disabled={disabled} onClick={(event) => { event.stopPropagation(); if (window.confirm(`Move ${label} to Recycle Bin? You can restore it later.`)) void invoke(onDelete); }} title="Move to Recycle Bin" type="button"><Icon name="trash" /></button>
    {menu && exportActions ? <OutputSlotMenu {...menu} label={`Export ${label}`} onClose={() => setMenu(null)} actions={exportActions} /> : null}
  </span>;
}

export function OutputRecycleBin({ entries, busy = false, onRestore, onPurge, onEmpty }: {
  entries: OutputRecycleEntry[];
  busy?: boolean;
  onRestore: (entry: OutputRecycleEntry) => void | Promise<unknown>;
  onPurge: (entry: OutputRecycleEntry) => void | Promise<unknown>;
  onEmpty: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function invoke(action: () => void | Promise<unknown>) {
    setError(null);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  if (!entries.length) return null;
  return <RecycleBinPanel count={entries.length} open={open} onToggle={() => setOpen((value) => !value)} busy={busy} onEmpty={() => { if (window.confirm(`Permanently delete all ${entries.length} items in Recycle Bin? This cannot be undone.`)) void invoke(onEmpty); }}>
    {error ? <p className="output-recycle-bin__error" role="alert">{error}</p> : null}
    <div aria-label="Output Recycle Bin">
      <p>Deleted output slots stay here until restored or permanently deleted.</p>
      {entries.map((entry) => <div className="output-recycle-bin__entry" key={`${entry.kind}:${entry.id}`}>
        <span><b>{entry.name}</b><small>{entry.kind === "session" ? "SESSION" : `VERSION${entry.parentSessionName ? ` · ${entry.parentSessionName}` : ""}`} · {new Date(entry.deletedAt).toLocaleString()}</small></span>
        <button disabled={busy} onClick={() => void invoke(() => onRestore(entry))} type="button">Restore</button>
        <button className="is-danger" disabled={busy} onClick={() => { if (window.confirm(`Permanently delete ${entry.name}? This cannot be undone.`)) void invoke(() => onPurge(entry)); }} type="button">Delete permanently</button>
      </div>)}
    </div>
  </RecycleBinPanel>;
}
