import { useEffect, useRef, useState } from "react";
import type { VoiceOutput } from "../../domain/types";

interface Job { id: string; key: string; outputId: string; status: string; done: number; total: number; report?: { trustedWords?: number; totalWords?: number }; error?: string | null }
interface Plan { expectedKey: string; processingAvailable: boolean; blockers: string[]; latestJob?: Job | null }
const active = (job: Job | null) => !!job && ["queued", "running"].includes(job.status);
async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : "Không căn lại được timing.");
  return value as T;
}
export function TimingRepair({ projectId, outputId, onOutputReady }: { projectId: string; outputId: string; onOutputReady?: (output: VoiceOutput) => void }) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(outputId)}/timing-repair`;
  const owner = useRef(endpoint); owner.current = endpoint;
  const serial = useRef(0);
  const [plan, setPlan] = useState<Plan | null>(null), [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { setPlan(null); setJob(null); setBusy(false); setError(null); serial.current++; return () => { serial.current++; }; }, [endpoint]);
  function accept(value: Job, expected: string, allowNew = false) {
    if (owner.current !== expected) return;
    setJob((previous) => previous && !allowNew && (previous.id !== value.id || !active(previous) && active(value)) ? previous : value);
  }
  const running = active(job);
  useEffect(() => {
    if (!running || !job) return;
    const expected = endpoint, id = job.id;
    let valid = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const value = await request<Job>(`${expected}/jobs/${encodeURIComponent(id)}`); if (valid) { accept(value, expected); if (active(value)) timer = setTimeout(poll, 700); } }
      catch (reason) { if (valid) { setError(String(reason)); timer = setTimeout(poll, 2000); } }
    };
    timer = setTimeout(poll, 500);
    return () => { valid = false; clearTimeout(timer); };
  }, [endpoint, job?.id, running]);
  async function act(action: "plan" | "jobs" | "apply" | "stop") {
    const expected = endpoint, version = ++serial.current;
    setBusy(true); setError(null);
    try {
      if (action === "plan") {
        const value = await request<Plan>(`${endpoint}/plan`);
        if (owner.current === expected && serial.current === version) { setPlan(value); if (value.latestJob) accept(value.latestJob, expected, true); }
      } else if (action === "jobs" && plan) accept(await request<Job>(`${endpoint}/jobs`, { expectedKey: plan.expectedKey }), expected, true);
      else if (action === "stop" && job) accept(await request<Job>(`${endpoint}/jobs/${encodeURIComponent(job.id)}/stop`, {}), expected);
      else if (action === "apply" && job) {
        const value = await request<{ output: VoiceOutput }>(`${endpoint}/apply`, { jobId: job.id, expectedKey: job.key });
        if (owner.current === expected && serial.current === version) onOutputReady?.(value.output);
      }
    } catch (reason) { if (owner.current === expected && serial.current === version) setError(String(reason)); }
    finally { if (owner.current === expected && serial.current === version) setBusy(false); }
  }
  return <details className="voice-script-settings"><summary>Căn lại timing lời đọc</summary>
    <p>Đo các mốc từ trên audio đã lưu, không tạo lại giọng. Kết quả được lưu thành bản mới với âm thanh giữ nguyên. Nếu vừa kéo giãn, hãy tạo và Apply bản mới trước.</p>
    <button type="button" disabled={busy || running} onClick={() => void act("plan")}>Kiểm tra timing</button>
    <button type="button" disabled={busy || running || !plan?.processingAvailable} onClick={() => void act("jobs")}>Đo lại timing từ audio</button>
    <button type="button" disabled={busy || !job || job.status !== "complete" || job.outputId !== outputId || plan?.expectedKey !== job.key} onClick={() => void act("apply")}>Lưu bản timing mới</button>
    {running ? <button type="button" onClick={() => void act("stop")}>Dừng đo timing</button> : null}
    {busy ? <p role="status">Đang kiểm tra timing…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {plan?.blockers?.map((blocker, index) => <p role="alert" key={index}>{blocker}</p>)}
    {job ? <><p role="status">{job.done}/{job.total} · {job.status}</p>{job.error ? <p role="alert">{job.error}</p> : null}
      {job.report?.totalWords !== undefined ? <p>{job.report.trustedWords ?? 0}/{job.report.totalWords} từ có mốc đo khớp lời. Phần còn lại cần kiểm tra; chưa phải nghiệm thu nghe.</p> : null}</> : null}
  </details>;
}
