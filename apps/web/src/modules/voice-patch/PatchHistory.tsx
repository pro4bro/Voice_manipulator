import { useEffect, useRef, useState } from "react";
import type { VoiceOutput } from "../../domain/types";
import { PatchAudition } from "./PatchAudition";
import { PatchReview } from "./PatchReview";

interface Revision {
  output: VoiceOutput; sourceOutputId: string; strategy: string; comparisonKey: string;
  audioUrl: string; report: { startFrame: number; endFrame: number; durationPolicy?: string };
}
interface History { revisions: Revision[]; invalidCount: number }
const strategies: Record<string, string> = { "voice-patch": "Model đã train · output", "trained-media-patch": "1 · Model + mẫu sạch", "context-patch": "2 · Clone context", "hybrid-patch": "3 · Model + context" };

export function PatchHistory({ projectId, onOpen }: { projectId: string; onOpen?: (output: VoiceOutput) => void }) {
  const [packet, setPacket] = useState<History | null>(null);
  const [auditionOutputId, setAuditionOutputId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const current = useRef(projectId); current.current = projectId;
  const serial = useRef(0);
  useEffect(() => { setPacket(null); setAuditionOutputId(null); setBusy(false); setError(null); serial.current++; return () => { serial.current++; }; }, [projectId]);
  async function read() {
    const expected = projectId, version = ++serial.current;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/voice-patch/history`);
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.revisions) || !Number.isInteger(result.invalidCount)) throw new Error("Không đọc được lịch sử bản vá.");
      if (current.current === expected && serial.current === version) setPacket(result as History);
    } catch (reason) { if (current.current === expected && serial.current === version) setError(String(reason)); }
    finally { if (current.current === expected && serial.current === version) setBusy(false); }
  }
  const groups = new Map<string, Revision[]>();
  packet?.revisions.forEach((entry) => groups.set(entry.comparisonKey, [...(groups.get(entry.comparisonKey) ?? []), entry]));
  return <details className="voice-script-settings"><summary>Lịch sử và so sánh bản vá</summary>
    <p>Các bản đã Apply được giữ riêng. Chỉ xếp cùng nhóm khi nguồn, vùng vá, nội dung và chế độ thời lượng khớp nhau. Nghe để tự đánh giá giọng và chuyển tiếp.</p>
    <button type="button" disabled={busy} onClick={() => void read()}>Đọc lịch sử bản vá</button>
    {busy ? <p role="status">Đang kiểm tra các bản đã lưu…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {packet?.invalidCount ? <p role="alert">{packet.invalidCount} bản có artifact thiếu hoặc không khớp đã bị loại.</p> : null}
    {packet && !packet.revisions.length ? <p>Chưa có bản vá đã Apply hợp lệ.</p> : null}
    {[...groups].map(([key, entries]) => {
      const first = entries[0], lineage = first.output.parameters?.voicePatch;
      const text = lineage && typeof lineage === "object" && "replacementText" in lineage ? String(lineage.replacementText) : "";
      return <fieldset key={key}><legend>{first.sourceOutputId} · {(first.report.startFrame / 24000).toFixed(3)}–{(first.report.endFrame / 24000).toFixed(3)}s · {first.report.durationPolicy === "source" ? "Giữ thời lượng" : "Đọc tự nhiên"}</legend>
        <p>{text}</p>{entries.map((entry) => {
          const patch = entry.output.parameters?.voicePatch;
          const voice = patch && typeof patch === "object" && "voiceId" in patch ? String(patch.voiceId) : "";
          return <div key={entry.output.id}><p>{strategies[entry.strategy] ?? entry.strategy} · {voice} · {entry.output.duration.toFixed(3)} giây</p>
            <button type="button" aria-label={`Nghe đối chiếu ${entry.output.id}`} onClick={() => setAuditionOutputId(entry.output.id)}>Nghe đối chiếu</button>
            <button type="button" aria-label={`Mở bản vá ${entry.output.id}`} disabled={!onOpen} onClick={() => onOpen?.(entry.output)}>Mở trên Timeline và Script</button>
          </div>;
        })}</fieldset>;
    })}
    {auditionOutputId ? <div key={`${projectId}/${auditionOutputId}`}>
      <PatchAudition projectId={projectId} outputId={auditionOutputId} />
      <PatchReview projectId={projectId} outputId={auditionOutputId} />
    </div> : null}
  </details>;
}
