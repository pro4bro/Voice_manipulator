import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { VoiceChangerRecording, VoiceChangerStatus } from "../../domain/types";

interface ChangerRecordControlsProps {
  status: VoiceChangerStatus | null;
  recordings: VoiceChangerRecording[];
  activeRecordingId: string | null;
  busy?: boolean;
  onRecord: () => void;
  onStopRecording: () => void;
  onOpen: (recording: VoiceChangerRecording) => void;
  onDelete: (recording: VoiceChangerRecording) => void;
  onDeleteMany?: (recordings: VoiceChangerRecording[]) => void;
}

function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * Recording for the Voice Changer Timeline: both streams into one file, left
 * the real microphone and right the converted voice, lined up by the delay the
 * conversion adds.
 */
export function ChangerRecordControls({ status, recordings, activeRecordingId, busy = false, onRecord, onStopRecording, onOpen, onDelete, onDeleteMany }: ChangerRecordControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerPosition, setManagerPosition] = useState({ left: 8, top: 8 });
  const [selection, setSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const managerButtonRef = useRef<HTMLButtonElement>(null);
  const managerRef = useRef<HTMLDivElement>(null);
  const running = status?.state === "running";
  const recording = Boolean(status?.recording);
  const active = recordings.find((item) => item.id === activeRecordingId) ?? null;
  const orderedIds = recordings.map((item) => item.id);
  const selectedIds = reconcileListSelection(selection, orderedIds).ids;
  const selectedRecordings = recordings.filter((item) => selectedIds.includes(item.id));

  useEffect(() => {
    if (!managerOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setManagerOpen(false); };
    const closeOutside = (event: PointerEvent) => {
      if (!managerRef.current?.contains(event.target as Node) && !managerButtonRef.current?.contains(event.target as Node)) setManagerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOutside);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("pointerdown", closeOutside); };
  }, [managerOpen]);

  function toggleManager(event: MouseEvent<HTMLButtonElement>) {
    if (!managerOpen) {
      const rect = event.currentTarget.getBoundingClientRect();
      setManagerPosition({
        left: Math.max(8, Math.min(rect.right - 280, window.innerWidth - 288)),
        top: rect.bottom + 245 < window.innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - 245),
      });
    }
    setManagerOpen((open) => !open);
  }

  function selectRecording(event: MouseEvent<HTMLButtonElement>, id: string) {
    setSelection((current) => selectListItem(current, orderedIds, id, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
  }

  function selectAllRecordings(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection((current) => selectAllListItems(current, orderedIds));
    }
  }

  function deleteSelected() {
    if (!selectedRecordings.length || !window.confirm(`Xóa hẳn ${selectedRecordings.length} bản ghi Voice Changer cùng file âm thanh? Không khôi phục được.`)) return;
    if (onDeleteMany) onDeleteMany(selectedRecordings);
    else selectedRecordings.forEach(onDelete);
  }

  return (
    <div className="changer-record" role="group" aria-label="Ghi âm Voice Changer">
      {recording ? (
        <button aria-label="Dừng ghi" className="changer-record__button is-recording" disabled={busy} onClick={onStopRecording} type="button"><i />STOP · {clock(status?.recordingSeconds ?? 0)}</button>
      ) : (
        <button aria-label="Ghi 2 kênh" className="changer-record__button" disabled={busy || !running} onClick={onRecord} title={running ? "Ghi micro thật (kênh trái) và giọng đã đổi (kênh phải)" : "Bắt đầu đổi giọng trước khi ghi"} type="button"><i />REC 2 KÊNH</button>
      )}
      <select aria-label="Bản ghi" disabled={!recordings.length} onChange={(event) => { const found = recordings.find((item) => item.id === event.target.value); if (found) onOpen(found); }} value={active?.id ?? ""}>
        <option value="">{recordings.length ? "Mở bản ghi…" : "Chưa có bản ghi"}</option>
        {recordings.map((item) => <option key={item.id} value={item.id}>{item.name} · {clock(item.duration)}</option>)}
      </select>
      {recordings.length > 1 ? <button aria-expanded={managerOpen} aria-label="Quản lý bản ghi Voice Changer" className="changer-record__manage-button" onClick={toggleManager} ref={managerButtonRef} type="button">☷</button> : null}
      {managerOpen && recordings.length > 1 ? createPortal(<div aria-label="Danh sách bản ghi Voice Changer" className="changer-record__manager" onKeyDown={selectAllRecordings} ref={managerRef} role="region" style={managerPosition} tabIndex={0}><b>CHỌN BẢN GHI · {selectedIds.length}/{recordings.length}</b>{recordings.map((item) => <button aria-label={`Chọn bản ghi ${item.name}`} aria-pressed={selectedIds.includes(item.id)} className={selectedIds.includes(item.id) ? "is-selected" : ""} key={item.id} onClick={(event) => selectRecording(event, item.id)} type="button">{selectedIds.includes(item.id) ? "✓" : "□"} {item.name} · {clock(item.duration)}</button>)}<button className="is-danger" disabled={!selectedIds.length} onClick={deleteSelected} type="button">Xóa {selectedIds.length} bản ghi đã chọn</button></div>, document.body) : null}
      {active ? (
        <>
          <small className="changer-record__sync" title="Kênh phải đã được dời sớm lên đúng bằng độ trễ của bộ đổi giọng">L: micro · R: đã đổi · bù {Math.round(active.delayMs + (active.refinedDelayMs ?? 0))} ms</small>
          {confirming ? (
            <button className="changer-record__delete is-confirming" onBlur={() => setConfirming(false)} onClick={() => { setConfirming(false); onDelete(active); }} type="button">Xoá hẳn?</button>
          ) : (
            <button aria-label={`Xoá ${active.name}`} className="changer-record__delete" onClick={() => setConfirming(true)} type="button">×</button>
          )}
        </>
      ) : null}
    </div>
  );
}
