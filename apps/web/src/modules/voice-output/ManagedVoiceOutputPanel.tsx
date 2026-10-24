import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { VoiceOutput, VoiceOutputExportMode, VoiceScriptDocument, SpeakerProfile } from "../../domain/types";
import type { VoiceVersionsController, VoiceOutputSession, VoiceOutputSessionVersion } from "../../app/useVoiceVersions";
import { api } from "../../api/client";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { OutputSlotMenu, type OutputSlotMenuAction } from "../../ui/OutputSlotMenu";
import { OutputRecycleBin, OutputSlotActions } from "../../ui/OutputSlotLifecycle";
import type { SendTarget } from "../../ui/SendToMenu";
import "./managed-voice-output-panel.css";

export interface PendingVoiceOutput {
  id: string;
  name: string;
  text: string;
  status: "starting" | "running" | "error" | "cancelled";
  detail?: string;
  completedRows?: number;
  totalRows?: number;
}

export interface ManagedVoiceOutputPanelProps {
  controller: VoiceVersionsController;
  projectId: string;
  outputs: VoiceOutput[];
  speakers: SpeakerProfile[];
  pendingOutput?: PendingVoiceOutput | null;
  onSendTo?: (target: SendTarget, outputs: VoiceOutput[]) => void;
  onExport?: (output: VoiceOutput, mode: VoiceOutputExportMode) => void;
  generationBusy?: boolean;
}

type SlotMenu = { x: number; y: number; slotId: string; versionId?: string };
type DialogState = { kind: "rename"; id: string; value: string } | { kind: "remove"; id: string; label: string } | { kind: "history"; versionId: string } | null;

function clock(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${(safe % 60).toFixed(1).padStart(4, "0")}`;
}

function scriptText(document: VoiceScriptDocument | null | undefined) {
  return document?.rows.map((row) => row.text).filter(Boolean).join("\n") || "No Script text in this snapshot.";
}

function outputFor(version: VoiceOutputSessionVersion, outputs: VoiceOutput[]) {
  const outputId = version.outputId ?? version.state.outputId;
  return outputId ? outputs.find((output) => output.id === outputId) ?? null : null;
}

function latestVersion(session: VoiceOutputSession) {
  return session.versions.at(-1) ?? null;
}

function versionForSession(session: VoiceOutputSession, activeVersionId: string | null) {
  return session.versions.find((version) => version.id === activeVersionId) ?? latestVersion(session);
}

function IconAction({ name, label, disabled, onClick }: { name: "file-plus" | "copy"; label: string; disabled: boolean; onClick: () => void }) {
  return <button aria-label={label} className="managed-voice-output__icon-action" disabled={disabled} onClick={onClick} title={label} type="button"><Icon name={name} /></button>;
}

function HistoryDialog({ version, onClose }: { version: VoiceOutputSessionVersion; onClose: () => void }) {
  const snapshots = useMemo(() => [...version.state.history].reverse(), [version]);
  const [selection, setSelection] = useState(-1);
  const selected = selection < 0 ? null : snapshots[selection] ?? null;
  const snapshotScript = selected?.script && typeof selected.script === "object" ? selected.script as VoiceScriptDocument : null;
  return createPortal(<div className="managed-voice-output__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-label={`Text History: ${version.name}`} aria-modal="true" className="managed-voice-output__history" role="dialog">
      <header><div><span>TEXT HISTORY</span><strong>{version.name}</strong></div><button aria-label="Close Text History" onClick={onClose} type="button">×</button></header>
      <div className="managed-voice-output__history-body">
        <nav aria-label="Script snapshots">
          <button aria-current={selection === -1 ? "true" : undefined} className={selection === -1 ? "is-active" : ""} onClick={() => setSelection(-1)} type="button"><b>Current Script</b><small>Saved in this Version</small></button>
          {snapshots.map((snapshot, index) => <button aria-current={selection === index ? "true" : undefined} className={selection === index ? "is-active" : ""} key={`${snapshot.at ?? "snapshot"}-${index}`} onClick={() => setSelection(index)} type="button"><b>Before change</b><small>{typeof snapshot.at === "string" ? new Date(snapshot.at).toLocaleString() : `Snapshot ${snapshots.length - index}`}</small></button>)}
          {!snapshots.length ? <span>No earlier snapshots.</span> : null}
        </nav>
        <article><pre>{scriptText(snapshotScript ?? (selected ? null : version.state.script))}</pre></article>
      </div>
    </section>
  </div>, document.body);
}

export function ManagedVoiceOutputPanel({ controller, projectId, outputs, speakers, pendingOutput = null, onSendTo, onExport, generationBusy = false }: ManagedVoiceOutputPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(controller.book?.activeSessionId ?? null);
  const [slotMenu, setSlotMenu] = useState<SlotMenu | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const busy = controller.busy || generationBusy;
  const book = controller.book;
  const activeSession = book?.sessions.find((session) => session.id === book.activeSessionId) ?? null;
  const activeVersion = controller.activeVersion;

  useEffect(() => {
    if (activeSession) setExpanded(activeSession.id);
  }, [activeSession?.id]);

  function openSession(session: VoiceOutputSession) {
    const target = versionForSession(session, book?.activeVersionId ?? null);
    if (target && target.id !== book?.activeVersionId && !busy) void controller.change("select", target.id);
  }

  function toggleExpanded(sessionId: string) {
    setExpanded((current) => current === sessionId ? null : sessionId);
  }

  function showMenu(event: MouseEvent<HTMLElement>, slotId: string, versionId?: string) {
    event.preventDefault();
    event.stopPropagation();
    setSlotMenu({ x: event.clientX, y: event.clientY, slotId, ...(versionId ? { versionId } : {}) });
  }

  function showKeyboardMenu(event: KeyboardEvent<HTMLElement>, slotId: string, versionId?: string) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setSlotMenu({ x: rect.left + Math.min(rect.width / 2, 220), y: rect.top + Math.min(rect.height / 2, 32), slotId, ...(versionId ? { versionId } : {}) });
  }

  async function revealOutput(output: VoiceOutput) {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(output.id)}/reveal`, { method: "POST" });
      if (!response.ok) throw new Error(`Reveal failed (${response.status}).`);
    } catch (reason) {
      setInteractionError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function revealFolder() {
    try { await api.revealProjectFolder(projectId); }
    catch (reason) { setInteractionError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function createVersionFrom(version: VoiceOutputSessionVersion) {
    if (busy) return;
    if (version.id !== book?.activeVersionId) {
      const selected = await controller.change("select", version.id);
      if (!selected) return;
    }
    await controller.change("version");
  }

  async function doSend(target: SendTarget, output: VoiceOutput | null) {
    if (busy || !output || !onSendTo || output.audioAvailable === false || output.duration <= 0) return;
    if (target === "voice-training") return;
    onSendTo(target, [output]);
  }

  async function exportSlot(id: string, kind: "session" | "version") {
    if (busy) return;
    if (!await controller.flush()) throw new Error("Chưa lưu được Version; kiểm tra lỗi trước khi Export.");
    await api.exportVoiceOutputSlot(projectId, id, kind);
  }

  async function removeSlot(id: string) {
    if (busy) return;
    await controller.slotAction(id, "remove");
  }

  function exportActionsFor(id: string, kind: "session" | "version", output: VoiceOutput | null): OutputSlotMenuAction[] {
    const actions: OutputSlotMenuAction[] = [{ id: "package", label: `Export ${kind === "session" ? "Session" : "Version"} package (ZIP)`, disabled: busy,
      onSelect: () => { void exportSlot(id, kind).catch((reason) => setInteractionError(String(reason))); } }];
    if (kind === "version" && output && onExport) {
      const formats: Array<[VoiceOutputExportMode, string, boolean]> = [
        ["audio", "WAV", output.audioAvailable !== false], ["line", "SRT lines", !!output.segments?.length],
        ["word", "SRT words", !!output.words?.some((word) => word.timingTrusted !== false)],
        ["sentence", "SRT sentences", !!output.segments?.length], ["table", "Timing table", !!output.segments?.length],
      ];
      for (const [mode, label, available] of formats) if (available) actions.push({ id: `export-${mode}`, label: `Export ${label}`, disabled: busy, onSelect: () => onExport(output, mode) });
    }
    return actions;
  }

  function actionsFor(slot: VoiceOutputSession | VoiceOutputSessionVersion): OutputSlotMenuAction[] {
    const version = "state" in slot ? slot : versionForSession(slot, book?.activeVersionId ?? null);
    const session = "state" in slot ? book?.sessions.find((item) => item.versions.some((itemVersion) => itemVersion.id === slot.id)) : slot;
    const output = version ? outputFor(version, outputs) : null;
    const actions: OutputSlotMenuAction[] = [];
    actions.push(...exportActionsFor(slot.id, "state" in slot ? "version" : "session", output));
    if (version) actions.push({ id: "open", label: version.id === book?.activeVersionId ? "Selected" : "Open / Select", disabled: busy || version.disabled || !!session?.disabled, onSelect: () => { if (version.id !== book?.activeVersionId) void controller.change("select", version.id); } });
    if (version) actions.push({ id: "new-version", label: "New Version", disabled: busy || version.disabled || !!session?.disabled, onSelect: () => void createVersionFrom(version) });
    actions.push({ id: "rename", label: "Rename…", disabled: busy, onSelect: () => setDialog({ kind: "rename", id: slot.id, value: slot.name }) });
    if (version) actions.push({ id: "history", label: "Text History", disabled: busy, onSelect: () => setDialog({ kind: "history", versionId: version.id }) });
    if (output && onSendTo) {
      const sendable = output.audioAvailable !== false && output.duration > 0;
      actions.push({ id: "send-training", label: "Send to Training · footage only", disabled: true, onSelect: () => undefined });
      actions.push({ id: "send-manipulator", label: "Send to Voice Manipulation", disabled: busy || !sendable, onSelect: () => void doSend("voice-manipulator", output) });
      actions.push({ id: "send-lipsync", label: "Send to LipSync", disabled: busy || !sendable, onSelect: () => void doSend("lip-sync", output) });
    }
    if (output) actions.push({ id: "reveal-output", label: "Reveal in Explorer", disabled: busy || output.audioAvailable === false, onSelect: () => void revealOutput(output) });
    actions.push({ id: "reveal-project", label: "Reveal Project Folder", disabled: busy, onSelect: () => void revealFolder() });
    const disabled = "disabled" in slot && slot.disabled;
    actions.push({ id: "disable", label: disabled ? "Enable" : "Disable", disabled: busy, onSelect: () => void controller.slotAction(slot.id, "disable") });
    actions.push({ id: "remove", label: "Remove…", destructive: true, disabled: busy, onSelect: () => setDialog({ kind: "remove", id: slot.id, label: slot.name }) });
    return actions;
  }

  const menuSlot = slotMenu && book ? (slotMenu.versionId
    ? book.sessions.flatMap((session) => session.versions).find((version) => version.id === slotMenu.versionId)
    : book.sessions.find((session) => session.id === slotMenu.slotId)) : null;

  function runRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.kind !== "rename" || busy || !dialog.value.trim()) return;
    const current = dialog;
    setDialog(null);
    void controller.slotAction(current.id, "rename", current.value.trim());
  }

  function runRemove() {
    if (dialog?.kind !== "remove" || busy) return;
    const { id } = dialog;
    setDialog(null);
    void controller.slotAction(id, "remove");
  }

  return <ModuleFrame className="managed-voice-output" eyebrow="GENERATED SPEECH" index="VO" title="Voice Output" action={<div className="managed-voice-output__header-actions">
    <IconAction name="file-plus" label="New Session" disabled={!controller.ready || busy} onClick={() => void controller.change("session")} />
    <IconAction name="copy" label="New Version" disabled={!activeVersion || busy} onClick={() => void controller.change("version")} />
  </div>}>
    {controller.error || interactionError ? <div className="managed-voice-output__error" role="alert"><span>{controller.error ?? interactionError}</span><button disabled={busy} onClick={() => { setInteractionError(null); void controller.reload(); }} type="button">Reload</button></div> : null}
    {!controller.ready ? <p className="managed-voice-output__loading" role="status">Loading Voice Output Sessions…</p> : null}
    {book?.sessions.length ? <div aria-label="Voice Output Sessions" className="managed-voice-output__sessions">
      {book.sessions.map((session) => {
        const selectedVersion = versionForSession(session, book.activeVersionId);
        const expandedSession = expanded === session.id;
        const sessionOutput = selectedVersion ? outputFor(selectedVersion, outputs) : null;
        const hasOutputId = !!(selectedVersion?.outputId ?? selectedVersion?.state.outputId);
        const status = session.disabled ? "Disabled" : selectedVersion?.disabled ? "Version disabled" : sessionOutput?.audioAvailable === false || (hasOutputId && !sessionOutput) ? "Audio unavailable" : sessionOutput ? "Ready" : "Waiting for output";
        const speaker = sessionOutput ? speakers.find((item) => item.id === sessionOutput.speakerProfileId) : null;
        return <article aria-current={session.id === book.activeSessionId ? "true" : undefined} className={`managed-voice-output__session ${session.id === book.activeSessionId ? "is-active" : ""} ${session.disabled ? "is-disabled" : ""}`} key={session.id} onContextMenu={(event) => showMenu(event, session.id)} onKeyDown={(event) => showKeyboardMenu(event, session.id)}>
          <div className="managed-voice-output__session-main">
            <button aria-label={`Open ${session.name}`} className="managed-voice-output__session-open" disabled={busy || !selectedVersion || session.disabled || selectedVersion.disabled} onClick={() => openSession(session)} type="button">
              <span className="managed-voice-output__session-copy"><strong>{session.name}</strong><small>{session.versions.length} {session.versions.length === 1 ? "Version" : "Versions"} · {status}</small></span>
              <span className="managed-voice-output__session-preview">{sessionOutput ? <><b>{sessionOutput.text || "(empty text)"}</b><small><i style={{ backgroundColor: speaker?.color ?? "var(--text-subtle)" }} />{sessionOutput.voiceName} · {clock(sessionOutput.duration)}</small></> : <small>No generated audio yet</small>}</span>
            </button>
            <OutputSlotActions label={session.name} exportActions={exportActionsFor(session.id, "session", sessionOutput)} disabled={busy} onExport={() => exportSlot(session.id, "session")} onDelete={() => removeSlot(session.id)} />
            <button aria-label={`${expandedSession ? "Collapse" : "Expand"} ${session.name} Versions`} aria-expanded={expandedSession} className="managed-voice-output__expand" onClick={() => toggleExpanded(session.id)} type="button"><Icon name="chevron" /></button>
          </div>
          {expandedSession ? <div aria-label={`${session.name} Versions`} className="managed-voice-output__versions">
            {session.versions.map((version) => {
              const output = outputFor(version, outputs);
              const profile = output ? speakers.find((item) => item.id === output.speakerProfileId) : null;
              const isSelected = version.id === book.activeVersionId;
              return <div className="managed-voice-output__version-row" key={version.id}><button aria-pressed={isSelected} className={`managed-voice-output__version ${isSelected ? "is-active" : ""} ${version.disabled ? "is-disabled" : ""}`} disabled={busy || version.disabled || session.disabled} onClick={() => { if (!isSelected) void controller.change("select", version.id); }} onContextMenu={(event) => showMenu(event, session.id, version.id)} onKeyDown={(event) => showKeyboardMenu(event, session.id, version.id)} type="button">
                <span className="managed-voice-output__version-mark" aria-hidden="true" style={profile?.color ? { backgroundColor: profile.color } : undefined} />
                <span className="managed-voice-output__version-copy"><strong>{version.name}{isSelected ? <em>ACTIVE</em> : null}</strong><small>{version.disabled ? "Disabled" : output ? `${output.voiceName} · ${clock(output.duration)} · ${new Date(output.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for generated audio"}</small><span>{output?.text || (version.state.script.rows.length ? scriptText(version.state.script).replaceAll("\n", " · ") : "No Script text yet")}</span></span>

              </button><OutputSlotActions label={version.name} exportActions={exportActionsFor(version.id, "version", output)} disabled={busy} onExport={() => exportSlot(version.id, "version")} onDelete={() => removeSlot(version.id)} /></div>;
            })}
            {activeSession?.id === session.id && pendingOutput ? <div aria-label="Pending Voice Output" className={`managed-voice-output__pending is-${pendingOutput.status}`} role="status"><i /><span><strong>{pendingOutput.name || "Generating Voice Output"}</strong><small>{pendingOutput.detail || pendingOutput.text || (pendingOutput.totalRows ? `${pendingOutput.completedRows ?? 0}/${pendingOutput.totalRows} rows` : pendingOutput.status)}</small></span>{pendingOutput.totalRows ? <b>{pendingOutput.completedRows ?? 0}/{pendingOutput.totalRows}</b> : null}</div> : null}
          </div> : null}
        </article>;
      })}
    </div> : controller.ready ? <div className="managed-voice-output__empty"><Icon name="waveform" /><b>No Voice Output Sessions yet</b><span>Create a Session, then generate speech. New output stays in the selected Version.</span><button disabled={busy} onClick={() => void controller.change("session")} type="button">New Session</button>{pendingOutput ? <small role="status">{pendingOutput.name}: {pendingOutput.detail || pendingOutput.status}</small> : null}</div> : null}
    {book?.recycle?.length ? <OutputRecycleBin entries={book.recycle} busy={busy} onRestore={(entry) => controller.slotAction(entry.id, "restore")} onPurge={(entry) => controller.slotAction(entry.id, "purge")} onEmpty={() => controller.slotAction("all", "empty-bin")} /> : null}
    {slotMenu && menuSlot ? <OutputSlotMenu x={slotMenu.x} y={slotMenu.y} label={menuSlot.name} onClose={() => setSlotMenu(null)} actions={actionsFor(menuSlot)} /> : null}
    {dialog?.kind === "rename" ? createPortal(<div className="managed-voice-output__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><form aria-label={`Rename ${dialog.value}`} aria-modal="true" className="managed-voice-output__dialog" onSubmit={runRename} role="dialog"><label>Rename slot<input autoFocus onChange={(event) => setDialog({ ...dialog, value: event.target.value })} value={dialog.value} /></label><footer><button onClick={() => setDialog(null)} type="button">Cancel</button><button disabled={busy || !dialog.value.trim()} type="submit">Save name</button></footer></form></div>, document.body) : null}
    {dialog?.kind === "remove" ? createPortal(<div className="managed-voice-output__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><section aria-label={`Remove ${dialog.label}`} aria-modal="true" className="managed-voice-output__dialog" role="dialog"><strong>Move {dialog.label} to Recycle Bin?</strong><p>Its Script, settings, subtitles and generated audio stay together in Recycle Bin. You can restore them later.</p><footer><button onClick={() => setDialog(null)} type="button">Cancel</button><button className="is-danger" disabled={busy} onClick={runRemove} type="button">Move to Recycle Bin</button></footer></section></div>, document.body) : null}
    {dialog?.kind === "history" ? (() => { const version = book?.sessions.flatMap((session) => session.versions).find((item) => item.id === dialog.versionId); return version ? <HistoryDialog version={version} onClose={() => setDialog(null)} /> : null; })() : null}
  </ModuleFrame>;
}
