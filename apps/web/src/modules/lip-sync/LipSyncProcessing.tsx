import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "../../api/client";
import { lipSyncUrl, type LipSyncDocument, type LipSyncFaceReview } from "../../domain/lipsync";
import type { SpeakerProfile } from "../../domain/types";

export interface LipSyncJob { id: string; kind: "analysis" | "render"; status: string; revision: number; analysisId?: string; analysisRevision?: number; error: string | null; summary?: Record<string, number>; artifacts?: Array<{ index: number; label: string }> }
export type FaceReview = LipSyncFaceReview;
export interface FaceGallery { analysisId: string; sampledFrames: number; sampleInterval: number; observations: Array<{ id: string; assetId: string; time: number; faceId: string; score: number }>; review: FaceReview }
export interface LipSyncRenderPlan { ready: boolean; blockers: string[]; tasks: Array<{ faceId: string; speakerProfileId: string; timelineStart: number; timelineEnd: number }>; skippedTurns: number; revision: number; analysisRevision: number }
export interface LipSyncRuntimeReport { analysis: { ready: boolean; blockers: string[] }; render: { ready: boolean; blockers: string[] } }

function FaceIdInput({ value, onChange, onValidity, onFocus, onBlur }: { value: string; onChange: (value: string) => void; onValidity: (valid: boolean) => void; onFocus?: () => void; onBlur?: () => void }) {
  const [draft, setDraft] = useState(value);
  const valid = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(draft);
  useEffect(() => { setDraft(value); onValidity(true); }, [value]);
  return <input value={draft} aria-invalid={!valid} title={!valid ? "Face ID cần 1–120 ký tự chữ, số, gạch dưới hoặc gạch nối" : undefined} pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,119}" onFocus={onFocus} onBlur={onBlur} onChange={(event) => {
    const next = event.target.value; setDraft(next);
    const accepted = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(next); onValidity(accepted);
    if (accepted && next !== value) onChange(next);
  }} />;
}

export interface LipSyncReviewController { save: () => Promise<boolean> }
export function LipSyncProcessing({ projectId, versionId, document, dirty, onAfter, controllerRef, faceReviews, onReviewChange, onReviewBaseline, onEditStart, onEditEnd }: { projectId: string; versionId?: string; document: LipSyncDocument; dirty: boolean; onAfter: (jobId: string | null) => void; controllerRef?: MutableRefObject<LipSyncReviewController | null>; faceReviews?: Record<string, FaceReview>; onReviewChange?: (review: FaceReview) => void; onReviewBaseline?: (review: FaceReview) => void; onEditStart?: () => void; onEditEnd?: () => void }) {
  const [runtime, setRuntime] = useState<LipSyncRuntimeReport | null>(null);
  const [jobs, setJobs] = useState<LipSyncJob[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [gallery, setGallery] = useState<FaceGallery | null>(null);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [localReview, setReview] = useState<FaceReview | null>(null);
  const review = faceReviews?.[analysisId] ?? localReview;
  const reviewDirty = !!review && !!gallery && JSON.stringify([review.observations, review.bindings]) !== JSON.stringify([gallery.review.observations, gallery.review.bindings]);
  const [speakers, setSpeakers] = useState<SpeakerProfile[]>([]);
  const [plan, setPlan] = useState<LipSyncRenderPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0), planSerial = useRef(0);
  const pendingAnalysis = useRef<string | null>(null);
  useEffect(() => { planSerial.current++; setPlan(null); }, [document, dirty, review]);
  useEffect(() => {
    const current = ++epoch.current;
    pendingAnalysis.current = null;
    setJobs([]); setAnalysisId(""); setGallery(null); setReview(null); setPlan(null); setRuntime(null); setError(null); setSpeakers([]); setLog(""); setBusy(false);
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [report, values, catalog] = await Promise.all([api.getLipSyncRuntime(), api.listLipSyncJobs(projectId, versionId), api.getTrainingCatalog(projectId)]);
        if (epoch.current !== current) return;
        setRuntime(report); setJobs(values); setSpeakers(catalog.speakers);
        const pending = values.find((item) => item.id === pendingAnalysis.current);
        if (pending?.status === "completed") {
          setAnalysisId(pending.id); pendingAnalysis.current = null;
        } else if (pending && ["failed", "cancelled", "interrupted"].includes(pending.status)) pendingAnalysis.current = null;
        else if (!pendingAnalysis.current) {
          const latest = values.find((item) => item.kind === "analysis" && item.status === "completed");
          if (latest) setAnalysisId((previous) => previous || latest.id);
        }
      } catch (reason) { if (epoch.current === current) setError(String(reason)); }
      if (epoch.current === current) timer = setTimeout(() => void refresh(), 2500);
    }
    void refresh();
    return () => { epoch.current++; clearTimeout(timer); };
  }, [projectId, versionId]);
  useEffect(() => {
    let live = true;
    setGallery(null); setReview(null); setPlan(null); setInvalidIds(new Set());
    if (analysisId) void api.getLipSyncFaces(projectId, analysisId, versionId).then((value) => { if (live) { setGallery(value); setReview(value.review); if (!faceReviews?.[analysisId]) onReviewBaseline?.(value.review); } }).catch((reason) => { if (live) setError(String(reason)); });
    return () => { live = false; };
  }, [projectId, versionId, analysisId]);
  async function action<T>(operation: () => Promise<T>, accept: (value: T) => void) {
    const current = epoch.current;
    setBusy(true); setError(null);
    try { const value = await operation(); if (current === epoch.current) accept(value); }
    catch (reason) { if (current === epoch.current) setError(String(reason)); }
    finally { if (current === epoch.current) setBusy(false); }
  }
  function edit(change: (value: FaceReview) => FaceReview) {
    if (review) { const next = change(review); if (onReviewChange) onReviewChange(next); else setReview(next); } setPlan(null); onAfter(null);
  }
  async function saveReview(): Promise<boolean> {
    if (busy || invalidIds.size) { if (invalidIds.size) setError("Sửa Face ID chưa hợp lệ trước khi lưu hoặc đổi version."); return false; }
    if (!reviewDirty || !review) return true;
    const current = epoch.current;
    setBusy(true); setError(null);
    try {
      const faceIds = new Set(review.observations.map((item) => item.faceId));
      const saved = await api.saveLipSyncFaces(projectId, { ...review, revision: gallery?.review.revision ?? review.revision, bindings: review.bindings.filter((b) => faceIds.has(b.faceId)) }, versionId);
      if (current !== epoch.current) return false;
      setReview(saved); setGallery((value) => value ? { ...value, review: saved } : value); onReviewBaseline?.(saved); return true;
    } catch (reason) { if (current === epoch.current) setError(String(reason)); return false; }
    finally { if (current === epoch.current) setBusy(false); }
  }
  if (controllerRef) controllerRef.current = { save: saveReview };
  const active = jobs.find((job) => ["queued", "running"].includes(job.status));
  const identities = [...new Set(review?.observations.map((o) => o.faceId) ?? [])];
  return <section className="lipsync-processing" aria-label="Nhận diện và xử lý LipSync">
    <h3>Nhận diện khuôn mặt</h3>
    <p>Gallery lấy mẫu mỗi 0,5s; render nhận diện lại từng frame. Mặt không rõ hoặc sai người được giữ nguyên.</p>
    <button disabled={busy || !!invalidIds.size || !!active || dirty || !runtime?.analysis.ready || !document.clips.length} onClick={() => void action(() => api.startLipSyncJob(projectId, { kind: "analysis", revision: document.revision }, versionId), (job) => { setJobs((values) => [job, ...values]); pendingAnalysis.current = job.id; setAnalysisId(""); })} type="button">Phân tích khuôn mặt</button>
    {runtime?.analysis.blockers.map((reason) => <small key={reason}>{reason}</small>)}
    {dirty ? <p>Lưu bố cục hợp lệ trước khi phân tích hoặc Generate.</p> : null}
    <label>Bản phân tích<select disabled={busy || !!invalidIds.size || reviewDirty || !!pendingAnalysis.current} value={analysisId} onChange={(event) => { setAnalysisId(event.target.value); onAfter(null); }}><option value="">Chọn bản phân tích</option>{jobs.filter((job) => job.kind === "analysis" && job.status === "completed").map((job) => <option key={job.id} value={job.id}>{job.id.slice(0, 8)} · rev {job.revision}</option>)}</select></label>
    {gallery && review ? <>
      <p>{gallery.observations.length} mặt / {gallery.sampledFrames} frame mẫu. Đổi Face ID để tách hoặc gộp nhận diện nhầm, rồi duyệt từng ảnh.</p>
      <fieldset disabled={busy} className="lipsync-face-fields"><div className="lipsync-face-gallery">{gallery.observations.map((item) => {
        const current = review.observations.find((value) => value.id === item.id)!;
        return <article key={item.id}>
          <img alt={`Mặt tại ${item.time.toFixed(2)}s · ${item.assetId}`} src={lipSyncUrl(projectId, `/faces/${analysisId}/${item.id}/thumbnail`, versionId)} loading="lazy" />
          <small>{item.time.toFixed(2)}s · {item.assetId.slice(0, 8)}</small>
          <label>Face ID<FaceIdInput key={`${item.id}/${draftEpoch}`} value={current.faceId} onFocus={onEditStart} onBlur={onEditEnd} onValidity={(valid) => setInvalidIds((current) => {
            if (current.has(item.id) === !valid) return current;
            const next = new Set(current); if (valid) next.delete(item.id); else next.add(item.id); return next;
          })} onChange={(faceId) => edit((value) => ({ ...value, observations: value.observations.map((o) => o.id === item.id ? { ...o, faceId, reviewed: false } : o) }))} /></label>
          <label>Voice Profile<select aria-label={`Voice Profile cho ${item.id}`} value={review.bindings.find((b) => b.faceId === current.faceId)?.speakerProfileId ?? ""} onChange={(event) => { const speakerProfileId = event.target.value || null; edit((value) => ({ ...value, bindings: [...value.bindings.filter((b) => b.faceId !== current.faceId && identities.includes(b.faceId)), { faceId: current.faceId, speakerProfileId }] })); }}><option value="">Không LipSync / chưa gán</option>{speakers.map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}</select></label>
          <label><input type="checkbox" checked={current.reviewed} onChange={(event) => { const reviewed = event.target.checked; edit((value) => ({ ...value, observations: value.observations.map((o) => o.id === item.id ? { ...o, reviewed } : o) })); }} />Đã duyệt mặt này</label>
        </article>;
      })}</div>
      </fieldset><button disabled={busy || !!invalidIds.size || !reviewDirty || dirty} onClick={() => void saveReview()} type="button">Lưu duyệt ID và Speaker</button>
      <button disabled={busy || (!reviewDirty && !invalidIds.size)} onClick={() => { if (reviewDirty) edit(() => gallery.review); setDraftEpoch((value) => value + 1); setInvalidIds(new Set()); }} type="button">Bỏ thay đổi duyệt mặt</button>
      <button disabled={busy || !!invalidIds.size || reviewDirty || dirty} onClick={() => { const serial = ++planSerial.current; void action(() => api.getLipSyncRenderPlan(projectId, analysisId, versionId), (value) => { if (serial === planSerial.current) setPlan(value); }); }} type="button">Kiểm tra lịch theo người nói</button>
    </> : null}
    {plan ? <div><b>{plan.tasks.length} khoảng đã gán Speaker · {plan.skippedTurns} lượt không gán</b><ul>{plan.blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul><details><summary>Lịch xử lý</summary><ol>{plan.tasks.map((task, index) => <li key={index}>{task.faceId} / {task.speakerProfileId} · {task.timelineStart.toFixed(2)}–{task.timelineEnd.toFixed(2)}s</li>)}</ol></details></div> : null}
    <button disabled={busy || !!invalidIds.size || !!active || dirty || reviewDirty || !plan?.ready || !review} onClick={() => void action(() => api.startLipSyncJob(projectId, { kind: "render", revision: document.revision, analysisId, analysisRevision: gallery?.review.revision ?? review!.revision }, versionId), (job) => setJobs((values) => [job, ...values]))} type="button">Generate LipSync</button>
    <p>MuseTalk Offline v1.5 · CFR 25fps, cạnh dài tối đa 1920px. Realtime/v1 và adapter LatentSync/Wav2Lip chưa khả dụng.</p>
    {jobs.slice(0, 15).map((job) => <div className="lipsync-job" key={job.id}><b>{job.kind} · {job.status} · {job.id.slice(0, 8)}</b>{job.error ? <p role="alert">{job.error}</p> : null}{job.summary ? <small>{Object.entries(job.summary).map(([key, value]) => `${key}: ${value}`).join(" · ")}</small> : null}
      {["queued", "running"].includes(job.status) ? <button disabled={busy} type="button" onClick={() => void action(() => api.cancelLipSyncJob(projectId, job.id, versionId), () => undefined)}>Hủy job</button> : null}
      <button type="button" disabled={busy} onClick={() => void action(() => api.getLipSyncJobLog(projectId, job.id, versionId), (value) => setLog(value.text))}>Xem log {job.id.slice(0, 8)}</button>
      {job.status === "completed" ? job.artifacts?.map((artifact) => <a key={artifact.index} download={`${job.id}-${artifact.index}.mp4`} href={lipSyncUrl(projectId, `/jobs/${job.id}/artifacts/${artifact.index}`, versionId)}>Lưu video · {artifact.label}</a>) : null}
      {job.kind === "render" && job.status === "completed" ? <button disabled={dirty || job.revision !== document.revision || reviewDirty || job.analysisRevision !== gallery?.review.revision || job.analysisId !== analysisId} onClick={() => onAfter(job.id)} type="button">Xem After · {job.id.slice(0, 8)}</button> : null}
    </div>)}
    {log ? <pre className="lipsync-worker-log">{log}</pre> : null}
    {invalidIds.size ? <p role="alert">Face ID chưa hợp lệ. Dùng 1–120 ký tự chữ, số, gạch dưới hoặc gạch nối.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
