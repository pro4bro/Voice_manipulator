import { useEffect, useRef, useState } from "react";
import { queuedDownloadUrl } from "../../api/client";
import type { VoiceOutput } from "../../domain/types";

interface FixUnit { rowId: string; text: string; desiredKey: string; status: string; reason?: string | null }
interface FixPlan { key: string; scriptRevision: number; editRevision: number; dirtyCount: number; blockers: string[]; units: FixUnit[]; latestJob?: FixJob | null }
interface FixJob { id: string; status: string; done: number; total: number; units: FixUnit[]; error?: string | null; createdAt?: string; updatedAt?: string }
interface AppliedFix { output: VoiceOutput; audioUrl: string; sourceOutputId: string; key: string; report: Record<string, unknown> }
interface Props { projectId: string; outputId: string; scriptRevision: number; editRevision: number; saved: boolean; output?: VoiceOutput; onOutputReady?: (output: VoiceOutput) => void; onNavigateOutput?: (id: string) => void }

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không thể sửa giọng.");
  return result as T;
}

/** Fix builds immutable sentence clips; applying them to a take is a separate action. */
export function VoiceFixControls({ projectId, outputId, scriptRevision, editRevision, saved, output, onOutputReady, onNavigateOutput }: Props) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(outputId)}/fix`;
  const identity = `${endpoint}:${scriptRevision}:${editRevision}`;
  const current = useRef(identity); current.current = identity;
  const [plan, setPlan] = useState<{ identity: string; value: FixPlan } | null>(null);
  const [job, setJob] = useState<{ endpoint: string; value: FixJob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ identity: string; value: AppliedFix } | null>(null);
  const serial = useRef(0);
  const startSerial = useRef(0);
  useEffect(() => { serial.current++; setPlan(null); setBusy(false); setError(null); }, [identity]);
  const inspected = plan?.identity === identity ? plan.value : null;
  const activeJob = job?.endpoint === endpoint ? job.value : null;
  const shownApplied = applied?.identity === identity ? applied.value : null;
  const lineage = output?.parameters.fix;
  const sourceId = lineage && typeof lineage === "object" && "sourceOutputId" in lineage && typeof lineage.sourceOutputId === "string" ? lineage.sourceOutputId : null;
  const running = activeJob?.status === "running" || activeJob?.status === "queued";
  function acceptJob(value: FixJob, owner: string, allowNew = false) {
    if (!current.current.startsWith(`${owner}:`)) return;
    setJob((previous) => {
      if (previous?.endpoint === owner) {
        const older = previous.value;
        if (older.id !== value.id && !allowNew) return previous;
        if (older.id !== value.id && older.createdAt && value.createdAt && older.createdAt > value.createdAt) return previous;
        if (older.id === value.id) {
          if (older.updatedAt && value.updatedAt && older.updatedAt > value.updatedAt) return previous;
          if (!["running", "queued"].includes(older.status) && ["running", "queued"].includes(value.status)) return previous;
          if (older.status === "cancelled" && value.status !== "cancelled") return previous;
        }
      }
      return { endpoint: owner, value };
    });
  }
  useEffect(() => {
    if (!running || !activeJob) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<FixJob>(`${endpoint}/jobs/${encodeURIComponent(activeJob.id)}`);
        if (active) { acceptJob(next, endpoint); if (["running", "queued"].includes(next.status)) timer = setTimeout(poll, 700); }
      } catch (reason) { if (active) { setError(reason instanceof Error ? reason.message : String(reason)); timer = setTimeout(poll, 2000); } }
    };
    timer = setTimeout(poll, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [endpoint, activeJob?.id, running]);

  async function inspect() {
    const expected = identity, version = ++serial.current;
    setBusy(true); setError(null); setPlan(null);
    try {
      const value = await request<FixPlan>(endpoint);
      if (current.current === expected && serial.current === version) {
        setPlan({ identity: expected, value });
        if (value.latestJob) acceptJob(value.latestJob, endpoint, true);
      }
    } catch (reason) { if (current.current === expected && serial.current === version) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (current.current === expected && serial.current === version) setBusy(false); }
  }
  async function start() {
    if (!inspected || !saved || running || busy || inspected.blockers.length || !inspected.dirtyCount) return;
    const expected = identity, version = ++serial.current;
    const startVersion = ++startSerial.current;
    setBusy(true); setError(null);
    try {
      const value = await request<FixJob>(`${endpoint}/jobs`, { expectedKey: inspected.key, expectedScriptRevision: inspected.scriptRevision, expectedEditRevision: inspected.editRevision });
      if (startVersion === startSerial.current) acceptJob(value, endpoint, true);
    } catch (reason) { if (current.current === expected && serial.current === version) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (current.current === expected && serial.current === version) setBusy(false); }
  }
  async function stop(includeActive: boolean) {
    if (!activeJob) return;
    const expectedEndpoint = endpoint, id = activeJob.id;
    try {
      const value = await request<FixJob>(`${endpoint}/jobs/${encodeURIComponent(id)}/stop`, { includeActive });
      acceptJob(value, expectedEndpoint);
    } catch (reason) { if (current.current.startsWith(`${expectedEndpoint}:`)) setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function loadApplied(apply: boolean) {
    if (apply && (!inspected || inspected.dirtyCount || inspected.blockers.length || !saved || running)) return;
    const expected = identity, version = ++serial.current;
    setBusy(true); setError(null);
    try {
      const value = await request<AppliedFix>(endpoint + (apply ? "/apply" : "/applied"), apply && inspected ? {
        expectedKey: inspected.key, expectedScriptRevision: inspected.scriptRevision, expectedEditRevision: inspected.editRevision,
      } : undefined);
      if (current.current === expected && serial.current === version) {
        setApplied({ identity: expected, value });
        if (apply) onOutputReady?.(value.output);
      }
    } catch (reason) { if (current.current === expected && serial.current === version) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (current.current === expected && serial.current === version) setBusy(false); }
  }
  return <details className="voice-script-settings"><summary>Fix Voice Generated</summary>
    <p>Chỉ tạo lại câu có thay đổi text, voice hoặc thời lượng. Dịch vị trí và chỉnh âm lượng không yêu cầu tạo lại giọng.</p>
    <button type="button" disabled={!saved || busy || running} onClick={() => void inspect()}>Kiểm tra phần cần sửa</button>
    <button type="button" disabled={!saved || busy || running || !inspected || !inspected.dirtyCount || inspected.blockers.length > 0} onClick={() => void start()}>Fix Voice Generated</button>
    <button type="button" disabled={!saved || busy || running || !inspected || inspected.dirtyCount > 0 || inspected.blockers.length > 0} onClick={() => void loadApplied(true)}>Áp dụng bản Fix</button>
    <button type="button" disabled={busy || running || !saved} onClick={() => void loadApplied(false)}>Đọc bản Fix đã lưu</button>
    {sourceId && onNavigateOutput ? <button type="button" disabled={busy || running} onClick={() => onNavigateOutput(sourceId)}>Quay lại nguồn trước Fix</button> : null}
    {!saved ? <p>Chờ Script lưu xong trước khi Fix.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {inspected ? <div><p>{inspected.dirtyCount ? `${inspected.dirtyCount} câu cần tạo lại` : "Không có câu nào cần tạo lại."}</p>
      {inspected.blockers.map((reason, index) => <p role="alert" key={index}>{reason}</p>)}
      <ul>{inspected.units.map((unit) => <li key={unit.rowId}>{unit.text} · {unit.status === "ready" ? "Có clip khớp" : unit.status === "dirty" ? "Cần tạo lại" : "Cần xử lý"}{unit.reason ? ` · ${unit.reason}` : ""}</li>)}</ul></div> : null}
    {activeJob ? <div role="status"><p>{activeJob.done}/{activeJob.total} câu · {activeJob.status}</p>
      {running ? <><button type="button" onClick={() => void stop(false)}>Dừng sau câu này</button><button type="button" onClick={() => void stop(true)}>Dừng ngay</button></> : null}
      {activeJob.error ? <p role="alert">{activeJob.error}</p> : null}
      {activeJob.status === "complete" ? <p>Đã tạo các clip sửa. Chưa thay audio đang mở.</p> : null}
    </div> : null}
    {shownApplied ? <div><p>Bản Fix đã kiểm tra · {shownApplied.output.duration?.toFixed(3)} giây. Nguồn vẫn được giữ nguyên.</p>
      <audio controls aria-label="Nghe bản Fix" src={shownApplied.audioUrl} />
      <a href={queuedDownloadUrl(shownApplied.audioUrl)} download="voice-fixed.wav">Tải WAV bản Fix</a>
      <button type="button" onClick={() => onOutputReady?.(shownApplied.output)}>Mở bản Fix trên Timeline</button>
    </div> : null}
  </details>;
}
