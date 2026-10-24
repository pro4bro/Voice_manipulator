import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "../../api/client";
import type { LipSyncSendRequest, LipSyncSessions } from "../../domain/lipsync";
import { OutputSlotMenu, type OutputSlotMenuAction } from "../../ui/OutputSlotMenu";
import { OutputRecycleBin, OutputSlotActions } from "../../ui/OutputSlotLifecycle";
import { LipSyncWorkspace, type LipSyncWorkspaceController, type LipSyncWorkspaceProps } from "./LipSyncWorkspace";

interface Props extends Omit<LipSyncWorkspaceProps, "versionId" | "videoOutputPanel" | "controllerRef"> {
  incoming?: LipSyncSendRequest | null;
  onIncomingConsumed?: (id: string) => void;
  navigationRef?: MutableRefObject<(() => Promise<boolean>) | null>;
}

/** Selection lives above the editor so each mounted slot owns its jobs and draft. */
export function LipSyncPage({ incoming, onIncomingConsumed, navigationRef, ...props }: Props) {
  const [book, setBook] = useState<LipSyncSessions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotMenu, setSlotMenu] = useState<{ x: number; y: number; sessionId: string; versionId?: string } | null>(null);
  const controller = useRef<LipSyncWorkspaceController | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    const serial = ++epoch.current;
    setBook(null); setError(null); controller.current = null;
    void api.getLipSyncSessions(props.projectId).then((value) => { if (serial === epoch.current) setBook(value); })
      .catch((reason) => { if (serial === epoch.current) setError(String(reason)); });
    return () => { epoch.current++; };
  }, [props.projectId]);
  async function flush() {
    if (!book?.activeVersionId) return null;
    if (!controller.current) throw new Error("Version chưa tải xong.");
    return controller.current.save();
  }
  if (navigationRef) navigationRef.current = async () => {
    if (busy) return false;
    try { await flush(); return true; } catch (reason) { setError(String(reason)); return false; }
  };
  async function change(kind: "session" | "version" | "select" | "reload", versionId?: string) {
    if (!book || busy) return;
    const serial = epoch.current;
    setBusy(true); setError(null);
    try {
      const saved = await flush();
      const next = kind === "session" ? await api.createLipSyncSession(props.projectId, book.revision)
        : kind === "version" && saved && book.activeVersionId ? await api.createLipSyncVersion(props.projectId, book.revision, book.activeVersionId, saved.revision)
        : kind === "select" && versionId ? await api.selectLipSyncVersion(props.projectId, book.revision, versionId)
        : kind === "reload" ? await api.getLipSyncSessions(props.projectId) : null;
      if (serial === epoch.current && next) { controller.current = null; setBook(next); }
    } catch (reason) { if (serial === epoch.current) setError(String(reason)); }
    finally { if (serial === epoch.current) setBusy(false); }
  }
  async function revealProjectFolder() {
    try { await api.revealProjectFolder(props.projectId); }
    catch (reason) { setError(String(reason)); }
  }
  async function exportSlot(id: string, kind: "session" | "version") {
    if (busy) return;
    await flush();
    await api.exportLipSyncSlot(props.projectId, id, kind);
  }
  async function slotAction(id: string, kind: "remove" | "restore" | "purge" | "empty-bin") {
    if (!book || busy) return;
    setBusy(true); setError(null);
    const serial = epoch.current;
    try {
      await flush();
      const next = await api.mutateLipSyncSlot(props.projectId, book.revision, id, kind);
      if (serial === epoch.current) {
        if (next.activeVersionId !== book.activeVersionId) controller.current = null;
        setBook(next);
      }
    } catch (reason) { if (serial === epoch.current) setError(String(reason)); }
    finally { if (serial === epoch.current) setBusy(false); }
  }
  const request = incoming?.projectId === props.projectId ? incoming : null;
  const availableIds = request?.ids.filter((id) => request.kind === "voice"
    ? props.outputs.some((item) => item.id === id && item.audioAvailable !== false && item.duration > 0)
    : props.assets.some((item) => item.id === id && item.mediaKind === "video" && !item.deletedAt && !item.disabled && item.duration > 0)) ?? [];
  const [voiceId, setVoiceId] = useState("");
  const selectedVoiceId = availableIds.includes(voiceId) ? voiceId : availableIds[0];
  const activeSession = book?.sessions.find((session) => session.id === book.activeSessionId);
  const activeVersion = activeSession?.versions.find((version) => version.id === book?.activeVersionId);
  const panel = <section className="lipsync-video-output" aria-label="Sessions và Versions">
    <div className="lipsync-session-actions"><button disabled={!book || busy} onClick={() => void change("session")} type="button">New session</button><button disabled={!book?.activeVersionId || busy} onClick={() => void change("version")} type="button">New version</button></div>
    {activeSession && activeVersion ? <p className="lipsync-current-version"><b>{activeSession.name} / {activeVersion.name}</b><small>Mỗi version lưu riêng bố cục, thông số, lịch sử và job.</small></p> : <p>Tạo session để bắt đầu một sản phẩm video.</p>}
    {book?.sessions.map((session) => <details key={session.id} open={session.id === book.activeSessionId || undefined} className="lipsync-session">
      <summary onContextMenu={(event) => { event.preventDefault(); setSlotMenu({ x: event.clientX, y: event.clientY, sessionId: session.id }); }}>{session.name}<small>{session.versions.length} version</small><OutputSlotActions label={session.name} disabled={busy} onExport={() => exportSlot(session.id, "session")} onDelete={() => slotAction(session.id, "remove")} /></summary>
      <div>{session.versions.map((version) => <div className="lipsync-output-slot-row" key={version.id}><button type="button" aria-pressed={version.id === book.activeVersionId} disabled={busy} onContextMenu={(event) => { event.preventDefault(); setSlotMenu({ x: event.clientX, y: event.clientY, sessionId: session.id, versionId: version.id }); }} onClick={() => { if (version.id !== book.activeVersionId) void change("select", version.id); }}><b>{version.name}</b><small>{new Date(version.createdAt).toLocaleString("vi-VN")}</small></button><OutputSlotActions label={version.name} disabled={busy} onExport={() => exportSlot(version.id, "version")} onDelete={() => slotAction(version.id, "remove")} /></div>)}</div>
    </details>)}
    {book?.recycle?.length ? <OutputRecycleBin entries={book.recycle} busy={busy} onRestore={(entry) => slotAction(entry.id, "restore")} onPurge={(entry) => slotAction(entry.id, "purge")} onEmpty={() => slotAction("all", "empty-bin")} /> : null}
    {slotMenu && book ? (() => {
      const session = book.sessions.find((item) => item.id === slotMenu.sessionId);
      const version = session?.versions.find((item) => item.id === slotMenu.versionId);
      const actions: OutputSlotMenuAction[] = [];
      if (version) {
        if (version.id === book.activeVersionId) actions.push({ id: "new-version", label: "New version", onSelect: () => void change("version") });
        else actions.push({ id: "open-version", label: "Open version", onSelect: () => void change("select", version.id) });
        actions.push({ id: "export-version", label: "Export Version package", disabled: busy, onSelect: () => void exportSlot(version.id, "version").catch((reason) => setError(String(reason))) });
        actions.push({ id: "remove-version", label: "Move to Recycle Bin", destructive: true, disabled: busy, onSelect: () => void slotAction(version.id, "remove") });
      } else if (session) {
        const latest = session.versions.at(-1);
        if (latest && latest.id !== book.activeVersionId) actions.push({ id: "open-latest", label: "Open latest version", onSelect: () => void change("select", latest.id) });
        if (session.id === book.activeSessionId && book.activeVersionId) actions.push({ id: "new-version", label: "New version", onSelect: () => void change("version") });
        actions.push({ id: "export-session", label: "Export Session package", disabled: busy, onSelect: () => void exportSlot(session.id, "session").catch((reason) => setError(String(reason))) });
        actions.push({ id: "remove-session", label: "Move to Recycle Bin", destructive: true, disabled: busy, onSelect: () => void slotAction(session.id, "remove") });
      }
      actions.push({ id: "reveal-project", label: "Reveal Project Folder", onSelect: () => void revealProjectFolder() });
      return <OutputSlotMenu x={slotMenu.x} y={slotMenu.y} label={version ? `${session?.name} / ${version.name}` : session?.name ?? "Session"}
        onClose={() => setSlotMenu(null)} actions={actions} />;
    })() : null}
    {request ? <div className="lipsync-incoming" role="group" aria-label="Nguồn được gửi tới LipSync"><b>Send to · {request.kind === "media" ? `${availableIds.length} video` : "Voice Output"}</b>
      <p>Đích: {activeSession ? `${activeSession.name} / ${activeVersion?.name}` : "Chọn hoặc tạo session"}</p>
      {request.kind === "voice" ? <label>Voice Output cần nhập / thay<select value={selectedVoiceId ?? ""} onChange={(event) => setVoiceId(event.target.value)}>{availableIds.map((id) => <option key={id} value={id}>{props.outputs.find((item) => item.id === id)?.name}</option>)}</select></label> : null}
      {!availableIds.length ? <p role="alert">Nguồn không còn khả dụng. Kiểm tra Media Pool / Voice Output.</p> : null}
      <button disabled={!book?.activeVersionId || busy || !availableIds.length} type="button" onClick={() => { if (controller.current?.importSources(request.kind, request.kind === "voice" ? [selectedVoiceId] : availableIds)) onIncomingConsumed?.(request.id); else setError("Chờ version tải xong trước khi đưa nguồn vào."); }}>Đưa nguồn vào version này</button>
      <button type="button" onClick={() => onIncomingConsumed?.(request.id)}>Bỏ yêu cầu gửi</button>
    </div> : null}
    {error ? <div><p role="alert">{error}</p><button disabled={busy} type="button" onClick={() => { if (book) void change("reload"); else { setError(null); void api.getLipSyncSessions(props.projectId).then(setBook).catch((reason) => setError(String(reason))); } }}>Tải lại danh sách Session</button></div> : null}
  </section>;
  return <div className="lipsync-page" inert={busy || undefined}><LipSyncWorkspace {...props} enabled={!!book?.activeVersionId} key={`${props.projectId}/${book?.activeVersionId ?? "empty"}`} versionId={book?.activeVersionId ?? undefined} controllerRef={controller} videoOutputPanel={panel} /></div>;
}
