import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { SpeakerProfile, VoiceOutput, VoiceOutputExportMode } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import "../../ui/list-canvas.css";
import "./voice-output.css";

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
  outputs: VoiceOutput[];
  speakers: SpeakerProfile[];
  activeOutputId: string | null;
  onOpen: (output: VoiceOutput) => void;
  onExport?: (output: VoiceOutput, mode: VoiceOutputExportMode) => void;
  onDelete: (output: VoiceOutput) => void;
  onDeleteMany?: (outputs: VoiceOutput[]) => void;
  pendingOutput?: PendingVoiceOutput | null;
  onDismissPendingOutput?: (id: string) => void;
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${(safe % 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * Speech made in Voice Manipulator. Kept out of Media Pool on purpose: Media
 * Pool is source material for STT and training, this is what came out.
 */
export function VoiceOutputPanel({ outputs, speakers, activeOutputId, onOpen, onExport, onDelete, onDeleteMany, pendingOutput, onDismissPendingOutput }: VoiceOutputPanelProps) {
  // Deleting removes the file for good, so it takes a second, deliberate click.
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
    <ModuleFrame className="voice-output-module" eyebrow="GENERATED SPEECH" index="VO" title="Voice Output" action={<span className="voice-output-count">{outputCount}</span>}>
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
            <li className={`${output.id === activeOutputId ? "is-active" : ""} ${selected.includes(output.id) ? "is-selected" : ""}`} key={output.id}>
              <button aria-label={`Chọn ${output.name}`} aria-pressed={selected.includes(output.id)} className="voice-output-select" onClick={(event) => select(event, output.id)} type="button">{selected.includes(output.id) ? "✓" : "□"}</button>
              <button aria-pressed={output.id === activeOutputId} className="voice-output-item" onClick={() => onOpen(output)} type="button">
                <i style={{ background: colorOf(output.speakerProfileId) }} />
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
    </ModuleFrame>
  );
}
