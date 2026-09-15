import { useState } from "react";

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
export function ChangerRecordControls({ status, recordings, activeRecordingId, busy = false, onRecord, onStopRecording, onOpen, onDelete }: ChangerRecordControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const running = status?.state === "running";
  const recording = Boolean(status?.recording);
  const active = recordings.find((item) => item.id === activeRecordingId) ?? null;

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
