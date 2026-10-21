import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import { SUBTITLE_ALIGNMENT_METHODS, type SubtitleAlignmentMode } from "../../domain/subtitle-alignment";
import { SubtitleDriftReport } from "./SubtitleDriftReport";
import type { SubtitleAlignmentEdit, SubtitleAlignmentProposal, SubtitleAlignmentRow } from "../../domain/subtitle-alignment";
import type { ProjectMediaAsset } from "../../domain/types";
import type { WordSelection } from "../../domain/word-selection";
import { subtitleAudioUrl } from "../../domain/subtitle-alignment";
import "./SubtitleAlignmentDialog.css";

interface WavePoint { min: number; max: number }
interface WaveLandmark { time: number; kind: "onset" | "offset" }
interface EditableRow extends SubtitleAlignmentRow { start: string; end: string; checked: boolean; heard: boolean }
interface Props {
  triggerLabel?: string;
  projectId: string;
  assets: ProjectMediaAsset[];
  selection?: WordSelection;
  prepare: (assetId: string) => Promise<void>;
  onApplied: (asset: ProjectMediaAsset) => void;
}

function signature(asset: ProjectMediaAsset): string {
  return JSON.stringify({ id: asset.id, text: asset.text, words: asset.words, duration: asset.duration, sampleRate: asset.sampleRate,
    sourceContentHash: asset.sourceContentHash ?? null, analysisPath: asset.analysisPath ?? null, wordTimingTrustVersion: asset.wordTimingTrustVersion ?? null,
    cuts: asset.cutPoints ?? [], removed: asset.removedRanges ?? [], working: asset.workingRange ?? null });
}
function eligible(asset: ProjectMediaAsset): boolean {
  return asset.transcriptionStatus === "complete" && asset.words.length > 0 && !asset.deletedAt && !asset.disabled && !asset.growingMkvFollow;
}
function shownBounds(row: SubtitleAlignmentRow) { return row.after.start !== null && row.after.end !== null ? row.after : row.before; }

export function SubtitleAlignmentControl({ projectId, assets, selection, prepare, onApplied, triggerLabel = "Căn chỉnh subtitle" }: Props) {
  const choices = useMemo(() => assets.filter(eligible), [assets]);
  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState(choices[0]?.id ?? "");
  const asset = choices.find((item) => item.id === assetId);
  const [mode, setMode] = useState<SubtitleAlignmentMode>("auto");
  const [startOffset, setStartOffset] = useState("0");
  const [endOffset, setEndOffset] = useState("0");
  const [scope, setScope] = useState<"whole" | "selected">("whole");
  const [proposal, setProposal] = useState<SubtitleAlignmentProposal | null>(null);
  const [proposalSignature, setProposalSignature] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [wave, setWave] = useState<WavePoint[]>([]);
  const [waveRange, setWaveRange] = useState<[number, number] | null>(null);
  const [waveError, setWaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const serial = useRef(0);
  const waveformSerial = useRef(0);
  const audioStopTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioGeneration = useRef(0);
  const playingAudio = useRef<HTMLAudioElement | null>(null);
  const mounted = useRef(true);
  const mutation = useRef(false);
  const currentSignature = asset ? signature(asset) : "";
  const latestAsset = useRef(asset); latestAsset.current = asset;
  const latestSignature = useRef(currentSignature); latestSignature.current = currentSignature;
  const latestOnApplied = useRef(onApplied); latestOnApplied.current = onApplied;
  const selectedIndexes = selection?.indexes ?? [];
  const selectionMatches = Boolean(asset && selectedIndexes.length && selection?.scope?.kind === "asset" && selection.scope.id === asset.id);
  const offsetInputsValid = mode !== "offset" || (startOffset.trim() !== "" && endOffset.trim() !== "" && Number.isFinite(Number(startOffset)) && Number.isFinite(Number(endOffset)));
  const stale = Boolean(proposal && (proposal.stale || proposalSignature !== currentSignature));
  const focusedRow = rows.find((row) => row.index === focusedIndex) ?? rows[0];
  const readOnly = proposal?.mode === "diagnose";
  const drift = proposal?.diagnostics.drift;
  const focusedEvidence = drift?.suspects.find((row) => row.index === focusedRow?.index);
  const applyable = rows.filter((row) => row.checked && row.status !== "locked");
  const selectedForApply = applyable.map((row) => row.index);

  const stopAudio = useCallback(() => { audioGeneration.current += 1; if (audioStopTimer.current) clearInterval(audioStopTimer.current); audioStopTimer.current = null; const audio = playingAudio.current ?? audioRef.current; if (audio) { audio.pause(); audio.currentTime = 0; } playingAudio.current = null; }, []);
  const invalidate = useCallback(() => { serial.current += 1; waveformSerial.current += 1; stopAudio(); setWave([]); }, [stopAudio]);

  useEffect(() => {
    if (!choices.some((item) => item.id === assetId)) setAssetId(choices[0]?.id ?? "");
  }, [choices, assetId]);
  useEffect(() => {
    if (!open) return;
    const version = ++serial.current;
    const node = dialogRef.current;
    const close = dialogRef.current?.querySelector<HTMLElement>("[data-close]"); close?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    setError(null); setNotice(null); setProposal(null); setRows([]); setFocusedIndex(null);
    const target = latestAsset.current;
    if (target) void api.getSubtitleAlignment(projectId, target.id).then((value) => {
      if (serial.current !== version || !latestAsset.current || latestSignature.current !== signature(target)) return;
      if (value) { setMode(value.mode); setStartOffset(String(value.startOffsetMs)); setEndOffset(String(value.endOffsetMs)); setProposal(value); setProposalSignature(signature(target)); setRows(value.rows.map((row) => ({ ...row, start: String(shownBounds(row).start ?? ""), end: String(shownBounds(row).end ?? ""), checked: row.status === "ready", heard: false }))); setFocusedIndex(value.rows[0]?.index ?? null); }
    }).catch((reason) => { if (serial.current === version) setError(errorText(reason)); });
    return () => { document.removeEventListener("keydown", keydown); serial.current += 1; stopAudio(); };
    // Opening initializes the latest persisted proposal for the selected asset.
  }, [open, projectId, assetId]);
  useEffect(() => {
    const source = latestAsset.current;
    if (!open || !source || !focusedRow || !proposal) { setWave([]); setWaveRange(null); return; }
    const version = ++waveformSerial.current;
    const afterBounds = rowAfterBounds(focusedRow);
    const bounds = [focusedRow.before.start, focusedRow.before.end, afterBounds.start, afterBounds.end].filter((value): value is number => value !== null);
    const duration = source.duration;
    const lower = Math.max(0, Math.min(...bounds) - .2), upper = Math.min(duration, Math.max(...bounds) + .2);
    if (bounds.length < 2 || upper <= lower) { setWave([]); setWaveRange(null); return; }
    setWaveError(null); setWave([]);
    setWaveRange([lower, upper]);
    const endpoint = `${subtitleAudioUrl(projectId, source.id).replace(/audio$/, "waveform")}?start=${lower}&end=${upper}&points=800`;
    void fetch(endpoint).then(async (response) => {
      if (!response.ok) throw new Error(`Waveform HTTP ${response.status}`);
      return response.json() as Promise<{ points: WavePoint[] }>;
    }).then((value) => { if (waveformSerial.current === version && Array.isArray(value.points)) setWave(value.points); })
      .catch((reason) => { if (waveformSerial.current === version) setWaveError(errorText(reason)); });
    return () => { waveformSerial.current += 1; };
  }, [open, projectId, assetId, currentSignature, focusedIndex, proposal?.id, focusedRow?.before.start, focusedRow?.before.end, focusedRow?.after.start, focusedRow?.after.end, focusedRow?.start, focusedRow?.end]);
  useEffect(() => {
    if (stale && proposal) { setRows((current) => current.map((row) => ({ ...row, checked: false, heard: false }))); setScope("whole"); stopAudio(); }
  }, [stale, proposal, stopAudio]);
  useEffect(() => {
    if (!open) { stopAudio(); triggerRef.current?.focus(); }
  }, [open, stopAudio]);
  useEffect(() => () => { waveformSerial.current += 1; stopAudio(); }, [stopAudio]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { stopAudio(); }, [assetId, focusedIndex, stopAudio]);

  function close() { setOpen(false); }
  function clearProposal() { invalidate(); setProposal(null); setRows([]); setNotice(null); setError(null); }
  function chooseAsset(id: string) { invalidate(); setAssetId(id); setProposal(null); setRows([]); setFocusedIndex(null); setScope("whole"); setError(null); }
  function setRow(index: number, patch: Partial<EditableRow>) { setRows((current) => current.map((row) => row.index === index ? { ...row, ...patch } : row)); }
  function parseEdits(): SubtitleAlignmentEdit[] | null {
    const edits: SubtitleAlignmentEdit[] = [];
    for (const row of applyable) {
      const start = Number(row.start), end = Number(row.end);
      if (!row.start.trim() || !row.end.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !asset || end > asset.duration) return null;
      if (needsHeardConfirmation(row) && !row.heard) return null;
      if (row.status === "review" || row.status === "unchanged") {
        if (!row.heard) return null;
        edits.push({ index: row.index, start, end, reviewed: true });
      } else if (row.status === "ready" && (start !== row.after.start || end !== row.after.end)) edits.push({ index: row.index, start, end, reviewed: true });
    }
    return edits;
  }
  const edits = parseEdits();
  const validApply = Boolean(asset && !readOnly && proposal?.state === "proposed" && !stale && !proposal.stale && selectedForApply.length && edits && !busy);

  async function analyze() {
    if (!asset || busy || mutation.current || (scope === "selected" && !selectionMatches)) return;
    const target = asset, signatureAtStart = signature(target), selected = scope === "selected" ? selectedIndexes : undefined;
    const version = ++serial.current; mutation.current = true; setBusy(true); setError(null); setNotice(null); stopAudio();
    try {
      await prepare(target.id);
      const value = await api.analyzeSubtitleAlignment(projectId, target.id, { mode, startOffsetMs: finiteOrZero(startOffset), endOffsetMs: finiteOrZero(endOffset), ...(selected ? { indexes: [...selected] } : {}) });
      if (serial.current === version && latestAsset.current && signature(latestAsset.current) === signatureAtStart) {
        setProposal(value); setProposalSignature(signatureAtStart); setRows(value.rows.map((row) => ({ ...row, start: String(shownBounds(row).start ?? ""), end: String(shownBounds(row).end ?? ""), checked: row.status === "ready", heard: false }))); setFocusedIndex(value.rows[0]?.index ?? null);
        if (value.aligner.status === "unavailable" || value.aligner.status === "failed") setNotice(value.aligner.reason ?? alignerLabel(value.aligner.status));
      }
    } catch (reason) { if (serial.current === version) setError(errorText(reason)); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function apply() {
    if (!asset || !proposal || proposal.state !== "proposed" || !validApply || !edits || mutation.current) return;
    const targetId = asset.id, targetProposal = proposal, indexes = selectedForApply, changes = edits;
    const version = ++serial.current; mutation.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await prepare(targetId);
      const result = await api.applySubtitleAlignment(projectId, targetId, targetProposal.id, indexes, changes);
      latestOnApplied.current(result.asset);
      if (serial.current === version) { setProposal(result.proposal); setProposalSignature(signature(result.asset)); setRows(result.proposal.rows.map((row) => ({ ...row, start: String(shownBounds(row).start ?? ""), end: String(shownBounds(row).end ?? ""), checked: false, heard: false }))); setNotice("Đã áp dụng căn chỉnh. Có thể khôi phục từ bản đã lưu."); }
    } catch (reason) { if (serial.current === version) setError(errorText(reason)); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function restore() {
    if (!asset || !proposal || proposal.state !== "applied" || busy || mutation.current) return;
    const targetId = asset.id, targetProposal = proposal; const version = ++serial.current;
    mutation.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await prepare(targetId);
      const result = await api.restoreSubtitleAlignment(projectId, targetId, targetProposal.id);
      latestOnApplied.current(result.asset);
      if (serial.current === version) { setProposal(result.proposal); setProposalSignature(signature(result.asset)); setRows(result.proposal.rows.map((row) => ({ ...row, start: String(shownBounds(row).start ?? ""), end: String(shownBounds(row).end ?? ""), checked: false, heard: false }))); setNotice("Đã khôi phục bản Script trước căn chỉnh."); }
    } catch (reason) { if (serial.current === version) setError(errorText(reason)); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  function audition(which: "before" | "after" | "ctc") {
    const row = focusedRow, audio = audioRef.current;
    if (!asset || !row || !audio) return;
    const bounds = which === "before" ? row.before : which === "ctc" ? { start: focusedEvidence?.ctcStart ?? null, end: focusedEvidence?.ctcEnd ?? null } : rowAfterBounds(row);
    if (bounds.start === null || bounds.end === null || bounds.end <= bounds.start) return;
    stopAudio(); audio.src = subtitleAudioUrl(projectId, asset.id); audio.dataset.stopAt = String(Math.min(asset.duration, bounds.end + .2)); audio.currentTime = Math.max(0, bounds.start - .2);
    const generation = audioGeneration.current;
    playingAudio.current = audio;
    void audio.play().then(() => { if (generation !== audioGeneration.current) return; audioStopTimer.current = setInterval(() => { if (audio.currentTime >= Number(audio.dataset.stopAt)) stopAudio(); }, 25); }).catch((reason) => { if (generation === audioGeneration.current) setError(errorText(reason)); });
  }

  return <>
    <button ref={triggerRef} className="subtitle-alignment-trigger" type="button" disabled={!choices.length} onClick={() => setOpen(true)}>{triggerLabel}</button>
    {open ? createPortal(<div className="subtitle-alignment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} className="subtitle-alignment-dialog" role="dialog" aria-modal="true" aria-labelledby="subtitle-alignment-title">
        <header><div><h2 id="subtitle-alignment-title">Căn chỉnh subtitle</h2><p>So sánh mốc từ với âm thanh gốc. Từ thủ công vẫn khóa; bản gốc không bị thay đổi.</p></div><button data-close type="button" aria-label="Đóng căn chỉnh subtitle" onClick={close}>×</button></header>
        <div className="subtitle-alignment-content">
        <div className="subtitle-alignment-controls">
          <label>Track<select aria-label="Track căn chỉnh" value={assetId} onChange={(event) => chooseAsset(event.target.value)}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <fieldset><legend>Phạm vi</legend><label><input type="radio" checked={scope === "whole"} onChange={() => { clearProposal(); setScope("whole"); }} />Toàn track</label><label><input type="radio" checked={scope === "selected"} disabled={!selectionMatches || busy} onChange={() => { clearProposal(); setScope("selected"); }} />Từ đang chọn ({selectionMatches ? selectedIndexes.length : 0})</label></fieldset>
          <label className="subtitle-refinement-method">Phương pháp tinh chỉnh<select aria-label="Phương pháp tinh chỉnh" value={mode} disabled={busy} onChange={(event) => { clearProposal(); setMode(event.target.value as SubtitleAlignmentMode); }}>{SUBTITLE_ALIGNMENT_METHODS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label>Offset IN (ms)<input type="number" step="1" value={startOffset} disabled={busy || mode !== "offset"} onChange={(event) => { clearProposal(); setStartOffset(event.target.value); }} /></label>
          <label>Offset OUT (ms)<input type="number" step="1" value={endOffset} disabled={busy || mode !== "offset"} onChange={(event) => { clearProposal(); setEndOffset(event.target.value); }} /></label>
          <button type="button" disabled={!asset || busy || !offsetInputsValid || (scope === "selected" && !selectionMatches)} onClick={() => void analyze()}>{busy ? "Đang xử lý…" : mode === "diagnose" ? "Kiểm tra độ lệch" : "Tạo đề xuất"}</button>
        </div>
        <p className="subtitle-refinement-description">{SUBTITLE_ALIGNMENT_METHODS.find((item) => item.id === mode)?.description}</p>
        {drift ? <SubtitleDriftReport report={drift} onInspect={setFocusedIndex} /> : null}
        {scope === "selected" && !selectionMatches ? <p className="subtitle-alignment-warning" role="alert">Phạm vi chọn đã hết hiệu lực vì track không còn khớp.</p> : null}
        {stale ? <p className="subtitle-alignment-warning" role="alert">Script, text hoặc điểm cắt đã đổi. Đề xuất cũ đã bị khóa; hãy tạo đề xuất mới.</p> : null}
        {proposal && (proposal.aligner.status === "unavailable" || proposal.aligner.status === "failed") ? <p className="subtitle-alignment-warning" role="status">{proposal.aligner.reason ?? alignerLabel(proposal.aligner.status)}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert">{error}</p> : null}
        {proposal ? <><div className="subtitle-alignment-summary" role="status">Phương pháp: {SUBTITLE_ALIGNMENT_METHODS.find((item) => item.id === proposal.mode)?.label} · Đề xuất: {proposal.summary.ready} sẵn sàng · {proposal.summary.review} cần nghe lại · {proposal.summary.locked} khóa · {proposal.summary.unchanged} không đổi. Bộ căn chỉnh: {alignerLabel(proposal.aligner.status)}{proposal.aligner.model ? ` · ${proposal.aligner.model}` : ""}{proposal.aligner.license ? ` · ${proposal.aligner.license}` : ""}</div><div className="subtitle-alignment-workspace">
          <section className="subtitle-alignment-list" aria-label="Các từ trong đề xuất">
            <table><thead><tr><th><span className="sr-only">Áp dụng</span></th><th>Từ</th><th>Trạng thái</th><th>IN / OUT (s)</th></tr></thead><tbody>{rows.map((row) => <tr key={row.index} className={focusedIndex === row.index ? "is-focused" : ""}>
              <td><input type="checkbox" aria-label={`Chọn từ ${row.text} ${row.index + 1}`} checked={row.checked} disabled={readOnly || busy || stale || proposal.stale || proposal.state !== "proposed" || row.status === "locked" || (needsHeardConfirmation(row) && !row.heard)} onChange={(event) => { setRow(row.index, { checked: event.target.checked }); setFocusedIndex(row.index); }} /></td>
              <td><button className="subtitle-alignment-word" type="button" onClick={() => setFocusedIndex(row.index)}>{row.text}<small>#{row.index + 1}</small></button></td>
              <td>{statusLabel(row.status)}</td>
              <td>{row.status === "locked" ? <>{formatTime(row.before.start)} / {formatTime(row.before.end)}<small className="subtitle-alignment-time-note">Trước · khóa</small></> : <div className="subtitle-alignment-times"><label>IN <small>{formatTime(row.before.start)} →</small><input aria-label={`IN từ ${row.index + 1}`} inputMode="decimal" value={row.start} disabled={readOnly || busy || stale || proposal.state !== "proposed"} onChange={(event) => setRow(row.index, { start: event.target.value, checked: false, heard: false })} /></label><label>OUT <small>{formatTime(row.before.end)} →</small><input aria-label={`OUT từ ${row.index + 1}`} inputMode="decimal" value={row.end} disabled={readOnly || busy || stale || proposal.state !== "proposed"} onChange={(event) => setRow(row.index, { end: event.target.value, checked: false, heard: false })} /></label></div>}</td>
            </tr>)}</tbody></table>
          </section>
          <aside className="subtitle-alignment-detail"><h3>{focusedRow?.text ?? "Chi tiết từ"}</h3><p>{focusedRow ? methodLabel(focusedRow.method) : ""} · {focusedRow?.score === null || focusedRow?.score === undefined ? "Không có điểm" : `Điểm ${focusedRow.score.toFixed(2)}`}</p>
            {focusedRow?.reasons.length ? <ul>{focusedRow.reasons.map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul> : null}
            {proposalOffsetSuggestion(proposal) ? <p className="subtitle-alignment-offset-suggestion" role="note">{proposalOffsetSuggestion(proposal)}</p> : null}
            {measuredCommonOffset(proposal) !== null ? <button type="button" disabled={busy} onClick={() => {
              const offset = measuredCommonOffset(proposal); if (offset === null) return;
              invalidate(); setMode("offset"); setStartOffset(String(offset)); setEndOffset(String(offset)); setProposal(null); setRows([]);
              setNotice("Đã điền offset chung từ CTC. Bấm Tạo đề xuất, nghe trước/sau và duyệt; từng đoạn có thể cần offset khác.");
            }}>Thử offset chung {signedMs(measuredCommonOffset(proposal)! / 1000)} ms</button> : null}
            <p className="subtitle-alignment-wave-legend"><span>Nét đứt: trước</span><span>Nét liền: đề xuất</span><span>Chấm: mốc âm tăng/giảm rõ</span></p><Waveform points={wave} range={waveRange} landmarks={readLandmarks(proposal.diagnostics.waveform_landmarks)} label="Dạng sóng với biên trước và đề xuất" before={focusedRow?.before} after={focusedRow ? rowAfterBounds(focusedRow) : undefined} />{waveError ? <p role="status">Không tải được dạng sóng: {waveError}</p> : null}
            <div className="subtitle-alignment-audition"><button type="button" disabled={!focusedRow || focusedRow.before.start === null} onClick={() => audition("before")}>Nghe trước</button><button type="button" disabled={!focusedRow || focusedRow.after.start === null} onClick={() => audition("after")}>Nghe đề xuất</button></div>
            {focusedEvidence?.ctcStart != null ? <><p>Mốc đối chiếu CTC: {formatTime(focusedEvidence.ctcStart)} → {formatTime(focusedEvidence.ctcEnd)} s.</p><button type="button" onClick={() => audition("ctc")}>Nghe mốc đối chiếu CTC</button></> : null}
            {!readOnly && focusedRow && needsHeardConfirmation(focusedRow) ? <button type="button" className="subtitle-alignment-confirm" disabled={busy || stale || proposal.state !== "proposed" || !validBounds(focusedRow, asset?.duration)} onClick={() => setRow(focusedRow.index, { heard: true, checked: true })}>{focusedRow.heard ? "Đã xác nhận bằng tai" : "Tôi đã nghe và xác nhận mốc"}</button> : null}
            {focusedRow?.status === "locked" ? <p>Từ manual không thể thay đổi.</p> : null}
          </aside>
        </div></> : null}
        </div>
        <footer>{readOnly ? <span>Kiểm tra chỉ đọc · chọn phương pháp khác để tạo đề xuất chỉnh sửa.</span> : null}{proposal?.state === "applied" ? <button type="button" disabled={busy || stale} onClick={() => void restore()}>Khôi phục bản đã áp dụng</button> : null}<button type="button" disabled={!validApply} onClick={() => void apply()}>Áp dụng {selectedForApply.length} từ đã chọn</button><button type="button" onClick={close}>Đóng</button></footer>
        <audio ref={audioRef} className="subtitle-alignment-audio" preload="none" onTimeUpdate={(event) => { const audio = event.currentTarget; if (audio.currentTime >= Number(audio.dataset.stopAt)) stopAudio(); }} onEnded={stopAudio} />
      </div>
    </div>, document.body) : null}
  </>;
}

function validBounds(row: EditableRow, duration = Number.POSITIVE_INFINITY) { const start = Number(row.start), end = Number(row.end); return row.start.trim() !== "" && row.end.trim() !== "" && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration; }
function rowAfterBounds(row: EditableRow) { return validBounds(row) ? { start: Number(row.start), end: Number(row.end) } : { start: null, end: null }; }
function needsHeardConfirmation(row: EditableRow) {
  if (row.status === "review" || row.status === "unchanged") return true;
  if (row.status !== "ready" || !row.start.trim() || !row.end.trim()) return false;
  return Number(row.start) !== row.after.start || Number(row.end) !== row.after.end;
}
function statusLabel(status: SubtitleAlignmentRow["status"]) { return ({ ready: "Sẵn sàng · cần kiểm tra", review: "Cần nghe lại", locked: "Khóa · thủ công", unchanged: "Không đổi · xác nhận nếu áp dụng" })[status]; }
function methodLabel(method: string) { return ({ "waveform-vector": "Căn theo waveform vector · cần xác nhận", diagnostic: "Đối chiếu chỉ đọc", "measured-common-offset": "Offset chung đo từ CTC", "measured-edge-offset": "Offset IN/OUT đo riêng", ctc: "Đề xuất từ bộ căn CTC", "explicit-offset": "Bù offset đã nhập", "automatic-offset": "Bù offset theo cụm mốc đồng thuận", manual: "Mốc thủ công", source: "Giữ mốc nguồn", scope: "Ngoài phạm vi chọn" } as Record<string, string>)[method] ?? "Đề xuất căn chỉnh"; }
function reasonLabel(reason: string) { return ({ "waveform-vector-review": "Biên đề xuất từ điểm sóng tăng/giảm rõ; cần nghe xác nhận.", "waveform-word-identity-unverified": "Chưa có mốc CTC xác nhận từ; sóng chưa chứng minh biên từ.", "waveform-no-clear-boundary": "Không tìm được cặp biên sóng rõ và hợp lệ gần từ.", "no-stable-offset-group": "Chưa có nhóm offset đủ ổn định.", "measured-offset-preview": "Offset được ước lượng từ mốc CTC; cần nghe kiểm tra.", "insufficient-offset-anchors": "Chưa có đủ ba mốc CTC để ước lượng offset.", "read-only-diagnosis": "Chỉ kiểm tra, chưa đề xuất thay đổi.", "stable-group-translation": "Dịch cả cụm theo offset ổn định, giữ độ dài từng từ.", "manual-timing-locked": "Mốc từ đã được chỉnh thủ công và được khóa.", "outside-selected-scope": "Từ nằm ngoài phạm vi đã chọn.", "invalid-source-interval": "Mốc nguồn chưa hợp lệ.", "user-specified-offset-seconds": "Dùng offset IN/OUT đã nhập.", "offset-would-break-source-or-duration-bounds": "Offset vượt khỏi thời lượng nguồn.", "local-ctc-unavailable": "Không có mô hình căn CTC trên máy.", "invalid-ctc-interval": "Mốc CTC không hợp lệ.", "existing-source-overlap": "Mốc nguồn đang chồng lấn từ khác.", "ctc-confidence-uncertain": "Điểm tin cậy CTC còn thấp.", "ctc-offset-not-corroborated": "Offset CTC chưa được các mốc lân cận xác nhận.", "ctc-move-large": "Mốc CTC dịch chuyển quá xa.", "duration-outlier": "Thời lượng từ khác thường; cần nghe lại.", "speaking-rate-outlier": "Nhịp nói tại từ này khác các từ lân cận.", "ctc-measured-and-offset-corroborated": "Mốc CTC được nhóm mốc lân cận xác nhận.", "waveform-activity-uncorroborated": "Dạng sóng chưa xác nhận hoạt động gần cả hai biên.", "whole-output-interval-conflict": "Mốc này chồng lấn khi xét toàn track." } as Record<string, string>)[reason] ?? "Cần kiểm tra mốc này."; }
function alignerLabel(status: string) { return ({ available: "Mô hình đã sẵn sàng", complete: "Đã tạo đề xuất từ mô hình", unavailable: "Chưa có mô hình căn trên máy", failed: "Mô hình căn gặp lỗi", "not-used": "Không dùng mô hình (offset thủ công)" } as Record<string, string>)[status] ?? `Trạng thái mô hình: ${status}`; }
function finiteOrZero(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatTime(value: number | null) { return value === null ? "—" : value.toFixed(3); }
function errorText(reason: unknown) { const message = reason instanceof Error ? reason.message : String(reason); return /model|aligner|checkpoint/i.test(message) ? `Bộ căn chỉnh chưa sẵn sàng: ${message}` : message; }
function proposalOffsetSuggestion(proposal: SubtitleAlignmentProposal) {
  const group = proposal.diagnostics.local_offset_group as Record<string, unknown> | undefined;
  if (!group || proposal.diagnostics.ctc_offsets_stable !== true || Number(group.anchor_count) < 3) return null;
  const values = [group.median_start_offset, group.start_offset_mad, group.median_end_offset, group.end_offset_mad].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [start, startMad, end, endMad] = values;
  return `Gợi ý đo từ ${Number(group.anchor_count)} mốc CTC · IN ${signedMs(start)} ms (MAD ${Math.round(startMad * 1000)} ms) · OUT ${signedMs(end)} ms (MAD ${Math.round(endMad * 1000)} ms). Ước lượng toàn track; độ ổn định của từng đoạn có thể khác. Cần nghe kiểm tra.`;
}
function signedMs(seconds: number) { const ms = Math.round(seconds * 1000); return `${ms > 0 ? "+" : ""}${ms}`; }
function Waveform({ points, range, landmarks, label, before, after }: { landmarks: WaveLandmark[]; points: WavePoint[]; range: [number, number] | null; label: string; before?: SubtitleAlignmentRow["before"]; after?: SubtitleAlignmentRow["after"] }) {
  const start = range?.[0] ?? 0, end = range?.[1] ?? 1;
  const x = (value: number | null | undefined) => value === null || value === undefined || end <= start ? null : ((value - start) / (end - start)) * points.length;
  return <div className="subtitle-alignment-waveform" role="img" aria-label={label}>{points.length ? <svg viewBox={`0 0 ${points.length} 48`} preserveAspectRatio="none">{points.map((point, index) => <line className="subtitle-alignment-waveform__signal" key={index} x1={index + .5} x2={index + .5} y1={24 - clamp(point.max) * 23} y2={24 - clamp(point.min) * 23} />)}{landmarks.filter((mark) => mark.time >= start && mark.time <= end).map((mark) => <circle className="subtitle-alignment-waveform__anchor" key={`${mark.kind}-${mark.time}`} cx={x(mark.time)!} cy={mark.kind === "onset" ? 5 : 43} r="3"><title>{mark.kind === "onset" ? "Âm tăng rõ" : "Âm giảm rõ"} · {mark.time.toFixed(3)}s · cần đối chiếu từ</title></circle>)}{[before?.start, before?.end].map((value, index) => x(value) === null ? null : <line className="subtitle-alignment-waveform__before" key={`before-${index}`} x1={x(value)!} x2={x(value)!} y1="0" y2="48" />)}{[after?.start, after?.end].map((value, index) => x(value) === null ? null : <line className="subtitle-alignment-waveform__after" key={`after-${index}`} x1={x(value)!} x2={x(value)!} y1="0" y2="48" />)}</svg> : <span>Dạng sóng chưa có</span>}</div>;
}
function clamp(value: number) { return Math.max(-1, Math.min(1, value)); }

function readLandmarks(value: unknown): WaveLandmark[] {
  if (!Array.isArray(value)) return [];
  return value.filter((mark): mark is WaveLandmark => Boolean(mark && typeof mark.time === "number" && Number.isFinite(mark.time) && (mark.kind === "onset" || mark.kind === "offset")));
}

function measuredCommonOffset(proposal: SubtitleAlignmentProposal): number | null {
  const group = proposal.diagnostics.local_offset_group as Record<string, unknown> | undefined;
  if (!group || Number(group.anchor_count) < 3 || group.median_start_offset === null || group.median_end_offset === null) return null;
  const start = Number(group.median_start_offset), end = Number(group.median_end_offset);
  const estimate = Math.round((start + end) / 2 * 1000);
  return Number.isFinite(estimate) && Math.abs(estimate) <= 500 ? estimate : null;
}
