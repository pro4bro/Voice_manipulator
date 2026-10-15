import { useEffect, useRef, useState } from "react";
import { REFERENCE_PROPERTIES, type ReferenceBinding, type ReferenceProperty } from "../../domain/reference-bindings";
import "./reference-detail.css";

interface ScheduleEvent {
  id: string;
  property: ReferenceProperty;
  targetStart: number;
  targetEnd: number;
  sourceAssetId: string;
  sourceStart: number;
  sourceEnd: number;
  strength: number;
  priority: number;
  capability: "unsupported";
  blocker: string;
  applied: false;
}

interface ReferenceSchedule {
  key: string;
  bindingId: string;
  seed: number;
  randomValues: boolean;
  randomTimes: boolean;
  events: ScheduleEvent[];
  notices: string[];
  applied: false;
  status: "ready" | "stale" | "conflict";
  statusReason: string | null;
}

interface ScheduleDocument { version: 1; revision: number; schedules: ReferenceSchedule[] }
interface PreviewRequest { bindingId: string; seed: number; randomValues: boolean; randomTimes: boolean }
interface PreviewState { schedule: ReferenceSchedule; inputVersion: number }

async function requestJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

const propertyLabel = (property: string) => REFERENCE_PROPERTIES.find(([key]) => key === property)?.[1] ?? property;
const seconds = (value: number) => `${value.toFixed(3)}s`;

export function ReferenceScheduleEditor({ projectId, binding }: { projectId: string; binding: ReferenceBinding }) {
  const project = encodeURIComponent(projectId);
  const endpoint = `/api/projects/${project}/reference-schedules`;
  const bindingSnapshot = JSON.stringify({ id: binding.id, scope: binding.scope, target: binding.target, sources: binding.sources });
  const identity = `${projectId}:${bindingSnapshot}`;
  const [seed, setSeed] = useState("1");
  const [randomValues, setRandomValues] = useState(false);
  const [randomTimes, setRandomTimes] = useState(false);
  const [revision, setRevision] = useState<number | null>(null);
  const [savedSchedule, setSavedSchedule] = useState<ReferenceSchedule | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loadToken = useRef(0);
  const previewToken = useRef(0);
  const inputVersion = useRef(0);
  const currentIdentity = useRef(identity);

  useEffect(() => {
    if (currentIdentity.current !== identity) {
      currentIdentity.current = identity;
      inputVersion.current++;
      previewToken.current++;
      setSeed("1"); setRandomValues(false); setRandomTimes(false);
      setRevision(null); setSavedSchedule(null); setPreview(null); setError(null);
    }
    const token = ++loadToken.current;
    const version = inputVersion.current;
    let active = true;
    setLoading(true);
    setError(null);
    void requestJson<ScheduleDocument>(endpoint).then((document) => {
      if (!active || token !== loadToken.current) return;
      setRevision(document.revision);
      const saved = document.schedules.find((item) => item.bindingId === binding.id) ?? null;
      setSavedSchedule(saved);
      if (inputVersion.current === version && saved) {
        setSeed(String(saved.seed));
        setRandomValues(saved.randomValues);
        setRandomTimes(saved.randomTimes);
      }
    }).catch((reason: unknown) => {
      if (active && token === loadToken.current) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (active && token === loadToken.current) setLoading(false);
    });
    return () => { active = false; };
  }, [identity, endpoint, binding.id, loadAttempt]);

  const parsedSeed = Number(seed);
  const validSeed = seed.trim() !== "" && Number.isSafeInteger(parsedSeed) && parsedSeed >= 0;
  const timedTarget = binding.target.start !== null && binding.target.end !== null;
  const bindingReady = binding.status === "requested";
  const canPreview = !loading && !previewing && !applying && validSeed && timedTarget && bindingReady;
  const currentPreview = preview?.inputVersion === inputVersion.current ? preview.schedule : null;
  const shownSchedule = currentPreview ?? savedSchedule;
  const shownAsSaved = !currentPreview && Boolean(savedSchedule);
  const previewSaved = Boolean(currentPreview && savedSchedule?.key === currentPreview.key && savedSchedule.status === "ready");

  function updateInputs(update: () => void) {
    inputVersion.current++;
    previewToken.current++;
    setPreview(null);
    setPreviewing(false);
    setError(null);
    update();
  }

  async function makePreview() {
    if (!canPreview) return;
    const version = inputVersion.current;
    const token = ++previewToken.current;
    const body: PreviewRequest = { bindingId: binding.id, seed: parsedSeed, randomValues, randomTimes };
    setPreviewing(true); setPreview(null); setError(null);
    try {
      const schedule = await requestJson<ReferenceSchedule>(`${endpoint}/preview`, body);
      if (token === previewToken.current && version === inputVersion.current) setPreview({ schedule, inputVersion: version });
    } catch (reason) {
      if (token === previewToken.current && version === inputVersion.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (token === previewToken.current) setPreviewing(false);
    }
  }

  function rerollSeed() {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    updateInputs(() => setSeed(String(values[0])));
  }

  function reloadSavedSchedule() {
    inputVersion.current++;
    previewToken.current++;
    setPreview(null);
    setRevision(null);
    setError(null);
    setLoadAttempt((current) => current + 1);
  }

  async function applyPreview() {
    if (!currentPreview || revision === null || applying) return;
    const version = inputVersion.current;
    setApplying(true); setError(null);
    try {
      const document = await requestJson<ScheduleDocument>(endpoint, {
        bindingId: binding.id,
        seed: parsedSeed,
        randomValues,
        randomTimes,
        expectedRevision: revision,
        expectedKey: currentPreview.key,
      });
      if (version !== inputVersion.current) return;
      setRevision(document.revision);
      const saved = document.schedules.find((item) => item.bindingId === binding.id) ?? null;
      setSavedSchedule(saved);
    } catch (reason) {
      if (version === inputVersion.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setApplying(false);
    }
  }

  return <section aria-label="Random reference schedule" className="reference-detail__expanded">
    <h3>Lịch reference</h3>
    {binding.target.start === null || binding.target.end === null
      ? <p role="status">Cần chọn vùng đích có timing thực. Không thể đoán thời điểm cho câu chưa có audio.</p>
      : <p>{seconds(binding.target.start)} – {seconds(binding.target.end)} · {(binding.target.end - binding.target.start).toFixed(3)}s</p>}
    {binding.status !== "requested" ? <p role="alert">Reference {binding.status === "missing" ? "thiếu nguồn" : "đã cũ"}. Cập nhật hoặc gán lại trước khi tạo lịch.</p> : null}
    {loading ? <p role="status" aria-busy="true">Đang đọc lịch đã lưu…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <button type="button" disabled={loading || applying} onClick={reloadSavedSchedule}>Đọc lại lịch đã lưu</button>
    <fieldset disabled={applying} aria-label="Cấu hình random reference">
      <label>Seed <input aria-label="Seed" type="number" min="0" step="1" value={seed}
        onChange={(event) => updateInputs(() => setSeed(event.target.value))} /></label>
      <button type="button" disabled={applying} onClick={rerollSeed}>Tạo seed mới</button>
      <label><input type="checkbox" checked={randomValues} onChange={(event) => updateInputs(() => setRandomValues(event.target.checked))} />Random giá trị</label>
      <label><input type="checkbox" checked={randomTimes} onChange={(event) => updateInputs(() => setRandomTimes(event.target.checked))} />Random thời điểm</label>
    </fieldset>
    <div className="reference-detail__slot">
      <button type="button" disabled={!canPreview} onClick={() => void makePreview()}>{previewing ? "Đang tạo preview…" : "Preview lịch"}</button>
      <button type="button" disabled={!currentPreview || currentPreview.status !== "ready" || applying} onClick={() => void applyPreview()}>{applying ? "Đang lưu lịch…" : "Apply lịch"}</button>
    </div>
    {previewing ? <p role="status">Đang tính lịch cho cấu hình hiện tại…</p> : null}
    {shownSchedule ? <div aria-label={shownAsSaved ? "Lịch đã lưu" : "Preview lịch hiện tại"}>
      <p>{shownAsSaved ? "Lịch đã lưu · cần preview lại trước khi Apply" : previewSaved ? "Preview hiện tại · đã lưu vào project" : "Preview hiện tại"} · Seed {shownSchedule.seed} · {shownSchedule.events.length} sự kiện</p>
      {shownSchedule.status !== "ready" ? <p role="alert">{shownSchedule.statusReason ?? "Lịch không còn khớp với binding hiện tại."}</p> : null}
      {shownSchedule.notices.map((notice, index) => <p role="status" key={`${notice}-${index}`}>{notice}</p>)}
      <ul aria-label="Sự kiện lịch reference">
        {shownSchedule.events.map((event) => <li key={event.id}>
          <strong>{propertyLabel(event.property)}</strong>: {seconds(event.targetStart)}–{seconds(event.targetEnd)} · {event.sourceAssetId} {seconds(event.sourceStart)}–{seconds(event.sourceEnd)}
          <p>{event.blocker} Chưa áp dụng vào audio.</p>
        </li>)}
      </ul>
    </div> : null}
  </section>;
}
