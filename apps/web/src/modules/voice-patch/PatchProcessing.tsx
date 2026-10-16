import { useEffect, useRef, useState } from "react";
import type { ProjectVoice, VoiceOutput } from "../../domain/types";
import type { VoicePatchDocument } from "../../domain/voice-patch";

interface PatchJob {
  id: string; key: string; status: string; draftRevision: number; outputId: string;
  scriptRevision: number; editRevision: number; replacementText: string; voiceId: string;
  done: number; total: number; error?: string | null; audioUrl?: string | null;
  replacementAudioUrl?: string | null; createdAt?: string; updatedAt?: string;
}
interface PatchPlan { processingAvailable: boolean; draftRevision: number; blockers: string[]; latestJob?: PatchJob | null }
interface AppliedPatch { output: VoiceOutput; audioUrl: string; sourceOutputId: string; key: string; report: Record<string, unknown> }
export type PatchMode = "trained-output" | "trained-media" | "context" | "hybrid";
interface Props {
  projectId: string; document: VoicePatchDocument; currentSource: boolean; saved: boolean;
  voices: ProjectVoice[]; onOutputReady?: (output: VoiceOutput) => void;
  mode?: PatchMode;
}
async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không xử lý được bản vá.");
  return result as T;
}
const active = (job: PatchJob | null) => !!job && ["running", "queued"].includes(job.status);

export function PatchProcessing({ projectId, document, currentSource, saved, voices, onOutputReady, mode = "trained-output" }: Props) {
  const draft = document.draft!;
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-patch${mode === "trained-output" ? "" : `/${mode}`}`;
  const contextMode = mode === "context", hybridMode = mode === "hybrid";
  const owner = `${endpoint}:${document.revision}`;
  const [text, setText] = useState(draft.replacementText);
  const eligible = contextMode ? [{ id: "context-clone", name: "Giọng từ vùng tham chiếu", kind: "clone" }] : voices.filter((voice) => voice.speakerProfileId === draft.speakerProfileId && voice.engine === "omnivoice" && ["full", "lora"].includes(voice.kind));
  const [voiceId, setVoiceId] = useState(eligible.find((voice) => voice.id === draft.voiceId)?.id ?? eligible[0]?.id ?? "");
  const [plan, setPlan] = useState<PatchPlan | null>(null);
  const [job, setJob] = useState<PatchJob | null>(null);
  const [applied, setApplied] = useState<AppliedPatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = `${owner}:${currentSource}:${saved}:${text}:${voiceId}`;
  const current = useRef(identity); current.current = identity;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const serial = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; serial.current++; }; }, []);
  const running = active(job);
  const matching = job?.draftRevision === document.revision && job.outputId === draft.outputId
    && job.scriptRevision === draft.scriptRevision && job.editRevision === draft.editRevision
    && job.replacementText === text.trim().split(/\s+/u).join(" ") && job.voiceId === voiceId;
  function acceptJob(value: PatchJob, expectedOwner: string, allowNew = false) {
    if (!mounted.current || ownerRef.current !== expectedOwner) return;
    setJob((previous) => {
      if (previous) {
        if (previous.id !== value.id && !allowNew) return previous;
        if (previous.id !== value.id && previous.createdAt && value.createdAt && previous.createdAt > value.createdAt) return previous;
        if (previous.id === value.id && ((previous.updatedAt && value.updatedAt && previous.updatedAt > value.updatedAt)
          || (!active(previous) && active(value)) || previous.status === "cancelled")) return previous;
      }
      return value;
    });
  }
  useEffect(() => {
    if (!running || !job) return;
    let valid = true, timer: ReturnType<typeof setTimeout>;
    const expected = owner, id = job.id;
    const poll = async () => {
      try {
        const next = await request<PatchJob>(`${endpoint}/jobs/${encodeURIComponent(id)}`);
        if (valid) { acceptJob(next, expected); if (active(next)) timer = setTimeout(poll, 700); }
      } catch (reason) {
        if (valid && ownerRef.current === expected) { setError(String(reason)); timer = setTimeout(poll, 2000); }
      }
    };
    timer = setTimeout(poll, 500);
    return () => { valid = false; clearTimeout(timer); };
  }, [endpoint, owner, job?.id, running]);
  async function perform(action: "inspect" | "start" | "apply" | "applied") {
    const expected = identity, expectedOwner = owner, version = ++serial.current;
    setBusy(true); setError(null);
    try {
      if (action === "inspect") {
        const value = await request<PatchPlan>(`${endpoint}/process`);
        if (mounted.current && current.current === expected && version === serial.current) {
          setPlan(value); if (value.latestJob) acceptJob(value.latestJob, expectedOwner, true);
        }
      } else if (action === "start") {
        const value = await request<PatchJob>(`${endpoint}/jobs`, { expectedDraftRevision: document.revision,
          expectedScriptRevision: draft.scriptRevision, expectedEditRevision: draft.editRevision, replacementText: text.trim(), voiceId });
        // Keep ownership so Stop still works if the editor changes during Start.
        acceptJob(value, expectedOwner, true);
      } else {
        const value = await request<AppliedPatch>(`${endpoint}/${action}`, action === "apply" && job ? {
          expectedDraftRevision: document.revision, jobId: job.id, expectedKey: job.key,
        } : undefined);
        if (mounted.current && current.current === expected && version === serial.current) {
          setApplied(value); if (action === "apply") onOutputReady?.(value.output);
        }
      }
    } catch (reason) { if (current.current === expected && version === serial.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (ownerRef.current === expectedOwner && version === serial.current) setBusy(false); }
  }
  async function stop() {
    if (!job) return;
    const expected = owner;
    try { acceptJob(await request<PatchJob>(`${endpoint}/jobs/${encodeURIComponent(job.id)}/stop`, { includeActive: true }), expected); }
    catch (reason) { if (ownerRef.current === expected) setError(String(reason)); }
  }
  return <div className="patch-processing">
    <label className="patch-copy"><span>NỘI DUNG ĐỌC LẠI</span><textarea aria-label="Nội dung Patch" value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} /></label>
    <label className="patch-copy"><span>{hybridMode ? "MODEL TRAIN + CONTEXT" : contextMode ? "GIỌNG THAM CHIẾU" : "MODEL ĐÃ TRAIN"}</span><select aria-label="Model Patch" value={voiceId} onChange={(event) => setVoiceId(event.target.value)}>
      <option value="">Chọn model cùng người nói…</option>{eligible.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.kind}</option>)}
    </select></label>
    <p>{hybridMode ? "Giữ checkpoint đã train và dùng đoạn context cùng người nói làm tham chiếu. Không tự đổi sang clone nếu model không tương thích." : contextMode ? "Dùng model nền với đoạn tham chiếu đã chọn, không dùng checkpoint đã train. Nội dung tham chiếu không được thêm vào lời thay thế." : "Model đã train dùng kèm mẫu sạch đã lưu của model."} Bản vá giữ thời lượng đọc thực; phần sau tự dịch theo. Cần nghe thử trước khi áp dụng.</p>
    <button type="button" disabled={busy || running || !currentSource || !saved} onClick={() => void perform("inspect")}>Kiểm tra khả năng Patch</button>
    <button type="button" disabled={busy || running || !currentSource || !saved || !text.trim() || !eligible.some((voice) => voice.id === voiceId) || !plan?.processingAvailable || !!plan.blockers.length || plan.draftRevision !== document.revision} onClick={() => void perform("start")}>Tạo bản vá nghe thử</button>
    <button type="button" disabled={busy || running || !saved || !currentSource || !matching || job?.status !== "complete"} onClick={() => void perform("apply")}>Áp dụng bản vá</button>
    <button type="button" disabled={busy || running} onClick={() => void perform("applied")}>Đọc bản vá đã áp dụng</button>
    {busy ? <p role="status">Đang kiểm tra bản vá…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {plan?.blockers.map((blocker, index) => <p role="alert" key={index}>{blocker}</p>)}
    {!eligible.length ? <p>Chưa có model full/LoRA cùng người nói để vá bằng phương án này.</p> : null}
    {job ? <div><p role="status">{job.done}/{job.total} · {job.status}</p>
      {job.error ? <p role="alert">{job.error}</p> : null}
      {running ? <button type="button" onClick={() => void stop()}>Dừng tạo bản vá</button> : null}
      {!matching && !running ? <button type="button" onClick={() => { setText(job.replacementText); setVoiceId(job.voiceId); }}>Dùng thông số bản nghe thử đã lưu</button> : null}
      {matching && currentSource && job.status === "complete" ? <><p>Bản nghe thử chưa thay nguồn. Nghe cả đoạn ghép để kiểm tra ranh giới.</p>
        {job.replacementAudioUrl ? <audio controls aria-label="Nghe riêng lời thay thế" src={job.replacementAudioUrl} /> : null}
        {job.audioUrl ? <audio controls aria-label="Nghe bản ghép Patch" src={job.audioUrl} /> : null}</> : null}
    </div> : null}
    {applied ? <div><p>Bản vá đã lưu · {applied.output.duration.toFixed(3)} giây.</p><audio controls aria-label="Nghe bản vá đã lưu" src={applied.audioUrl} />
      <a href={applied.audioUrl} download="voice-patched.wav">Tải WAV bản vá</a>
      <button type="button" onClick={() => onOutputReady?.(applied.output)}>Mở bản vá trên Timeline</button></div> : null}
  </div>;
}
