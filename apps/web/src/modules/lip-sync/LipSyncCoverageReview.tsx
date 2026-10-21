import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { LipSyncDocument, LipSyncCoverage, LipSyncPreflight } from "../../domain/lipsync";

export function LipSyncCoverageReview({ projectId, versionId, document, dirty }: { projectId: string; versionId?: string; document: LipSyncDocument; dirty: boolean }) {
  const [result, setResult] = useState<LipSyncCoverage | null>(null);
  const [preflight, setPreflight] = useState<LipSyncPreflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setResult(null); setPreflight(null); setError(null); setBusy(false); return () => { generation.current++; }; }, [document, projectId, versionId]);
  async function inspect(prepare = false) {
    const serial = ++generation.current;
    setBusy(true); setError(null);
    try {
      if (prepare) { const value = await api.prepareLipSync(projectId, document, versionId); if (serial === generation.current) { setPreflight(value); setResult(value); } }
      else { const value = await api.inspectLipSyncCoverage(projectId, document, versionId); if (serial === generation.current) { setResult(value); setPreflight(null); } }
    }
    catch (reason) { if (serial === generation.current) setError(String(reason)); }
    finally { if (serial === generation.current) setBusy(false); }
  }
  return <section className="lipsync-coverage-review">
    <button disabled={busy || !document.clips.length} onClick={() => void inspect()} type="button">{busy ? "Đang kiểm tra…" : "Xem phạm vi xử lý"}</button>
    <button disabled={busy || dirty || !document.clips.length} onClick={() => void inspect(true)} type="button">Kiểm tra kế hoạch LipSync</button>
    {dirty ? <p>Lưu bố cục trước khi kiểm tra kế hoạch LipSync.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {preflight ? <div><b>Kế hoạch {preflight.id.slice(0, 10)} · chưa chạy engine</b>
      <ul>{preflight.blockers.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      <b>{preflight.speechCandidates.length} khoảng lời thoại cần gán Face ID</b>
      <ol>{preflight.speechCandidates.slice(0, 100).map((part, index) => <li key={index}>{part.speakerProfileId} · voice {part.voiceStart.toFixed(2)}–{part.voiceEnd.toFixed(2)}s · video {part.sourceStart.toFixed(2)}–{part.sourceEnd.toFixed(2)}s</li>)}</ol>
    </div> : null}
    {result ? <><b>Phạm vi dự kiến · chưa nhận diện/chưa render</b>{(["detection", "sync"] as const).map((kind) => <div key={kind}>
      <b>{kind === "detection" ? "Nhận diện" : "LipSync"}: {result[kind].length} khoảng</b>
      <ol>{result[kind].slice(0, 100).map((part, index) => <li key={index}>{part.clipId} · nguồn {part.sourceStart.toFixed(2)}–{part.sourceEnd.toFixed(2)}s{part.timelineStart !== null ? ` · timeline ${part.timelineStart.toFixed(2)}–${part.timelineEnd?.toFixed(2)}s` : " · đồng hồ source"}</li>)}</ol>
      {result[kind].length > 100 ? <p>Đang hiển thị 100 khoảng đầu.</p> : null}
    </div>)}</> : null}
  </section>;
}
