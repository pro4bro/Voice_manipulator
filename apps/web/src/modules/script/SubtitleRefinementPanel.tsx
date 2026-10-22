import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { api } from "../../api/client";
import { SUBTITLE_ALIGNMENT_METHODS, type SubtitleAlignmentProposal, type SubtitleRefinementMethod } from "../../domain/subtitle-alignment";
import type { ProjectMediaAsset } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { SubtitleAlignmentControl } from "./SubtitleAlignmentDialog";
import { useSubtitleTimingPreview } from "./SubtitleTimingPreview";

const order: SubtitleRefinementMethod["mode"][] = ["diagnose", "auto", "common-offset", "edge-offset", "group-offset", "ctc", "waveform", "offset"];
const sourceKey = (asset: ProjectMediaAsset) => JSON.stringify([asset.id, asset.words, asset.text, asset.duration, asset.removedRanges, asset.sourcePath]);
const message = (error: unknown) => error instanceof Error ? error.message : "Không thể tinh chỉnh subtitle.";

export function SubtitleRefinementPanel({ projectId, assets, selection, prepare, onApplied }: ComponentProps<typeof SubtitleAlignmentControl>) {
  const timing = useSubtitleTimingPreview();
  const choices = useMemo(() => assets.filter((asset) => asset.transcriptionStatus === "complete" && asset.words?.length && !asset.disabled && !asset.deletedAt), [assets]);
  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState(choices[0]?.id ?? "");
  const asset = choices.find((item) => item.id === assetId);
  const [enabled, setEnabled] = useState<SubtitleRefinementMethod["mode"][]>(["offset"]);
  const [settings, setSettings] = useState<Record<string, SubtitleRefinementMethod>>(() => Object.fromEntries(order.map((mode) => [mode, { mode, strength: 100, maxMoveMs: 2000, startOffsetMs: 0, endOffsetMs: 0 }])));
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [proposal, setProposal] = useState<SubtitleAlignmentProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const acceptedKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const inputKey = asset ? sourceKey(asset) : "";
  const latestKey = useRef(inputKey); latestKey.current = inputKey;
  const selectionMatches = selection?.scope?.kind === "asset" && selection.scope.id === assetId && selection.scope.revision === asset?.updatedAt && selection.indexes.length > 0;
  const scopeKey = selectedOnly ? JSON.stringify([selection?.scope, selection?.indexes]) : "whole";
  const indexes = selectedOnly && selectionMatches ? selection!.indexes : undefined;
  const plan = order.filter((mode) => enabled.includes(mode)).map((mode) => settings[mode]);
  const validSettings = plan.every((method) => Object.values(method).every((value) => typeof value !== "number" || Number.isFinite(value)) &&
    method.strength >= 0 && method.strength <= 100 && method.maxMoveMs >= 0 && method.maxMoveMs <= 2000 &&
    Math.abs(method.startOffsetMs) <= 2000 && Math.abs(method.endOffsetMs) <= 2000);
  const changed = proposal?.rows.filter((row) => row.status !== "locked" && (row.before.start !== row.after.start || row.before.end !== row.after.end)).length ?? 0;
  const setPreview = timing?.setPreview;

  useEffect(() => {
    if (!choices.some((item) => item.id === assetId)) setAssetId(choices[0]?.id ?? "");
  }, [choices, assetId]);
  useEffect(() => {
    if (acceptedKey.current === inputKey) { acceptedKey.current = null; return; }
    generation.current++; setProposal(null); setPreview?.(null);
  }, [inputKey, setPreview]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; setPreview?.(null); };
  }, [setPreview]);
  useEffect(() => {
    generation.current++; setPreview?.(null);
    setProposal((current) => current?.state === "applied" ? current : null);
  }, [scopeKey, setPreview]);

  function invalidate() { generation.current++; setPreview?.(null); setNotice(null); setProposal((current) => current?.state === "applied" ? current : null); }
  function parameter(mode: string, field: keyof Omit<SubtitleRefinementMethod, "mode">, raw: string) {
    invalidate(); setSettings((current) => ({ ...current, [mode]: { ...current[mode], [field]: raw.trim() ? Number(raw) : NaN } }));
  }
  async function preview() {
    if (!asset || busy || !setPreview || !plan.length || !validSettings || (selectedOnly && !selectionMatches)) return;
    const version = ++generation.current, target = asset, key = inputKey;
    setBusy(true); setNotice(null); setPreview(null);
    try {
      await prepare(target.id);
      const value = await api.previewSubtitleTiming(projectId, target.id, plan, indexes);
      if (mounted.current && version === generation.current && latestKey.current === key) {
        setProposal(value);
        if (value.stale) { setNotice("Nguồn đã đổi. Bấm Ghost Preview để tính lại."); return; }
        setPreview({ assetId: target.id, sourceWordsKey: JSON.stringify(target.words), rows: value.rows, conflictIndexes: value.diagnostics.conflictIndexes ?? [] });
        setNotice(value.aligner.status === "unavailable" || value.aligner.status === "failed" ? value.aligner.reason ?? "Chưa có mốc âm học cho các cách tự động." : "Ghost đang hiện trên Timeline. Phát audio và chỉnh thông số để so sánh.");
      }
    } catch (error) { if (mounted.current && version === generation.current) setNotice(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function apply(restore = false) {
    if (!asset || !proposal || busy) return;
    setBusy(true); setNotice(null);
    const version = ++generation.current;
    try {
      await prepare(asset.id);
      const result = restore ? await api.restoreSubtitleAlignment(projectId, asset.id, proposal.id)
        : await api.applySubtitleTimingPreview(projectId, asset.id, proposal.id);
      acceptedKey.current = sourceKey(result.asset);
      onApplied(result.asset);
      if (mounted.current && version === generation.current) {
        setPreview?.(null); setProposal(result.proposal);
        setNotice(restore ? "Đã khôi phục timing trước lần Apply." : `Đã áp dụng ${changed} từ thay đổi. Từ xung đột vẫn được đánh dấu đỏ trên Timeline.`);
      }
    } catch (error) { if (mounted.current) setNotice(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <ModuleFrame title="Tinh chỉnh subtitle" className="subtitle-refinement-module">
    <button type="button" disabled={!choices.length} onClick={() => {
      if (open) invalidate();
      setOpen(!open);
      if (!open && asset) {
        const key = inputKey, version = ++generation.current;
        void api.getSubtitleAlignment(projectId, asset.id).then((value) => {
          if (mounted.current && version === generation.current && latestKey.current === key && value?.mode === "pipeline" && value.state === "applied") setProposal(value);
        }).catch((error) => { if (mounted.current && version === generation.current) setNotice(message(error)); });
      }
    }}>Căn chỉnh subtitle</button>
    {!choices.length ? <small>Chọn track đã STT để căn chỉnh.</small> : null}
    {open ? <div className="subtitle-refinement-settings">
      <label>Track<select aria-label="Track tinh chỉnh" disabled={busy} value={assetId} onChange={(event) => { invalidate(); setAssetId(event.target.value); }}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <small>Bật các cách muốn thử. Chúng chạy theo thứ tự dưới đây; offset thủ công chạy cuối. Mốc chỉnh tay được giữ.</small>
      <label><input type="checkbox" checked={selectedOnly} disabled={!selectionMatches || busy} onChange={(event) => { invalidate(); setSelectedOnly(event.target.checked); }} />Chỉ các từ đang chọn</label>
      <div className="subtitle-refinement-methods">{order.map((mode) => {
        const method = SUBTITLE_ALIGNMENT_METHODS.find((item) => item.id === mode)!;
        const active = enabled.includes(mode), values = settings[mode];
        const input = (field: keyof Omit<SubtitleRefinementMethod, "mode">, label: string, min: number, max: number) => <label>{label}<input type="number" aria-label={`${method.label}: ${label}`} value={Number.isFinite(values[field]) ? values[field] : ""} min={min} max={max} disabled={busy} onChange={(event) => parameter(mode, field, event.target.value)} /></label>;
        return <section key={mode} className="subtitle-refinement-choice">
          <label><input type="checkbox" checked={active} disabled={busy} onChange={(event) => { invalidate(); setEnabled((current) => event.target.checked ? [...current, mode] : current.filter((value) => value !== mode)); }} />{method.label}</label>
          {active ? <details open><summary>Thông số</summary><p>{mode === "offset" ? "Số dương dịch muộn hơn, số âm dịch sớm hơn. Bấm Ghost Preview để so với waveform; Apply New Timing mới ghi timing." : method.description}</p><div className="subtitle-refinement-parameters">
            {mode === "offset" ? <>{input("startOffsetMs", "Offset IN (ms)", -2000, 2000)}{input("endOffsetMs", "Offset OUT (ms)", -2000, 2000)}</> : null}
            {mode !== "diagnose" ? <>{input("strength", "Mức áp dụng (%)", 0, 100)}{input("maxMoveMs", "Dịch tối đa (ms)", 0, 2000)}</> : null}
          </div></details> : null}
        </section>;
      })}</div>
      <div className="subtitle-refinement-actions"><button type="button" disabled={busy || !timing || !plan.length || !validSettings || (selectedOnly && !selectionMatches)} onClick={() => void preview()}>{busy ? "Đang tính…" : "Ghost Preview"}</button>
        <button type="button" disabled={busy || !timing?.preview || proposal?.state !== "proposed" || proposal.stale || !changed || (selectedOnly && !selectionMatches)} onClick={() => void apply()}>Apply New Timing</button>
        {proposal?.state === "applied" ? <button type="button" disabled={busy || proposal.stale} onClick={() => void apply(true)}>Khôi phục timing</button> : null}
      </div>
      <small>Ghost mờ nằm phía trên subtitle gốc; đỏ là xung đột. Dùng nút Phát của Timeline để nghe và so với waveform.</small>
      {proposal ? <p role="status">{changed} từ thay đổi · {proposal.summary.locked} từ khóa{proposal.diagnostics.conflictIndexes?.length ? <strong className="subtitle-refinement-conflicts"> · {proposal.diagnostics.conflictIndexes.length} từ xung đột timing</strong> : null}</p> : null}
      {proposal?.diagnostics.drift ? <details><summary>Kiểm tra độ lệch chữ / voice</summary><p>Đối chiếu được {proposal.diagnostics.drift.comparedWords}/{proposal.diagnostics.drift.scopeWords} từ trên timing đầu vào. {proposal.diagnostics.drift.largeCount} từ nghi lệch từ 250 ms, {proposal.diagnostics.drift.severeCount} từ từ 500 ms. Đây là dấu hiệu để nghe lại, CTC có thể sai.</p></details> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div> : null}
  </ModuleFrame>;
}
