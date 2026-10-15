import { useState } from "react";
import type { ScriptSettings, VoiceScriptDocument, VoiceScriptRow } from "../../domain/types";
import { effectiveScriptSettings, joinScriptSentences, migrateScript, splitScriptSentence } from "../../domain/voice-script-document";
import { newRowId } from "../../domain/voiceScript";

type SettingKey = Exclude<keyof ScriptSettings, "locked">;
const fields: Array<{ key: SettingKey; label: string; min?: number; max?: number; step?: number }> = [
  { key: "duration", label: "Thời lượng mong muốn (giây)", min: 0.01, max: 600, step: 0.01 },
  { key: "mood", label: "Tâm trạng" }, { key: "emotion", label: "Cảm xúc" },
  { key: "intensity", label: "Cường độ (0–1)", min: 0, max: 1, step: 0.05 },
  { key: "gainDb", label: "Âm lượng (dB)", min: -60, max: 12, step: 0.5 }, { key: "note", label: "Ghi chú" },
];

export function VoiceScriptSettings({ document, onChange, selectedIds, onRowsChange }: {
  document: VoiceScriptDocument; onChange?: (document: VoiceScriptDocument) => void;
  selectedIds: string[]; onRowsChange: (rows: VoiceScriptRow[]) => void;
}) {
  const [scope, setScope] = useState<"clip" | "segment" | "sentence">("sentence");
  const [error, setError] = useState<string | null>(null);
  const row = document.rows.find((item) => selectedIds.includes(item.id)) ?? document.rows[0];
  const segment = document.segments.find((item) => item.id === row?.segmentId);
  const settings = (scope === "clip" ? document.settings : scope === "segment" ? segment?.settings : row?.settings) ?? {};
  const effective = row ? effectiveScriptSettings(document, row) : {};
  const inheritedLocks = new Set(scope === "clip" ? [] : [...(document.settings.locked ?? []), ...(scope === "sentence" ? segment?.settings.locked ?? [] : [])]);
  function change(key: keyof ScriptSettings, value: unknown) {
    if (!onChange) return;
    const next = { ...settings, [key]: value };
    onChange({ ...document, ...(scope === "clip" ? { settings: next } : scope === "segment" ? {
      segments: document.segments.map((item) => item.id === segment?.id ? { ...item, settings: next } : item),
    } : { rows: document.rows.map((item) => item.id === row?.id ? { ...item, settings: next } : item) }) });
  }
  function split() {
    const selected = new Set(selectedIds.length ? selectedIds : row ? [row.id] : []);
    onRowsChange(document.rows.flatMap((item) => selected.has(item.id) ? splitScriptSentence(item) : [item]));
  }
  function join() {
    const index = document.rows.findIndex((item) => item.id === row?.id);
    if (index < 0 || !document.rows[index + 1]) return;
    try {
      const joined = joinScriptSentences(document.rows[index], document.rows[index + 1]);
      onRowsChange(document.rows.flatMap((item, i) => i === index ? [joined] : i === index + 1 ? [] : [item]));
      setError(null);
    } catch (reason) { setError(String(reason)); }
  }
  return <details className="voice-script-settings">
    <summary>Cấu trúc và hướng dẫn đọc · clip / đoạn / câu</summary>
    <p>Chọn câu bằng số dòng. Hướng dẫn được lưu cùng project; thời lượng, sắc thái và âm lượng sẽ được áp dụng ở các bước generate tiếp theo.</p>
    <div className="voice-script-settings__tools">
      <button disabled={!row} onClick={split} type="button">Tách thành câu</button>
      <button disabled={!row} onClick={join} type="button">Ghép với câu sau</button>
      <button disabled={!row || !onChange} onClick={() => {
        const id = `segment-${newRowId()}`;
        const selected = new Set(selectedIds.length ? selectedIds : row ? [row.id] : []);
        onChange?.(migrateScript(document.rows.map((item) => selected.has(item.id) ? { ...item, segmentId: id } : item), document));
      }} type="button">Tạo đoạn từ câu đã chọn</button>
      <label>Thuộc đoạn<select aria-label="Đoạn chứa câu" value={row?.segmentId ?? ""} disabled={!row || !onChange} onChange={(event) => {
        const selected = new Set(selectedIds.length ? selectedIds : row ? [row.id] : []);
        onRowsChange(document.rows.map((item) => selected.has(item.id) ? { ...item, segmentId: event.target.value } : item));
      }}>{document.segments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <label>Cấp cấu hình<select aria-label="Cấp cấu hình Script" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="clip">Cả clip</option><option value="segment">Đoạn chứa câu đang chọn</option><option value="sentence">Câu đang chọn</option></select></label>
    <small>{row ? `${segment?.name ?? "Đoạn"} · ${row.text.slice(0, 100)}` : "Thêm lời thoại để cấu hình câu."}</small>
    <fieldset disabled={!onChange || (scope !== "clip" && !row)}>
      {fields.map((field) => <div className="voice-script-settings__field" key={field.key}>
        <label>{field.label}<input disabled={inheritedLocks.has(field.key)} title={inheritedLocks.has(field.key) ? "Đã khóa ở cấp trên" : undefined} aria-label={field.label} type={field.min === undefined ? "text" : "number"} min={field.min} max={field.max} step={field.step}
          placeholder={`Kế thừa${effective[field.key] != null ? `: ${effective[field.key]}` : ""}`} value={settings[field.key] ?? ""}
          onChange={(event) => change(field.key, event.target.value === "" ? null : field.min === undefined ? event.target.value : Number(event.target.value))} /></label>
        <label><input type="checkbox" aria-label={`Khóa ${field.label}`} checked={settings.locked?.includes(field.key) ?? false} onChange={(event) => change("locked", event.target.checked ? [...(settings.locked ?? []), field.key] : settings.locked?.filter((key) => key !== field.key) ?? [])} />Khóa</label>
      </div>)}
      <label>Cách đọc<select disabled={inheritedLocks.has("delivery")} aria-label="Cách đọc" value={settings.delivery ?? ""} onChange={(event) => change("delivery", event.target.value || null)}><option value="">Kế thừa ({effective.delivery ?? "chưa đặt"})</option><option value="neutral">Bình thường</option><option value="whisper">Thì thầm</option><option value="shout">Hét to</option></select></label>
      <label><input type="checkbox" checked={settings.locked?.includes("delivery") ?? false} onChange={(event) => change("locked", event.target.checked ? [...(settings.locked ?? []), "delivery"] : settings.locked?.filter((key) => key !== "delivery") ?? [])} />Khóa cách đọc</label>
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}
