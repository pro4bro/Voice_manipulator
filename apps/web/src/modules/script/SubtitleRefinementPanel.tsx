import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { api } from "../../api/client";
import { SUBTITLE_ALIGNMENT_METHODS, type SubtitleAlignmentEngine, type SubtitleAlignmentEngineId, type SubtitleAlignmentEngineSettings, type SubtitleAlignmentProposal, type SubtitleRefinementMethod } from "../../domain/subtitle-alignment";
import type { ActivityTask, ProjectMediaAsset } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { SubtitleAlignmentControl } from "./SubtitleAlignmentDialog";
import { useSubtitleTimingPreview } from "./SubtitleTimingPreview";

const order: SubtitleRefinementMethod["mode"][] = ["diagnose", "auto", "common-offset", "edge-offset", "group-offset", "ctc", "waveform", "offset"];
const sourceKey = (asset: ProjectMediaAsset) => JSON.stringify([asset.id, asset.words, asset.text, asset.duration, asset.removedRanges, asset.sourcePath]);
const message = (error: unknown) => error instanceof Error ? error.message : "Không thể tinh chỉnh subtitle.";
type SettingsByEngine = Record<SubtitleAlignmentEngineId, SubtitleAlignmentEngineSettings>;
const initialSettings: SettingsByEngine = {
  mfa: { language: "vi", beam: 10, retryBeam: 40 },
  "stable-ts": { language: "vi", model: "base", refine: true, precision: 0.1, maxWordDuration: 3, windowSeconds: 20 },
  easyaligner: { language: "vi", windowSeconds: 30, paddingSeconds: 1 },
};

export function SubtitleRefinementPanel({ projectId, assets, selection, prepare, onApplied }: ComponentProps<typeof SubtitleAlignmentControl>) {
  const timing = useSubtitleTimingPreview();
  const choices = useMemo(() => assets.filter((asset) => asset.transcriptionStatus === "complete" && asset.words?.length && !asset.disabled && !asset.deletedAt), [assets]);
  const [assetId, setAssetId] = useState(choices[0]?.id ?? "");
  const asset = choices.find((item) => item.id === assetId);
  const [engines, setEngines] = useState<SubtitleAlignmentEngine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [engineId, setEngineId] = useState<SubtitleAlignmentEngineId>("easyaligner");
  const [settingsByEngine, setSettingsByEngine] = useState<SettingsByEngine>(initialSettings);
  const [maxMoveMs, setMaxMoveMs] = useState(2000);
  const [enabled, setEnabled] = useState<SubtitleRefinementMethod["mode"][]>([]);
  const [settings, setSettings] = useState<Record<string, SubtitleRefinementMethod>>(() => Object.fromEntries(order.map((mode) => [mode, { mode, strength: 100, maxMoveMs: 2000, startOffsetMs: 0, endOffsetMs: 0 }])));
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [proposal, setProposal] = useState<SubtitleAlignmentProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [trackingAlignment, setTrackingAlignment] = useState(false);
  const [activityTask, setActivityTask] = useState<ActivityTask | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const catalogGeneration = useRef(0);
  const savedProposalGeneration = useRef(0);
  const acceptedKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const activityStartedAt = useRef(0);
  const inputKey = asset ? sourceKey(asset) : "";
  const latestKey = useRef(inputKey); latestKey.current = inputKey;
  const selectionMatches = selection?.scope?.kind === "asset" && selection.scope.id === assetId && selection.scope.revision === asset?.updatedAt && selection.indexes.length > 0;
  const scopeKey = selectedOnly ? JSON.stringify([selection?.scope, selection?.indexes]) : "whole";
  const indexes = selectedOnly && selectionMatches ? selection!.indexes : undefined;
  const plan = order.filter((mode) => enabled.includes(mode)).map((mode) => settings[mode]);
  const validMethods = plan.every((method) => Object.values(method).every((value) => typeof value !== "number" || Number.isFinite(value)) && method.strength >= 0 && method.strength <= 100 && method.maxMoveMs >= 0 && method.maxMoveMs <= 2000 && Math.abs(method.startOffsetMs) <= 2000 && Math.abs(method.endOffsetMs) <= 2000);
  const engine = engines.find((item) => item.id === engineId);
  const language = String(settingsByEngine[engineId].language ?? "vi");
  const selectedModel = engine?.models.find((item) => engineId === "stable-ts" ? item.id === settingsByEngine[engineId].model : item.id === language || item.id === `${engineId === "mfa" ? "mfa" : "easy"}:${language}` || item.language === language);
  const ready = Boolean(asset && engine?.available && selectedModel?.available && !catalogLoading);
  const engineSettings = settingsByEngine[engineId];
  const validEngineSettings = engineId === "mfa"
    ? Number.isInteger(engineSettings.beam) && Number(engineSettings.beam) >= 1 && Number(engineSettings.beam) <= 100 && Number.isInteger(engineSettings.retryBeam) && Number(engineSettings.retryBeam) >= 1 && Number(engineSettings.retryBeam) <= 200 && Number(engineSettings.retryBeam) >= Number(engineSettings.beam)
    : engineId === "stable-ts"
      ? Number(engineSettings.precision) >= 0.02 && Number(engineSettings.precision) <= 0.5 && Number(engineSettings.maxWordDuration) >= 0.1 && Number(engineSettings.maxWordDuration) <= 10 && Number(engineSettings.windowSeconds) >= 2 && Number(engineSettings.windowSeconds) <= 30
      : Number(engineSettings.windowSeconds) >= 2 && Number(engineSettings.windowSeconds) <= 30 && Number(engineSettings.paddingSeconds) >= 0 && Number(engineSettings.paddingSeconds) <= 2;
  const changed = proposal?.rows.filter((row) => row.status !== "locked" && (row.before.start !== row.after.start || row.before.end !== row.after.end)).length ?? 0;
  const setPreview = timing?.setPreview;

  useEffect(() => {
    if (!choices.some((item) => item.id === assetId)) setAssetId(choices[0]?.id ?? "");
  }, [choices, assetId]);
  useEffect(() => {
    if (!asset) { setEngines([]); return; }
    const version = ++catalogGeneration.current, key = inputKey;
    setCatalogLoading(true); setNotice(null);
    void api.subtitleAlignmentEngines(projectId, asset.id).then((catalog) => {
      if (mounted.current && version === catalogGeneration.current && latestKey.current === key) {
        setEngines(catalog.engines);
        if (!catalog.engines.some((item) => item.id === engineId)) setEngineId("easyaligner");
      }
    }).catch((error) => { if (mounted.current && version === catalogGeneration.current) setNotice(message(error)); })
      .finally(() => { if (mounted.current && version === catalogGeneration.current) setCatalogLoading(false); });
  }, [projectId, assetId, inputKey]);
  useEffect(() => {
    if (acceptedKey.current === inputKey) { acceptedKey.current = null; return; }
    generation.current++; setProposal(null); setPreview?.(null);
  }, [inputKey, setPreview]);
  useEffect(() => {
    if (!asset) return;
    const version = ++savedProposalGeneration.current, key = inputKey, targetId = asset.id;
    void api.getSubtitleAlignment(projectId, targetId).then((value) => {
      if (mounted.current && version === savedProposalGeneration.current && latestKey.current === key && value?.mode === "pipeline" && value.state === "applied") setProposal(value);
    }).catch((error) => { if (mounted.current && version === savedProposalGeneration.current) setNotice(message(error)); });
  }, [projectId, assetId, inputKey]);
  useEffect(() => {
    if (!trackingAlignment || !asset) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { tasks } = await api.getProjectQueue(projectId);
        if (!active) return;
        const match = tasks.filter((task) => task.kind === "alignment" && task.assetId === asset.id &&
          Date.parse(task.startedAt) >= activityStartedAt.current - 1000)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
        if (match) setActivityTask(match);
      } catch { /* The preview request still reports its own error. */ }
      finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 300);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId, assetId, trackingAlignment]);
  useEffect(() => { setActivityTask(null); }, [projectId, assetId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; setPreview?.(null); };
  }, [setPreview]);
  useEffect(() => {
    generation.current++; setPreview?.(null);
    setProposal((current) => current?.state === "applied" ? current : null);
  }, [scopeKey, engineId, settingsByEngine, maxMoveMs, setPreview]);

  function invalidate() { generation.current++; savedProposalGeneration.current++; setPreview?.(null); setNotice(null); setProposal((current) => current?.state === "applied" ? current : null); }
  function setEngineSetting(field: string, value: string | number | boolean) {
    invalidate(); setSettingsByEngine((current) => ({ ...current, [engineId]: { ...current[engineId], [field]: value } }));
  }
  function parameter(mode: string, field: keyof Omit<SubtitleRefinementMethod, "mode">, raw: string) {
    invalidate(); setSettings((current) => ({ ...current, [mode]: { ...current[mode], [field]: raw.trim() ? Number(raw) : NaN } }));
  }
  async function preview() {
    if (!asset || busy || !setPreview || !ready || !validEngineSettings || !Number.isFinite(maxMoveMs) || maxMoveMs < 0 || maxMoveMs > 2000 || !validMethods || (selectedOnly && !selectionMatches)) return;
    const version = ++generation.current, target = asset, key = inputKey;
    savedProposalGeneration.current++;
    setBusy(true); setTrackingAlignment(true); setActivityTask(null); activityStartedAt.current = Date.now(); setNotice(null); setPreview(null);
    try {
      await prepare(target.id);
      const value = await api.previewSubtitleEngine(projectId, target.id, { engineId, settings: settingsByEngine[engineId], maxMoveMs, ...(plan.length ? { methods: plan } : {}), ...(indexes ? { indexes } : {}) });
      if (mounted.current && version === generation.current && latestKey.current === key) {
        setProposal(value);
        if (value.stale) { setNotice("Nguồn đã đổi. Bấm Ghost Preview để tính lại."); return; }
        setPreview({ assetId: target.id, sourceWordsKey: JSON.stringify(target.words), rows: value.rows, conflictIndexes: value.diagnostics.conflictIndexes ?? [] });
        setNotice(value.aligner.status === "unavailable" || value.aligner.status === "failed" ? value.aligner.reason ?? "Engine chưa tạo được mốc căn chỉnh." : "Ghost đang hiện trên Timeline. Phát audio để nghe và kiểm tra trước khi áp dụng.");
      }
    } catch (error) { if (mounted.current && version === generation.current) setNotice(message(error)); }
    finally {
      try {
        const { tasks } = await api.getProjectQueue(projectId);
        if (mounted.current && latestKey.current === key) {
          const latest = tasks.filter((task) => task.kind === "alignment" && task.assetId === target.id &&
            Date.parse(task.startedAt) >= activityStartedAt.current - 1000)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
          if (latest) setActivityTask(latest);
        }
      } catch { /* The preview request still reports its own error. */ }
      if (mounted.current) { setBusy(false); setTrackingAlignment(false); }
    }
  }
  async function apply(restore = false) {
    if (!asset || !proposal || busy) return;
    setBusy(true); setNotice(null);
    const version = ++generation.current;
    try {
      await prepare(asset.id);
      const result = restore ? await api.restoreSubtitleAlignment(projectId, asset.id, proposal.id) : await api.applySubtitleTimingPreview(projectId, asset.id, proposal.id);
      acceptedKey.current = sourceKey(result.asset); onApplied(result.asset);
      if (mounted.current && version === generation.current) {
        setPreview?.(null); setProposal(result.proposal);
        setNotice(restore ? "Đã khôi phục timing trước lần Apply." : `Đã áp dụng ${changed} từ thay đổi. Từ xung đột vẫn được đánh dấu đỏ trên Timeline.`);
      }
    } catch (error) { if (mounted.current) setNotice(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  }

  const numericSetting = (field: string, label: string, min: number, max: number, step = 1) => <label>{label}<input type="number" aria-label={label} value={Number.isFinite(settingsByEngine[engineId][field]) ? Number(settingsByEngine[engineId][field]) : ""} min={min} max={max} step={step} disabled={busy || catalogLoading} onChange={(event) => setEngineSetting(field, event.target.value.trim() ? Number(event.target.value) : NaN)} /></label>;
  const languageSetting = <label>Ngôn ngữ<select aria-label={`Ngôn ngữ ${engineId === "stable-ts" ? "stable-ts" : engine?.label ?? engineId}`} disabled={busy || catalogLoading} value={language} onChange={(event) => setEngineSetting("language", event.target.value)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>;

  return <ModuleFrame title="Tinh chỉnh subtitle" className="subtitle-refinement-module">
    <div className="subtitle-refinement-actions" role="group" aria-label="Thao tác căn chỉnh subtitle">
      <button type="button" className="button button--accent" disabled={busy || !timing || !ready || !validEngineSettings || !validMethods || !Number.isFinite(maxMoveMs) || maxMoveMs < 0 || maxMoveMs > 2000 || (selectedOnly && !selectionMatches)} onClick={() => void preview()}>{busy ? "Đang xử lý…" : "Ghost Preview"}</button>
      <button type="button" className="button button--quiet" disabled={busy || !timing?.preview || proposal?.state !== "proposed" || proposal.stale || !changed || (selectedOnly && !selectionMatches)} onClick={() => void apply()}>Apply Aligner</button>
      {proposal?.state === "applied" ? <button type="button" className="button button--quiet" disabled={busy || proposal.stale} onClick={() => void apply(true)}>Khôi phục timing</button> : null}
    </div>
    {activityTask ? <div className="subtitle-alignment-activity" role="status" aria-live="polite">
      {activityTask.status === "running" ? "Đang căn subtitle" : activityTask.status === "complete" ? "Đã tạo đề xuất căn subtitle" : "Căn subtitle thất bại"}
      {activityTask.detail ? ` · ${activityTask.detail}` : ""}
      {activityTask.fraction !== null ? ` · ${Math.round(activityTask.fraction * 100)}%` : ""}
      {activityTask.status === "failed" && activityTask.error ? ` · ${activityTask.error}` : ""}
      <progress aria-label="Tiến trình căn chỉnh subtitle" max="1" value={activityTask.fraction ?? undefined} />
    </div> : trackingAlignment ? <progress aria-label="Đang chuẩn bị căn chỉnh subtitle" /> : null}
    <small>Ghost Preview chạy engine và hiện timing mới mờ trên Timeline. Apply Aligner lưu các thay đổi sau khi kiểm tra.</small>
    {!choices.length ? <p role="status">Chọn footage hoặc track trong Media Pool đã STT xong và có timing từng từ để bật Ghost Preview.</p> : <div className="subtitle-refinement-settings">
      <label>Track<select aria-label="Track tinh chỉnh" disabled={busy} value={assetId} onChange={(event) => { invalidate(); setAssetId(event.target.value); }}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Engine<select aria-label="Engine căn chỉnh subtitle" disabled={busy || catalogLoading} value={engineId} onChange={(event) => { invalidate(); setEngineId(event.target.value as SubtitleAlignmentEngineId); }}>{engines.map((item) => <option value={item.id} key={item.id}>{item.label}{item.available ? "" : " · chưa sẵn sàng"}</option>)}</select></label>
      {catalogLoading ? <small role="status">Đang kiểm tra engine và model…</small> : null}
      {engine ? <><p>{engine.description} · Mã nguồn {engine.license}</p>{languageSetting}{selectedModel ? <small>Model: {selectedModel.label} · {selectedModel.license}</small> : null}
        {engineId === "mfa" ? <div className="subtitle-refinement-parameters">{numericSetting("beam", "Beam", 1, 100)}{numericSetting("retryBeam", "Retry beam", 1, 200)}<small>Retry beam phải ≥ Beam; được dùng nếu lượt tìm đầu tiên thất bại.</small></div> : null}
        {engineId === "stable-ts" ? <><label>Model stable-ts<select aria-label="Model stable-ts" disabled={busy || catalogLoading} value={String(settingsByEngine[engineId].model)} onChange={(event) => setEngineSetting("model", event.target.value)}>{engine.models.map((model) => <option value={model.id} key={model.id}>{model.label}{model.available ? "" : " · chưa sẵn sàng"}</option>)}</select></label><label><input type="checkbox" checked={Boolean(settingsByEngine[engineId].refine)} disabled={busy || catalogLoading} onChange={(event) => setEngineSetting("refine", event.target.checked)} />Refine</label><div className="subtitle-refinement-parameters">{numericSetting("precision", "Precision", 0.02, 0.5, 0.01)}{numericSetting("maxWordDuration", "Max word duration (s)", 0.1, 10, 0.1)}{numericSetting("windowSeconds", "Window (s)", 2, 30)}</div></> : null}
        {engineId === "easyaligner" ? <div className="subtitle-refinement-parameters">{numericSetting("windowSeconds", "Window (s)", 2, 30)}{numericSetting("paddingSeconds", "Padding (s)", 0, 2, 0.1)}</div> : null}
        {engine.available && !selectedModel?.available ? <small role="alert">{selectedModel?.reason || "Model cho ngôn ngữ này chưa sẵn sàng."}</small> : null}
        {!engine.available ? <small role="alert">{engine.reason || "Engine chưa sẵn sàng."}</small> : null}
      </> : <small>{engines.length ? "Engine được chọn không có trong catalog." : "Không có engine căn chỉnh khả dụng."}</small>}
      <label>Giới hạn dịch tối đa (ms)<input type="number" aria-label="Giới hạn dịch tối đa (ms)" min={0} max={2000} step={10} value={Number.isFinite(maxMoveMs) ? maxMoveMs : ""} disabled={busy} onChange={(event) => { invalidate(); setMaxMoveMs(event.target.value.trim() ? Number(event.target.value) : NaN); }} /></label>
      <label><input type="checkbox" checked={selectedOnly} disabled={busy || (!selectionMatches && !selectedOnly)} onChange={(event) => { invalidate(); setSelectedOnly(event.target.checked); }} />Chỉ các từ đang chọn</label>
      <details><summary>Tùy chọn nâng cao: phương pháp bổ sung</summary><small>Bật các phương pháp bổ sung nếu cần. Mốc chỉnh tay được giữ.</small><div className="subtitle-refinement-methods">{order.map((mode) => {
        const method = SUBTITLE_ALIGNMENT_METHODS.find((item) => item.id === mode)!; const active = enabled.includes(mode), values = settings[mode];
        const input = (field: keyof Omit<SubtitleRefinementMethod, "mode">, label: string, min: number, max: number) => <label>{label}<input type="number" aria-label={`${method.label}: ${label}`} value={Number.isFinite(values[field]) ? values[field] : ""} min={min} max={max} disabled={busy} onChange={(event) => parameter(mode, field, event.target.value)} /></label>;
        return <section key={mode} className="subtitle-refinement-choice"><label><input type="checkbox" checked={active} disabled={busy} onChange={(event) => { invalidate(); setEnabled((current) => event.target.checked ? [...current, mode] : current.filter((value) => value !== mode)); }} />{method.label}</label>{active ? <details><summary>Thông số</summary><p>{mode === "offset" ? "Số dương dịch muộn hơn; số âm dịch sớm hơn." : method.description}</p><div className="subtitle-refinement-parameters">{mode === "offset" ? <>{input("startOffsetMs", "Offset IN (ms)", -2000, 2000)}{input("endOffsetMs", "Offset OUT (ms)", -2000, 2000)}</> : null}{mode !== "diagnose" ? <>{input("strength", "Mức áp dụng (%)", 0, 100)}{input("maxMoveMs", "Dịch tối đa (ms)", 0, 2000)}</> : null}</div></details> : null}</section>;
      })}</div></details>
      <small>Ghost mờ nằm phía trên subtitle gốc; đỏ là xung đột. Dùng nút Phát của Timeline để nghe và so với waveform.</small>
      {!busy && (!proposal || proposal.state !== "proposed") ? <small>Apply Aligner sẽ bật khi Ghost Preview có timing mới để áp dụng.</small> : null}
      {proposal?.state === "proposed" && !changed ? <small>Không có timing thay đổi để áp dụng. Các từ đã chỉnh tay được giữ nguyên.</small> : null}
      {proposal ? <p role="status">{changed} từ thay đổi · {proposal.summary.locked} từ khóa{proposal.diagnostics.conflictIndexes?.length ? <strong className="subtitle-refinement-conflicts"> · {proposal.diagnostics.conflictIndexes.length} từ xung đột timing</strong> : null}</p> : null}
      {proposal?.diagnostics.drift ? <details><summary>Kiểm tra độ lệch chữ / voice</summary><p>Đối chiếu được {proposal.diagnostics.drift.comparedWords}/{proposal.diagnostics.drift.scopeWords} từ trên timing đầu vào. {proposal.diagnostics.drift.largeCount} từ nghi lệch từ 250 ms, {proposal.diagnostics.drift.severeCount} từ từ 500 ms. Đây là dấu hiệu để nghe lại, CTC có thể sai.</p></details> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div>}
  </ModuleFrame>;
}
