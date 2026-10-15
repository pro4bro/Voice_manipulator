import { useEffect, useRef, useState } from "react";
import { REFERENCE_PROPERTIES, type ReferenceBinding, type ReferenceBindingDocument, type ReferenceResolution } from "../../domain/reference-bindings";
import { ModuleFrame } from "../../ui/ModuleFrame";
import "./reference-detail.css";

export function ReferenceDetail({ document, error, onReload, onNavigate, onDelete, onResolve }: {
  onResolve?: (binding: ReferenceBinding) => Promise<ReferenceResolution>;
  document?: ReferenceBindingDocument | null; error?: string | null; onReload?: () => void;
  onNavigate?: (binding: ReferenceBinding) => void; onDelete?: (binding: ReferenceBinding) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ReferenceResolution>>({});
  const analysisToken = useRef(0);
  useEffect(() => { analysisToken.current++; setResolutions({}); setBusy(null); return () => { analysisToken.current++; }; }, [document]);
  const [failure, setFailure] = useState<string | null>(null);
  return <ModuleFrame title="Reference Detail" className="reference-detail" action={<button type="button" onClick={onReload}>Làm mới</button>}>
    {error || failure ? <p role="alert">{error || failure}</p> : null}
    {!document && !error ? <p role="status">Đang đọc reference…</p> : null}
    {document && !document.bindings.length ? <p>Quét chọn waveform, subtitle hoặc Script rồi bấm chuột phải để gán reference.</p> : null}
    <ul aria-label="Các vùng đã gán reference" className="reference-detail__list">
      {document?.bindings.map((binding) => {
        const open = expanded.has(binding.id);
        const label = binding.target.text || (binding.target.start !== null ? `Vùng âm thanh ${binding.target.start.toFixed(3)}–${binding.target.end!.toFixed(3)}s` : "Câu chưa có lời thoại");
        return <li key={binding.id}>
          <div className="reference-detail__slot">
            <button className="reference-detail__target" type="button" onClick={() => onNavigate?.(binding)} title={label} aria-label={`${label} ${binding.sources.map((source) => source.name || source.assetId).join(" · ")}`}>
              <span>{label}</span><span>{binding.sources.map((source) => source.name || source.assetId).join(" · ")}</span>
            </button>
            <button type="button" aria-label={`Chi tiết ${label}`} aria-expanded={open} aria-controls={`reference-${binding.id}`} onClick={() => setExpanded((current) => { const next = new Set(current); if (open) next.delete(binding.id); else next.add(binding.id); return next; })}>{open ? "▴" : "▾"}</button>
          </div>
          {open ? <div id={`reference-${binding.id}`} className="reference-detail__expanded">
            <p>{binding.target.start === null ? "Chưa có timing audio" : `${binding.target.start.toFixed(3)} → ${binding.target.end!.toFixed(3)}s · ${(binding.target.end! - binding.target.start).toFixed(3)}s`}</p>
            <p>Trạng thái: {binding.status} · Random giá trị/thời điểm: tắt · Chưa áp dụng vào audio</p>
            {binding.warnings.map((warning, index) => <p role="status" key={index}>{warning}</p>)}
            {binding.sources.map((source, index) => <div key={`${source.assetId}-${index}`}>
              <b>{source.name || source.assetId}</b><p>{source.start.toFixed(3)} → {source.end.toFixed(3)}s</p>
              <p>{source.properties.map((property) => REFERENCE_PROPERTIES.find(([key]) => key === property)?.[1]).join(" · ")}</p>
              <p>Mức ảnh hưởng {Math.round(source.strength * 100)}% · Ưu tiên {source.priority}</p>
            </div>)}
            <button type="button" disabled={busy !== null || !onResolve} onClick={async () => { setBusy(binding.id); setFailure(null); try { const token = ++analysisToken.current; const result = await onResolve?.(binding); if (result && token === analysisToken.current) setResolutions((current) => ({ ...current, [binding.id]: result })); } catch (reason) { setFailure(String(reason)); } finally { setBusy(null); } }}>Phân tích reference</button>
            {resolutions[binding.id]?.units.map((unit, index) => <div key={unit.rowId ?? index} aria-label="Kết quả phân tích reference"><b>{unit.rowId || "Vùng audio"}</b>{Object.entries(unit.properties).map(([key, result]) => <p key={key}>{REFERENCE_PROPERTIES.find(([id]) => id === key)?.[1]}: {result.state} · {result.reason}{result.source?.features ? ` · ${result.source.features.duration.toFixed(3)}s · RMS ${result.source.features.rmsDbfs?.toFixed(1) ?? "im lặng"} dBFS` : ""}</p>)}</div>)}
            <button type="button" disabled={busy !== null || !onDelete} onClick={async () => { setBusy(binding.id); setFailure(null); try { await onDelete?.(binding); } catch (reason) { setFailure(String(reason)); } finally { setBusy(null); } }}>{busy === binding.id ? "Đang bỏ gán…" : "Bỏ gán reference"}</button>
          </div> : null}
        </li>;
      })}
    </ul>
  </ModuleFrame>;
}
