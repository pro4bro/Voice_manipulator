import { useEffect, useRef, useState } from "react";
import type { ProjectMediaAsset, ProjectVoice, VoiceOutput } from "../../domain/types";
import type { WordSelection } from "../../domain/word-selection";
import type { VoicePatchSource } from "../../domain/voice-patch";
import { PatchProcessing } from "./PatchProcessing";
import { mediaPatchSpan } from "../../domain/patch-selection";

interface Candidate { id: string; side: string; startWord: number; endWord: number; startFrame: number; endFrame: number; text: string; artifactSha256?: string | null }
interface ContextSource extends VoicePatchSource { assetId: string; contextCandidates: Candidate[]; selectedContext: Candidate | null; reviewedTarget?: { reviewKey: string } | null; report: { targetWordIndices: number[] } }
interface ContextDocument { revision: number; draft: ContextSource | null }
interface Props { projectId: string; assets: ProjectMediaAsset[]; voices?: ProjectVoice[]; selectedAssetId?: string | null; selection?: WordSelection; scriptRevision: number; saved: boolean; onOutputReady?: (output: VoiceOutput) => void; onOpenSource?: (id: string) => void }
async function request(url: string, body?: object): Promise<ContextDocument> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không đọc được nguồn tham chiếu.");
  if (!Number.isInteger(result.revision) || !("draft" in result)) throw new Error("Nguồn tham chiếu không hợp lệ.");
  return result as ContextDocument;
}

export function ContextPatch({ projectId, assets, voices = [], selectedAssetId, selection, scriptRevision, saved, onOutputReady, onOpenSource }: Props) {
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/voice-patch/context`;
  const [document, setDocument] = useState<ContextDocument | null>(null);
  const [assetId, setAssetId] = useState(selectedAssetId ?? "");
  const [startWord, setStartWord] = useState(0), [endWord, setEndWord] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [strategy, setStrategy] = useState<"trained-media" | "context" | "hybrid">("context");
  const [confirmed, setConfirmed] = useState(false);
  const identity = `${endpoint}:${assetId}:${startWord}:${endWord}:${scriptRevision}`;
  const current = useRef(identity); current.current = identity;
  useEffect(() => { setConfirmed(false); }, [identity, document?.draft?.sourceSha256]);
  const serial = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; serial.current++; }; }, []);
  const selectionKey = JSON.stringify(selection);
  const assetRevisions = assets.map((asset) => `${asset.id}:${asset.updatedAt}`).join("|");
  useEffect(() => {
    if (!selection) return;
    const source = assets.find((asset) => asset.id === selection.scope?.id);
    const span = source && mediaPatchSpan(source, selection);
    if (!span) return;
    setAssetId(source!.id); setStartWord(span[0]); setEndWord(span[1]);
  }, [selectionKey, assetRevisions]);
  useEffect(() => {
    const version = ++serial.current;
    let valid = true;
    setDocument(null); setBusy(true); setError(null);
    void request(`${endpoint}/source`).then((value) => { if (valid && version === serial.current) setDocument(value); })
      .catch((reason) => { if (valid && version === serial.current) setError(String(reason)); })
      .finally(() => { if (valid && version === serial.current) setBusy(false); });
    return () => { valid = false; serial.current++; };
  }, [endpoint, reload]);
  async function act(candidateId?: string) {
    if (!document || busy || !saved) return;
    const expected = identity, version = ++serial.current;
    setBusy(true); setError(null);
    try {
      const value = await request(`${endpoint}/${candidateId ? "select" : "source"}`, candidateId ? {
        expectedRevision: document.revision, candidateId,
      } : { expectedRevision: document.revision, expectedScriptRevision: scriptRevision, assetId, startWord, endWord });
      if (mounted.current && current.current === expected && version === serial.current) setDocument(value);
    } catch (reason) { if (mounted.current && current.current === expected && version === serial.current) setError(String(reason)); }
    finally { if (mounted.current && version === serial.current) setBusy(false); }
  }
  async function reviewTarget() {
    if (!document?.draft || !confirmed || busy || !saved) return;
    const expected = identity, version = ++serial.current, source = document.draft;
    setBusy(true); setError(null);
    try {
      const value = await request(`${endpoint}/review`, { expectedRevision: document.revision,
        expectedSourceSha256: source.sourceSha256, startFrame: source.startFrame, endFrame: source.endFrame });
      if (mounted.current && current.current === expected && version === serial.current) { setDocument(value); setConfirmed(false); }
    } catch (reason) { if (mounted.current && current.current === expected && version === serial.current) setError(String(reason)); }
    finally { if (mounted.current && version === serial.current) setBusy(false); }
  }
  const asset = assets.find((item) => item.id === assetId), draft = document?.draft;
  const target = draft?.report.targetWordIndices;
  const matches = !!draft && draft.assetId === assetId && draft.scriptRevision === scriptRevision
    && draft.status === "ready" && target?.[0] === startWord && target[target.length - 1] === endWord;
  const sourceUrl = draft?.audioUrl;
  const reviewed = matches && !!draft?.reviewedTarget?.reviewKey;
  return <details className="voice-script-settings"><summary>Vá footage · Chọn vùng và phương án 1–3</summary>
    <p>Chọn vùng lời nói đã có timing đáng tin cậy và gán người nói. Vùng quét được mở rộng tới biên các từ giao với vùng chọn; nghe và xác nhận biên trước khi tạo.</p>
    <label className="patch-copy"><span>FOOTAGE NGUỒN</span><select aria-label="Footage để vá theo context" value={assetId} onChange={(event) => { setAssetId(event.target.value); setStartWord(0); setEndWord(0); }}>
      <option value="">Chọn footage…</option>{assets.filter((item) => !item.disabled && !item.deletedAt).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <label className="patch-copy"><span>TỪ ĐẦU</span><select aria-label="Từ đầu vùng Patch" value={startWord} onChange={(event) => setStartWord(Number(event.target.value))}>{asset?.words.map((word, index) => <option key={index} value={index}>{index + 1}. {word.text} · {word.start.toFixed(3)}s</option>)}</select></label>
    <label className="patch-copy"><span>TỪ CUỐI</span><select aria-label="Từ cuối vùng Patch" value={endWord} onChange={(event) => setEndWord(Number(event.target.value))}>{asset?.words.map((word, index) => <option key={index} value={index}>{index + 1}. {word.text} · {word.end.toFixed(3)}s</option>)}</select></label>
    <button type="button" disabled={busy || !saved || !document || !asset?.words.length || endWord < startWord} onClick={() => void act()}>Tìm giọng quanh vùng cần vá</button>
    <button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Đọc context đã lưu</button>
    {busy ? <p role="status">Đang kiểm tra vùng tham chiếu…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {!asset?.words.length ? <p>Mở footage ở Speech to Text để nhận diện, căn timing và gán người nói trước.</p> : null}
    {draft ? <div><p>Nguồn: {assets.find((item) => item.id === draft.assetId)?.name ?? draft.assetId} · {draft.text}</p>
      <p>{(draft.startFrame / draft.sampleRate).toFixed(3)} → {(draft.endFrame / draft.sampleRate).toFixed(3)} giây</p>
      {!matches ? <p role="status">{draft.reason ?? "Vùng đang chọn khác nguồn đã lưu. Chọn lại vùng hoặc tìm context mới."}</p> : null}
      {onOpenSource ? <button type="button" onClick={() => onOpenSource(draft.assetId)}>Mở footage nguồn ở STT</button> : null}
      <button type="button" onClick={() => { setAssetId(draft.assetId); setStartWord(target?.[0] ?? 0); setEndWord(target?.[target.length - 1] ?? 0); }}>Chọn vùng context đã lưu</button>
      {matches ? <><audio controls aria-label="Nghe vùng cần vá từ footage" src={`${sourceUrl}#t=${draft.startFrame / draft.sampleRate},${draft.endFrame / draft.sampleRate}`} />
        {reviewed ? <p>Đã xác nhận biên vùng vá</p> : <><p>Nghe đầu/cuối vùng chọn trước khi tạo. Xác nhận này không biến timestamp ước lượng thành căn lời đã đo.</p>
          <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Đã nghe và xác nhận đúng biên vùng cần vá</label>
          <button type="button" disabled={!confirmed || busy || !saved} onClick={() => void reviewTarget()}>Xác nhận biên vùng vá</button></>}
        <label className="patch-copy"><span>PHƯƠNG ÁN VÁ</span><select aria-label="Phương án Patch context" value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}>
          <option value="trained-media">1 · Model đã train + mẫu sạch của model</option><option value="context">2 · Clone từ context</option><option value="hybrid">3 · Model đã train + context</option>
        </select></label>
        <p>Đã loại vùng không rõ người nói, chồng lời đã biết, vùng đã bỏ, clipping và gần như im lặng. App chưa xác nhận nhiễu nền hay độ giống giọng; cần nghe reference.</p>
        {!draft.contextCandidates.length ? <p>Không có đoạn tham chiếu đạt điều kiện trước/sau vùng này.</p> : null}
        {draft.contextCandidates.map((candidate) => <div key={candidate.id}><p>{candidate.side === "before" ? "Trước" : "Sau"} · {(candidate.startFrame / draft.sampleRate).toFixed(3)}–{(candidate.endFrame / draft.sampleRate).toFixed(3)}s · {candidate.text}</p>
          <audio controls aria-label={`Nghe context ${candidate.id}`} src={`${sourceUrl}#t=${candidate.startFrame / draft.sampleRate},${candidate.endFrame / draft.sampleRate}`} />
          <button type="button" disabled={busy || !saved || candidate.id === draft.selectedContext?.id} onClick={() => void act(candidate.id)}>{candidate.id === draft.selectedContext?.id ? "Đã chọn tham chiếu" : "Dùng đoạn này làm giọng tham chiếu"}</button>
        </div>)}
        {strategy === "trained-media" || draft.selectedContext ? <><p>{strategy === "trained-media" ? "Dùng reference sạch của model đã train; không cần chọn context." : "Reference đã cắt riêng, có hash và transcript. Lời thay thế được nhập bên dưới."}</p>
          <PatchProcessing key={`${projectId}:${strategy}:${document!.revision}`} projectId={projectId} document={document!} currentSource={!!reviewed} saved={saved} voices={voices} mode={strategy} onOutputReady={onOutputReady} /></> : <p>Chọn một reference phía trên để dùng phương án này.</p>}
      </> : null}
    </div> : null}
  </details>;
}
