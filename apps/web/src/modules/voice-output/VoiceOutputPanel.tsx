import { useState } from "react";

import type { SpeakerProfile, VoiceOutput } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface VoiceOutputPanelProps {
  outputs: VoiceOutput[];
  speakers: SpeakerProfile[];
  activeOutputId: string | null;
  onOpen: (output: VoiceOutput) => void;
  onDelete: (output: VoiceOutput) => void;
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${(safe % 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * Speech made in Voice Manipulator. Kept out of Media Pool on purpose: Media
 * Pool is source material for STT and training, this is what came out.
 */
export function VoiceOutputPanel({ outputs, speakers, activeOutputId, onOpen, onDelete }: VoiceOutputPanelProps) {
  // Deleting removes the file for good, so it takes a second, deliberate click.
  const [confirming, setConfirming] = useState<string | null>(null);
  const colorOf = (id: string) => speakers.find((speaker) => speaker.id === id)?.color;

  return (
    <ModuleFrame className="voice-output-module" eyebrow="GENERATED SPEECH" index="VO" title="Voice Output" action={<span className="voice-output-count">{outputs.length}</span>}>
      {outputs.length ? (
        <ul className="voice-output-list">
          {outputs.map((output) => (
            <li className={output.id === activeOutputId ? "is-active" : ""} key={output.id}>
              <button aria-pressed={output.id === activeOutputId} className="voice-output-item" onClick={() => onOpen(output)} type="button">
                <i style={{ background: colorOf(output.speakerProfileId) }} />
                <span>
                  <strong>{output.text}</strong>
                  <small>{output.segments && output.segments.length > 1 ? `${output.segments.length} đoạn · ${output.voiceName}` : output.voiceName} · {clock(output.duration)} · {new Date(output.createdAt).toLocaleTimeString("vi-VN", { hour12: false })}</small>
                </span>
              </button>
              {confirming === output.id ? (
                <button className="voice-output-delete is-confirming" onClick={() => { setConfirming(null); onDelete(output); }} onBlur={() => setConfirming(null)} type="button">Xoá hẳn?</button>
              ) : (
                <button aria-label={`Xoá ${output.name}`} className="voice-output-delete" onClick={() => setConfirming(output.id)} type="button"><Icon name="trash" /></button>
              )}
            </li>
          ))}
        </ul>
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
