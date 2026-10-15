import { useEffect, useRef, useState } from "react";
import type { VoiceScriptDocument } from "../../domain/types";

interface Report { rows: Array<{ rowId: string; synthesisReady: boolean; blockers: string[]; settings: Record<string, { state: string; reason: string }> }> }
export function DeliveryCapabilities({ document }: { document: VoiceScriptDocument }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshot = JSON.stringify(document);
  const latest = useRef(snapshot); latest.current = snapshot;
  useEffect(() => { setReport(null); setError(null); }, [snapshot]);
  async function inspect() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/voice-script/delivery-capabilities", { method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Không kiểm tra được cách diễn.");
      if (latest.current === snapshot) setReport(body as Report);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không kiểm tra được cách diễn."); }
    finally { setBusy(false); }
  }
  return <details className="voice-script-settings"><summary>Khả năng cách diễn</summary>
    <p>Thì thầm, hét và cảm xúc chỉ được áp dụng khi có bộ tạo giọng đã kiểm chứng giữ đúng nhân vật. Note hiện là ghi chú.</p>
    <button type="button" disabled={busy} onClick={() => void inspect()}>{busy ? "Đang kiểm tra…" : "Kiểm tra cách diễn"}</button>
    {error ? <p role="alert">{error}</p> : null}
    {report ? <ul aria-label="Khả năng từng câu">{report.rows.map((row, i) => <li key={row.rowId}><b>Câu {i + 1}: {row.synthesisReady ? "Dùng cấu hình giọng hiện tại" : "Chưa áp dụng được yêu cầu"}</b>
      {row.blockers.map((reason) => <p key={reason}>{reason}</p>)}</li>)}</ul> : null}
  </details>;
}
