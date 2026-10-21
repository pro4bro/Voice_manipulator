import type { LipSyncLayer, LipSyncScope } from "../../domain/lipsync";

export function LipSyncScopeEditor({ title, scope, layers, duration, onChange }: {
  title: string; scope: LipSyncScope; layers: LipSyncLayer[]; duration: number; onChange: (scope: LipSyncScope) => void;
}) {
  const all = scope.allLayers ?? !scope.layerIds.length;
  return <fieldset className="lipsync-scope"><legend>{title}</legend>
    <label>Áp dụng trên<select aria-label={`${title} · cách lấy video`} value={scope.mode} onChange={(event) => onChange({ ...scope, mode: event.target.value as LipSyncScope["mode"], range: null })}>
      <option value="visible">Chỉ phần đang thấy trên Preview</option>
      <option value="placed">Các clip đã đặt, gồm cả phần bị che</option>
      <option value="source">Toàn bộ source footage</option>
    </select></label>
    <label className="lipsync-check"><input checked={all} onChange={(event) => onChange({ ...scope, allLayers: event.target.checked, layerIds: event.target.checked ? [] : layers.map((layer) => layer.id) })} type="checkbox" />Tất cả layer · {title}</label>
    {!all ? <div className="lipsync-layer-choices">{layers.map((layer) => <label className="lipsync-check" key={layer.id}>
      <input checked={scope.layerIds.includes(layer.id)} onChange={(event) => onChange({ ...scope, layerIds: event.target.checked ? [...scope.layerIds, layer.id] : scope.layerIds.filter((id) => id !== layer.id) })} type="checkbox" />
      {layer.name}{layer.enabled ? "" : " · đang tắt"}
    </label>)}</div> : null}
    <label className="lipsync-check"><input checked={!!scope.range} onChange={(event) => onChange({ ...scope, range: event.target.checked ? { start: 0, end: Math.max(.1, duration) } : null })} type="checkbox" />Chọn đoạn · {title}</label>
    {scope.range ? <><label>Bắt đầu ({scope.mode === "source" ? "giây nguồn" : "giây timeline"})<input aria-label={`${title} · bắt đầu`} min="0" step="0.01" type="number" value={scope.range.start} onChange={(event) => onChange({ ...scope, range: { ...scope.range!, start: Number(event.target.value) } })} /></label>
      <label>Kết thúc ({scope.mode === "source" ? "giây nguồn" : "giây timeline"})<input aria-label={`${title} · kết thúc`} min="0" step="0.01" type="number" value={scope.range.end} onChange={(event) => onChange({ ...scope, range: { ...scope.range!, end: Number(event.target.value) } })} /></label>
      {scope.range.end <= scope.range.start ? <p role="alert">Kết thúc phải sau bắt đầu.</p> : null}</> : null}
    <p>{scope.mode === "source" ? "Đoạn dùng đồng hồ source, gồm phần chưa đưa vào timeline và layer đang tắt. Source gốc được giữ nguyên." : scope.mode === "visible" ? "Layer đang tắt và phần bị layer khác che sẽ được bỏ qua." : "Xử lý từng clip đã đặt, kể cả phần bị che hoặc layer đang tắt."}</p>
  </fieldset>;
}
