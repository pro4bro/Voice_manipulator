import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { createPortal } from "react-dom";
import { SendToMenu, type SendTarget } from "../../ui/SendToMenu";
import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { SpeakerProfile, VoiceOutput, VoiceOutputExportMode, VoiceOutputSessions } from "../../domain/types";
import { api } from "../../api/client";
import { voiceOutputPrefix } from "../../domain/voice-output-prefix";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import "../../ui/list-canvas.css";
import "./voice-output.css";
import { ManagedVoiceOutputPanel } from "./ManagedVoiceOutputPanel";
import type { VoiceVersionsController } from "../../app/useVoiceVersions";

export interface PendingVoiceOutput {
  id: string;
  name: string;
  text: string;
  status: "starting" | "running" | "error" | "cancelled";
  detail?: string;
  completedRows?: number;
  totalRows?: number;
}

interface VoiceOutputPanelProps {
  controller?: VoiceVersionsController;
  generationBusy?: boolean;
  projectId?: string;
  outputs: VoiceOutput[];
  speakers: SpeakerProfile[];
  activeOutputId: string | null;
  onOpen: (output: VoiceOutput) => void;
  onSendTo?: (target: SendTarget, outputs: VoiceOutput[]) => void;
  onExport?: (output: VoiceOutput, mode: VoiceOutputExportMode) => void;
  onDelete: (output: VoiceOutput) => void;
  onDeleteMany?: (outputs: VoiceOutput[]) => void;
  pendingOutput?: PendingVoiceOutput | null;
  onDismissPendingOutput?: (id: string) => void;
  onVersionCreated?: (output: VoiceOutput) => void;
  onSessionCreated?: () => void;
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${(safe % 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * Speech made in Voice Manipulator. Kept out of Media Pool on purpose: Media
 * Pool is source material for STT and training, this is what came out.
 */
export function VoiceOutputPanel(props: VoiceOutputPanelProps) {
  return props.controller && props.projectId ? <ManagedVoiceOutputPanel controller={props.controller} projectId={props.projectId} outputs={props.outputs} speakers={props.speakers} pendingOutput={props.pendingOutput} onSendTo={props.onSendTo} onExport={props.onExport} generationBusy={props.generationBusy} /> : <LegacyVoiceOutputPanel {...props} />;
}

function LegacyVoiceOutputPanel({ projectId, outputs, speakers, activeOutputId, onOpen, onSendTo, onExport, onDelete, onDeleteMany, pendingOutput, onDismissPendingOutput, onVersionCreated, onSessionCreated }: VoiceOutputPanelProps) {
  const [book, setBook] = useState<VoiceOutputSessions | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void api.getVoiceOutputSessions(projectId).then((value) => { if (active) { setBook(value); setSessionError(null); } }).catch((error) => { if (active) setSessionError(String(error)); });
    return () => { active = false; };
  }, [projectId, outputs]);
  const activeSession = book?.sessions.find((session) => session.id === book.activeSessionId);
  const selectedVersion = activeSession?.versions.find((version) => version.id === book?.activeVersionId);
  const versionSource = outputs.find((output) => output.id === (activeOutputId ?? selectedVersion?.outputId) && output.audioAvailable !== false) ?? null;
  async function changeSession(kind: "session" | "version" | "select", versionId?: string, openSelected = true) {
    if (!projectId || !book || sessionBusy) return;
    setSessionBusy(true); setSessionError(null);
    try {
      if (kind === "session") {
        setBook(await api.createVoiceOutputSession(projectId, book.revision));
        onSessionCreated?.();
      } else if (kind === "version" && versionSource) {
        const result = await api.createVoiceOutputVersion(projectId, book.revision, versionSource.id);
        setBook(result.sessions);
        onVersionCreated?.(result.output);
        onOpen(result.output);
      } else if (kind === "select" && versionId) {
        const next = await api.selectVoiceOutputVersion(projectId, book.revision, versionId);
        setBook(next);
        const id = next.sessions.find((session) => session.id === next.activeSessionId)?.versions.find((version) => version.id === versionId)?.outputId;
        const output = outputs.find((item) => item.id === id);
        if (openSelected) {
          if (output) onOpen(output);
          else onSessionCreated?.();
        }
      }
    } catch (error) { setSessionError(error instanceof Error ? error.message : String(error)); }
    finally { setSessionBusy(false); }
  }
  function openOutput(output: VoiceOutput) {
    onOpen(output);
    const versionId = book?.sessions.flatMap((session) => session.versions).find((version) => version.outputId === output.id)?.id;
    if (versionId && versionId !== book?.activeVersionId) void changeSession("select", versionId, false);
  }
  // Deleting removes the file for good, so it takes a second, deliberate click.
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: globalThis.PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menu]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [selection, setSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const ids = outputs.map((output) => output.id);
  const selected = reconcileListSelection(selection, ids).ids;
  const visiblePendingOutput = pendingOutput && !outputs.some((output) => output.id === pendingOutput.id) ? pendingOutput : null;
  const outputCount = outputs.length + (visiblePendingOutput ? 1 : 0);
  useEffect(() => setSelection((current) => reconcileListSelection(current, ids)), [outputs]);
  const colorOf = (id: string) => speakers.find((speaker) => speaker.id === id)?.color;

  function select(event: MouseEvent<HTMLButtonElement>, id: string) {
    setSelection((current) => selectListItem(current, ids, id, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
  }

  function selectAll(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !(event.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) {
      event.preventDefault();
      setSelection((current) => selectAllListItems(current, ids));
    }
  }

  const selectedOutputs = outputs.filter((output) => selected.includes(output.id));

  return (
    <ModuleFrame className="voice-output-module" eyebrow="GENERATED SPEECH" index="VO" title="Voice Output" action={<div className="voice-output-header-actions"><span className="voice-output-count">{outputCount}</span>{projectId ? <><button aria-label="New Session" title="New Session · tạo phiên trống" disabled={!book || sessionBusy} onClick={() => void changeSession("session")} type="button"><Icon name="file-plus" /></button><button aria-label="New Version" title="New Version · sao chép Voice Output đang chọn" disabled={!versionSource || sessionBusy} onClick={() => void changeSession("version")} type="button"><Icon name="copy" /></button></> : null}</div>}>
      {projectId && book ? <div className="voice-output-sessions" aria-label="Sessions và Versions">{book.sessions.map((session) => <details key={session.id} open={session.id === book.activeSessionId || undefined}><summary>{session.name}<small>{session.versions.length} version</small></summary><div>{session.versions.map((version) => <button key={version.id} type="button" aria-pressed={version.id === book.activeVersionId} disabled={sessionBusy || version.id === book.activeVersionId} onClick={() => void changeSession("select", version.id)}>{version.name}{version.outputId ? <small>{outputs.find((output) => output.id === version.outputId)?.name ?? "Audio đã xoá"}</small> : <small>{version.acceptsNextOutput ? "Trống · tạo voice để điền vào" : "Audio đã xoá"}</small>}</button>)}</div></details>)}</div> : null}
      {sessionError ? <p className="voice-output-session-error" role="alert">{sessionError} {projectId ? <button type="button" onClick={() => void api.getVoiceOutputSessions(projectId).then((value) => { setBook(value); setSessionError(null); }).catch((error) => setSessionError(String(error)))}>Tải lại</button> : null}</p> : null}
      {outputs.length || visiblePendingOutput ? (
        <div aria-label="Danh sách Voice Output" className="voice-output-list-region" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("li, button, input")) { setSelection({ ids: [], anchorId: null }); setConfirming(null); setExporting(null); } }} onKeyDown={selectAll} role="region" tabIndex={0}>
        {selected.length ? <div className="voice-output-bulk-actions"><span>{selected.length} đã chọn</span><button className="voice-output-delete is-confirming" onClick={() => setConfirming("bulk")} type="button">Xoá đã chọn</button>{confirming === "bulk" ? <><span role="status">Xoá {selected.length} Voice Output cùng file âm thanh?</span><button onClick={() => { setConfirming(null); if (onDeleteMany) onDeleteMany(selectedOutputs); else selectedOutputs.forEach(onDelete); setSelection({ ids: [], anchorId: null }); }} type="button">Xác nhận xoá {selected.length}</button><button onClick={() => setConfirming(null)} type="button">Huỷ</button></> : null}</div> : null}
        <ul className="voice-output-list">
          {visiblePendingOutput ? <li aria-busy={visiblePendingOutput.status === "starting" || visiblePendingOutput.status === "running"} aria-label={visiblePendingOutput.name} className={`voice-output-pending ${visiblePendingOutput.status === "starting" || visiblePendingOutput.status === "running" ? "is-working" : `is-${visiblePendingOutput.status}`}`} key={visiblePendingOutput.id}>
            <span aria-hidden="true" className="voice-output-pending__indicator" />
            <div className="voice-output-pending__copy">
              <strong>{visiblePendingOutput.name}</strong>
              <small>{visiblePendingOutput.text}</small>
              <span aria-live="polite" role="status">{visiblePendingOutput.status === "error" ? "Không thể tạo voice" : visiblePendingOutput.status === "cancelled" ? "Đã huỷ" : `Đang tạo voice${visiblePendingOutput.completedRows !== undefined && visiblePendingOutput.totalRows !== undefined ? ` · ${visiblePendingOutput.completedRows}/${visiblePendingOutput.totalRows} dòng` : ""}`}</span>
              {visiblePendingOutput.detail ? <small className="voice-output-pending__detail">{visiblePendingOutput.detail}</small> : null}
            </div>
            {onDismissPendingOutput && visiblePendingOutput.status !== "starting" && visiblePendingOutput.status !== "running" ? <button aria-label="Ẩn trạng thái" className="voice-output-pending__dismiss" onClick={() => onDismissPendingOutput(visiblePendingOutput.id)} type="button">×</button> : null}
          </li> : null}
          {outputs.map((output) => (
            <li onContextMenu={onSendTo ? (event) => { event.preventDefault(); setMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 265)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 310)), ids: selected.includes(output.id) ? selected : [output.id] }); } : undefined} className={`${output.id === activeOutputId ? "is-active" : ""} ${selected.includes(output.id) ? "is-selected" : ""}`} key={output.id}>
              <button aria-label={`Chọn ${output.name}`} aria-pressed={selected.includes(output.id)} className="voice-output-select" onClick={(event) => select(event, output.id)} type="button">{selected.includes(output.id) ? "✓" : "□"}</button>
              <button aria-pressed={output.id === activeOutputId} className="voice-output-item" onClick={() => openOutput(output)} type="button">
                <i style={{ background: colorOf(output.speakerProfileId) }} />
                <b className="voice-output-function">{voiceOutputPrefix(output)}</b>
                <span>
                  <strong>{output.text}</strong>
                  <small>{output.segments && output.segments.length > 1 ? `${output.segments.length} đoạn · ${output.voiceName}` : output.voiceName} · {clock(output.duration)} · {new Date(output.createdAt).toLocaleTimeString("vi-VN", { hour12: false })}</small>
                </span>
              </button>
              {onExport ? <button aria-expanded={exporting === output.id} aria-label={`Xuất ${output.name}`} className="voice-output-export" onClick={() => setExporting((current) => current === output.id ? null : output.id)} type="button">Xuất</button> : null}
              {confirming === output.id ? (
                <button className="voice-output-delete is-confirming" onClick={() => { setConfirming(null); onDelete(output); }} onBlur={() => setConfirming(null)} type="button">Xoá hẳn?</button>
              ) : (
                <button aria-label={`Xoá ${output.name}`} className="voice-output-delete" onClick={() => setConfirming(output.id)} type="button"><Icon name="trash" /></button>
              )}
              {onExport && exporting === output.id ? <div aria-label={`Định dạng xuất ${output.name}`} className="voice-output-export-options" role="group">
                <button onClick={() => { setExporting(null); onExport(output, "audio"); }} type="button">WAV</button>
                <button disabled={!output.segments?.length} onClick={() => { setExporting(null); onExport(output, "line"); }} title={!output.segments?.length ? "Chưa có mốc thời gian từng dòng Script" : undefined} type="button">SRT dòng</button>
                <button disabled={!output.words?.some((word) => word.timingTrusted !== false)} onClick={() => { setExporting(null); onExport(output, "word"); }} title={!output.words?.some((word) => word.timingTrusted !== false) ? "Chưa có thời gian từng từ đáng tin" : undefined} type="button">SRT từ</button>
              </div> : null}
            </li>
          ))}

        </ul>
        </div>
      ) : (
        <div className="voice-output-empty">
          <Icon name="waveform" />
          <b>Chưa có giọng nào được tạo</b>
          <span>Nhập Script, chọn voice cho từng dòng rồi bấm Tạo voice. Kết quả nằm ở đây, không lẫn vào Media Pool.</span>
        </div>
      )}
      {menu && onSendTo ? createPortal(<div ref={menuRef} className="voice-output-context-menu" role="menu" aria-label="Voice Output actions" style={{ left: menu.x, top: menu.y }}><SendToMenu disabled={{ "voice-training": "Training dùng footage nguồn trong Media Pool", "voice-manipulator": menu.ids.length !== 1 ? "Mở từng Voice Output trong Voice Manipulation" : undefined }} onSend={(target) => { setMenu(null); onSendTo(target, outputs.filter((output) => menu.ids.includes(output.id))); }} /></div>, document.body) : null}
    </ModuleFrame>
  );
}
