import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { VoiceOutput, VoiceScriptDocument } from "../../domain/types";
import type { DurationAllocation } from "../../domain/reference-bindings";

export function DurationPlanPanel({ projectId, document, saved, output, refreshKey }: {
  projectId: string; document: VoiceScriptDocument; saved: boolean; output: VoiceOutput | null; refreshKey: number;
}) {
  const [preview, setPreview] = useState<DurationAllocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);
  useEffect(() => { token.current++; setPreview(null); setError(null); setBusy(false); return () => { token.current++; }; }, [projectId, document.revision, refreshKey]);
  const seconds = (value: number | null | undefined) => value == null ? "Tự nhiên" : `${value.toFixed(3)}s`;
  return <details className="voice-script-settings"><summary>Phân bổ thời lượng · yêu cầu / thực tế</summary>
    <p>Budget cả clip/đoạn tính cả khoảng nghỉ 0.350s giữa các câu. Thời lượng cấp trên được chia cho phần chưa khóa. Mốc từ, cảm xúc và âm lượng chưa được bảo đảm bởi duration.</p>
    <button type="button" disabled={!saved || busy || !document.rows.some((row) => row.text.trim())} onClick={async () => {
      const serial = ++token.current; setBusy(true); setError(null);
      try {
        const timing = await api.getTimingPlans(projectId);
        const result = await api.previewScriptDuration(projectId, { scriptRevision: document.revision, timingRevision: timing.revision,
          rows: document.rows.filter((row) => row.text.trim()).map((row) => ({ id: row.id, text: row.text, voiceId: row.voiceId || "unassigned" })) });
        if (serial === token.current) setPreview(result);
      } catch (reason) { if (serial === token.current) { setError(String(reason)); setPreview(null); } }
      finally { if (serial === token.current) setBusy(false); }
    }}>{busy ? "Đang phân bổ…" : "Xem phân bổ trước khi tạo"}</button>
    {error ? <p role="alert">{error}</p> : null}
    <p>Cả clip yêu cầu: {seconds(document.settings.duration)} · Audio lần tạo gần nhất: {output ? seconds(output.duration) : "Chưa tạo"}</p>
    {document.segments.filter((segment) => segment.settings.duration != null).map((segment) => {
      const units = output?.segments?.filter((part) => document.rows.find((row) => row.id === part.rowId || row.legacyRowIds?.includes(part.rowId))?.segmentId === segment.id) ?? [];
      return <p key={segment.id}>{segment.name || "Đoạn"}: yêu cầu {seconds(segment.settings.duration)} · lần tạo gần nhất {units.length ? seconds(units.at(-1)!.end - units[0].start) : "Chưa tạo"}</p>;
    })}
    <ul>{document.rows.filter((row) => row.text.trim()).map((row, index) => {
      const units = output?.segments?.filter((segment) => segment.rowId === row.id || row.legacyRowIds?.includes(segment.rowId)) ?? [];
      const actual = units.length === 1 ? units[0] : units.length ? { start: Math.min(...units.map(unit => unit.start)), end: Math.max(...units.map(unit => unit.end)), durationReport: undefined, timingReport: undefined } : null;
      return <li key={row.id}>{index + 1}. {row.text.slice(0, 80)}<p>Yêu cầu: {seconds(preview?.rows[row.id]?.duration ?? row.settings?.duration)} · lần tạo gần nhất: {actual ? seconds(actual.end - actual.start) : "Chưa tạo"}{actual?.durationReport ? ` · sai số ${actual.durationReport.durationError.toFixed(6)}s · cần nghe kiểm tra` : ""}</p>{actual?.timingReport ? <div><p>Mapping mốc từ: {actual.timingReport.anchorStatus} · sai số duration {actual.timingReport.durationError.toFixed(3)}s</p><p>Độ lệch bắt đầu: {actual.timingReport.offsetError == null ? "Chưa đo" : `${actual.timingReport.offsetError.toFixed(3)}s`}</p>{actual.timingReport.anchorErrors?.map((error) => <p key={error.wordIndex}>Mốc {error.wordIndex + 1}: lệch đầu {error.startError.toFixed(3)}s · lệch cuối {error.endError.toFixed(3)}s</p>)}</div> : null}</li>;
    })}</ul>
    {preview ? <p>Phân bổ đã kiểm tra budget; chất lượng lời đọc cần đo và nghe trên audio được tạo.</p> : null}
  </details>;
}
