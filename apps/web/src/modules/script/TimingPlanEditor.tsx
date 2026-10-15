import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { ProjectMediaAsset, TrainingRun, VoiceScriptDocument } from "../../domain/types";
import type { TimingPlan, TimingPlanDocument } from "../../domain/reference-bindings";

export function TimingPlanEditor({ projectId, document, assets, runs, saved }: {
  projectId: string; document: VoiceScriptDocument; assets: ProjectMediaAsset[]; runs: TrainingRun[]; saved: boolean;
}) {
  const [plans, setPlans] = useState<TimingPlanDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowId, setRowId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [kind, setKind] = useState<TimingPlan["source"]["kind"]>("reference");
  const [runId, setRunId] = useState("");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const token = useRef(0);
  async function reload() {
    const serial = ++token.current;
    try { const value = await api.getTimingPlans(projectId); if (serial === token.current) { setPlans(value); setError(null); } }
    catch (reason) { if (serial === token.current) setError(String(reason)); }
  }
  useEffect(() => { void reload(); return () => { token.current++; }; }, [projectId, document.revision, assets]);
  const selectedRow = document.rows.find((row) => row.id === rowId) ?? document.rows[0];
  const choices = assets.filter((asset) => !asset.deletedAt && !asset.disabled && !asset.availableAudioTracks?.length && (kind !== "reference" || asset.referenceSelected));
  const asset = choices.find((asset) => asset.id === assetId);
  const valid = selectedRow && asset && Number.isFinite(Number(start)) && Number.isFinite(Number(end)) && end !== "" && Number(start) >= 0 && Number(end) > Number(start) && Number(end) <= asset.duration && (kind !== "training" || runId);
  return <details className="voice-script-settings timing-plan-editor"><summary>Timing từ footage</summary>
    <p>Chọn một câu và span nguồn. Text khác chỉ có envelope; mốc từ cần alignment đáng tin và review. Giọng nhân vật được giữ nguyên.</p>
    {error ? <p role="alert">{error}</p> : null}
    <label>Câu đích<select aria-label="Câu đích timing" value={selectedRow?.id ?? ""} onChange={(event) => { setRowId(event.target.value); setReviewed(false); }}>{document.rows.map((row, index) => <option key={row.id} value={row.id}>{index + 1}. {row.text.slice(0, 80)}</option>)}</select></label>
    <label>Nguồn timing<select aria-label="Nguồn timing" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setAssetId(""); setReviewed(false); }}><option value="reference">Reference footage</option><option value="training">Footage đã dùng train</option><option value="dub">Footage gốc để dubbing</option><option value="patch">Footage gốc cần patch</option></select></label>
    <label>Footage<select aria-label="Footage timing" value={asset?.id ?? ""} onChange={(event) => { setAssetId(event.target.value); setStart("0"); setEnd(String(choices.find((asset) => asset.id === event.target.value)?.duration ?? "")); setReviewed(false); }}><option value="">Chọn footage…</option>{choices.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
    {kind === "training" ? <label>Lượt train<select aria-label="Lượt train timing" value={runId} onChange={(event) => setRunId(event.target.value)}><option value="">Chọn lượt train có snapshot…</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.createdAt} · {run.emotion} · {run.status}</option>)}</select></label> : null}
    <label>Đầu (s)<input aria-label="Đầu span timing" type="number" min="0" step="0.001" value={start} onChange={(event) => { setStart(event.target.value); setReviewed(false); }} /></label>
    <label>Cuối (s)<input aria-label="Cuối span timing" type="number" min="0" step="0.001" value={end} onChange={(event) => { setEnd(event.target.value); setReviewed(false); }} /></label>
    <label><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />Đã nghe và review mapping cùng lời thoại</label>
    <button type="button" disabled={!valid || !saved || !plans || busy} onClick={async () => {
      if (!asset || !selectedRow || !plans) return;
      setBusy(true); setError(null); const serial = ++token.current;
      try { const value = await api.saveTimingPlan(projectId, { rowId: selectedRow.id, expectedRevision: plans.revision, expectedScriptRevision: document.revision, reviewedMapping: reviewed,
        source: { kind, assetId: asset.id, start: Number(start), end: Number(end), revision: asset.updatedAt, trainingRunId: kind === "training" ? runId : null } }); if (serial === token.current) setPlans(value); }
      catch (reason) { if (serial === token.current) setError(String(reason)); }
      finally { setBusy(false); }
    }}>{busy ? "Đang phân tích timing…" : "Lập timing plan"}</button>
    <button type="button" onClick={() => void reload()} disabled={busy}>Làm mới timing</button>
    {!saved ? <p>Chờ Script lưu xong để lập timing plan.</p> : null}
    {plans?.plans.map((plan) => <div key={plan.rowId} role="status"><b>{document.rows.find((row) => row.id === plan.rowId)?.text || "Câu đã xóa"}</b><p>{plan.requestedDuration.toFixed(3)}s · mapping {plan.template.mapping} · {plan.template.pauses.length} khoảng nghỉ · {plan.state}: {plan.reason}</p><p>Mốc từ chưa được áp dụng vào audio.</p><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(null); const serial = ++token.current; try { const value = await api.deleteTimingPlan(projectId, plan.rowId, plans.revision); if (serial === token.current) setPlans(value); } catch (reason) { if (serial === token.current) setError(String(reason)); } finally { setBusy(false); } }}>Bỏ timing của câu</button></div>)}
  </details>;
}
