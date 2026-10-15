import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectMediaAsset } from "../../domain/types";
import { REFERENCE_PROPERTIES, type ReferenceAssignment, type ReferenceSession, type ReferenceSource } from "../../domain/reference-bindings";
import "./reference-assignment.css";

export function ReferenceAssignmentEditor({ session, assets, projectId, onApply, onClose }: {
  session: ReferenceSession; assets: ProjectMediaAsset[]; projectId: string;
  onApply: (assignment: ReferenceAssignment) => Promise<void>; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sources, setSources] = useState<ReferenceSource[]>([]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const available = assets.filter((asset) => (asset.referenceSelected || sources.some((source) => source.assetId === asset.id)) && !asset.deletedAt);
  const update = (id: string, patch: Partial<ReferenceSource>) => setSources((current) => current.map((source) => source.assetId === id ? { ...source, ...patch } : source));
  const valid = sources.length > 0 && sources.every((source) => {
    const asset = assets.find((asset) => asset.id === source.assetId);
    return asset && asset.referenceSelected && !asset.deletedAt && !asset.disabled && !asset.availableAudioTracks?.length && source.properties.length && Number.isFinite(source.start) &&
      source.start >= 0 && source.end > source.start && source.end <= asset.duration && Number.isFinite(source.strength) && source.strength >= 0 && source.strength <= 1 && Number.isInteger(source.priority) && source.priority >= 0 && source.priority <= 100;
  });
  useEffect(() => {
    const before = returnFocus.current;
    return () => { if (before?.isConnected) before.focus(); };
  }, []);
  useEffect(() => { if (editing) dialog.current?.querySelector<HTMLElement>("button,input")?.focus(); }, [editing]);
  function close() { if (!applying) onClose(); }
  return createPortal(<div className={`reference-assignment-layer ${editing ? "is-editor" : ""}`} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab" && editing && dialog.current) {
      const controls = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),audio")].filter((element) => element.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <button aria-label="Đóng gán reference" className="reference-assignment-backdrop" disabled={applying} onClick={close} type="button" />
    {!editing ? <div role="menu" className="reference-menu" data-reference-origin={session.request.origin} style={{ left: Math.max(4, Math.min(window.innerWidth - 260, session.request.x)), top: Math.max(4, Math.min(window.innerHeight - 80, session.request.y)) }}>
      <button autoFocus role="menuitem" disabled={session.expectedRevision === null} onClick={() => {
        const existing = session.existing.find((binding) => session.targets.some((target) => binding.scope.id === session.scope.id && binding.target.start === target.start && binding.target.end === target.end && binding.target.text === target.text));
        setSources(existing?.sources.map((source) => ({ ...source })) ?? []);
        setEditing(true);
      }} type="button">{session.expectedRevision === null ? "Đang đọc reference…" : "Gán reference footage…"}</button>
    </div> : <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="reference-assignment-title" className="reference-assignment-dialog">
      <header><h2 id="reference-assignment-title">Gán reference footage</h2><button aria-label="Hủy gán reference" disabled={applying} onClick={close} type="button">×</button></header>
      <p>Các đặc tính được lưu dưới dạng yêu cầu. Chưa phân tích, resolve hoặc áp dụng vào audio; voice của nhân vật giữ nguyên.</p>
      <div className="reference-target-preview" aria-label="Vùng đích đã chụp">
        {session.targets.map((target) => <div key={target.id}><b>{target.text || "Vùng audio chưa có text"}</b><small>{target.start === null ? "Chưa có timing audio" : `START ${target.start.toFixed(3)}s — DURATION ${(target.end! - target.start).toFixed(3)}s — END ${target.end!.toFixed(3)}s`}</small>
          {target.rowIds.map((id) => <small key={id}>Kế thừa: {Object.entries(session.inherited[id] ?? {}).filter(([key, value]) => key !== "locked" && value != null).map(([key, value]) => `${({ duration: "Thời lượng", mood: "Tâm trạng", emotion: "Cảm xúc", intensity: "Cường độ", delivery: "Cách đọc", gainDb: "Âm lượng", note: "Ghi chú" } as Record<string, string>)[key] ?? key}: ${value}`).join(" · ") || "chưa đặt"}{session.inherited[id]?.locked?.length ? ` · Giữ khóa: ${session.inherited[id].locked!.join(", ")}` : ""}</small>)}
        </div>)}
      </div>
      <fieldset disabled={applying} className="reference-source-list"><legend>Chọn nhiều footage và đặc tính riêng cho từng file</legend>
        {sources.filter((source) => !available.some((asset) => asset.id === source.assetId)).map((source) => <p role="alert" key={source.assetId}>Thiếu reference {source.name ?? source.assetId}. <button type="button" onClick={() => setSources((current) => current.filter((item) => item.assetId !== source.assetId))}>Bỏ source bị thiếu</button></p>)}
        {available.map((asset) => {
          const source = sources.find((item) => item.assetId === asset.id);
          return <div key={asset.id} className="reference-source-editor">
            <label><input type="checkbox" checked={Boolean(source)} disabled={asset.disabled || Boolean(asset.availableAudioTracks?.length) || asset.duration <= 0} onChange={(event) => setSources((current) => event.target.checked
              ? [...current, { assetId: asset.id, start: 0, end: asset.duration, properties: [], strength: 1, priority: 0 }]
              : current.filter((item) => item.assetId !== asset.id))} />{asset.name}{!asset.referenceSelected ? " · Không còn đánh dấu Reference" : ""}{asset.sourceArchiveAssetId ? ` · TRACK ${asset.sourceArchiveStreamIndex ?? ""}` : ""}</label>
            {source ? <div className="reference-source-settings">
              <audio controls preload="none" src={`/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(asset.id)}/audio`} onError={() => setError(`Thiếu audio của ${asset.name}. Kết nối lại source trước khi gán.`)} />
              <div className="reference-source-properties">{REFERENCE_PROPERTIES.map(([property, label]) => <label key={property}><input type="checkbox" aria-label={`${label} · ${asset.name}`} checked={source.properties.includes(property)} onChange={(event) => update(asset.id, { properties: event.target.checked ? [...source.properties, property] : source.properties.filter((item) => item !== property) })} />{label}</label>)}</div>
              <div className="reference-source-numbers">{([ ["start", "Bắt đầu", 0, asset.duration, .001], ["end", "Kết thúc", .001, asset.duration, .001], ["strength", "Mức áp dụng", 0, 1, .05], ["priority", "Ưu tiên", 0, 100, 1] ] as const).map(([key, label, min, max, step]) => <label key={key}>{label}<input aria-label={`${label} · ${asset.name}`} type="number" min={min} max={max} step={step} value={Number.isFinite(source[key]) ? source[key] : ""} onChange={(event) => update(asset.id, { [key]: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /></label>)}</div>
            </div> : null}
          </div>;
        })}
        {!available.length ? <p>Chưa có footage Reference. Import hoặc đánh dấu footage trong tab Reference trước.</p> : null}
      </fieldset>
      <small>Random thông số và random thời điểm sẽ có ở vòng Reference Random; hiện áp dụng cấu hình yêu cầu cố định cho vùng đã chọn.</small>
      {error ? <p role="alert">{error}</p> : null}
      <footer><button disabled={applying} onClick={close} type="button">Hủy</button><button disabled={!valid || applying || session.expectedRevision === null} onClick={async () => {
        setApplying(true); setError(null);
        try { await onApply({ scope: session.scope, targets: session.targets, sources, expectedRevision: session.expectedRevision! }); onClose(); }
        catch (reason) { setError(String(reason)); }
        finally { setApplying(false); }
      }} type="button">{applying ? "Đang lưu…" : `Áp dụng cho ${session.targets.length} vùng`}</button></footer>
    </section>}
  </div>, document.body);
}
