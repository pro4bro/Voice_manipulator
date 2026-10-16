import { useEffect, useRef, useState } from "react";
import type { VoiceOutput } from "../../domain/types";
import type { VoicePatchDocument } from "../../domain/voice-patch";
import { patchRowForSelection } from "../../domain/patch-selection";
import { EMPTY_SELECTION, type WordSelection } from "../../domain/word-selection";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface VoicePatchProps {
  projectId?: string; output?: VoiceOutput | null; selection?: WordSelection;
  scriptRevision?: number; editRevision?: number; saved?: boolean;
  onNavigateOutput?: (id: string) => void;
}

async function readSource(url: string, body?: object): Promise<VoicePatchDocument> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không chuyển được nguồn sang Patch.");
  if (!Number.isInteger(result.revision) || !("draft" in result)) throw new Error("Không đọc được nguồn Patch đã lưu.");
  return result as VoicePatchDocument;
}
const clock = (frame: number | undefined, rate: number | undefined) => frame === undefined || !rate ? "—" : `${(frame / rate).toFixed(3)} s`;

export function VoicePatch({ projectId, output = null, selection = EMPTY_SELECTION, scriptRevision = 0, editRevision = 0, saved = false, onNavigateOutput }: VoicePatchProps) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId ?? "")}/voice-patch/source`;
  const [document, setDocument] = useState<VoicePatchDocument | null>(null);
  const [rowId, setRowId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const selectionKey = JSON.stringify(selection);
  const identity = `${endpoint}:${output?.id}:${scriptRevision}:${editRevision}:${selectionKey}:${rowId}`;
  const current = useRef(identity); current.current = identity;
  const serial = useRef(0);
  useEffect(() => {
    setRowId(output && projectId ? patchRowForSelection(output, selection, projectId) ?? "" : "");
  }, [output?.id, selectionKey, projectId]);
  useEffect(() => {
    const version = ++serial.current;
    let active = true;
    setDocument(null); setError(null); setBusy(true);
    if (!projectId) { setBusy(false); return; }
    void readSource(endpoint).then((packet) => { if (active && serial.current === version) setDocument(packet); })
      .catch((reason) => { if (active && serial.current === version) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active && serial.current === version) setBusy(false); });
    return () => { active = false; serial.current++; };
  }, [endpoint, projectId, reload]);

  async function transfer() {
    if (!projectId || !output || !rowId || !document || busy || !saved) return;
    const expected = identity, version = ++serial.current;
    setBusy(true); setError(null);
    try {
      const packet = await readSource(endpoint, { expectedRevision: document.revision, outputId: output.id, rowId,
        expectedScriptRevision: scriptRevision, expectedEditRevision: editRevision });
      if (current.current === expected && serial.current === version) setDocument(packet);
    } catch (reason) { if (current.current === expected && serial.current === version) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (serial.current === version) setBusy(false); }
  }
  const draft = document?.draft;
  const sameSource = draft?.outputId === output?.id;
  const currentDraft = draft?.status === "ready" && sameSource && draft.scriptRevision === scriptRevision && draft.editRevision === editRevision;
  return <ModuleFrame eyebrow="VOICE PATCH" title="Vá đoạn hỏng" index="02" className="voice-patch-module" tone="warm">
    <p>Chuyển cả câu chứa vùng chọn từ waveform, subtitle hoặc Script. Nguồn gốc được giữ nguyên.</p>
    <label className="patch-copy"><span>CÂU NGUỒN</span><select aria-label="Câu nguồn để Patch" value={rowId} disabled={busy || !output} onChange={(event) => setRowId(event.target.value)}>
      <option value="">Chọn một câu…</option>
      {output?.segments?.map((row) => <option key={row.rowId} value={row.rowId}>{row.text.slice(0, 100)}</option>)}
    </select></label>
    <button className="button button--quiet" type="button" disabled={busy || !saved || !output || !rowId || !document} onClick={() => void transfer()}>Chuyển cả câu sang Patch</button>
    <button className="button button--quiet" type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Đọc nguồn đã lưu</button>
    {busy ? <p role="status">Đang kiểm tra nguồn…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {!output ? <p>Mở một Voice Output để chọn câu cần vá.</p> : !saved ? <p>Chờ Script lưu xong trước khi chuyển nguồn.</p> : null}
    <div className="patch-range">
      <label><span>START</span><input readOnly value={clock(draft?.startFrame, draft?.sampleRate)} /></label><i>→</i>
      <label><span>END</span><input readOnly value={clock(draft?.endFrame, draft?.sampleRate)} /></label>
    </div>
    {draft ? <><p>{draft.text}</p><p>Thời lượng: {clock(draft.endFrame - draft.startFrame, draft.sampleRate)}</p>
      {!currentDraft ? <p role="status">{draft.reason ?? "Nguồn hoặc Script/Timeline đang mở đã thay đổi. Đọc lại hoặc chuyển câu hiện tại."}</p> : null}
      {!sameSource && onNavigateOutput ? <button type="button" onClick={() => onNavigateOutput(draft.outputId)}>Mở nguồn đã lưu</button> : null}
      {currentDraft ? <audio controls aria-label="Nghe nguồn Patch" src={draft.audioUrl} /> : null}
    </> : null}
    <label className="patch-copy"><span>NỘI DUNG ĐỌC LẠI</span><input readOnly value={draft?.replacementText ?? ""} placeholder="Chuyển một câu nguồn trước…" /></label>
    <p>Chưa có bộ xử lý Patch khả dụng cho nguồn này.</p>
    <button className="button button--lime button--full" disabled type="button"><Icon name="wrench" />Tạo bản vá nghe thử</button>
  </ModuleFrame>;
}

