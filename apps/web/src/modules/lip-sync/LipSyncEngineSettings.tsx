import type { TrainingModelOption, TrainingParameterValue } from "../../domain/types";
import { useParameterForm } from "../../ui/ParameterForm";
import { useEffect } from "react";

export function LipSyncEngineSettings({ engine, values, onChange, onValidityChange }: {
  engine: TrainingModelOption;
  values: Record<string, TrainingParameterValue>;
  onChange: (values: Record<string, TrainingParameterValue>) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const realtime = values.pipeline === "realtime";
  const specs = engine.parameters.filter((spec) => engine.engine !== "musetalk"
    || (spec.key !== "use_float16" || !realtime) && (spec.key !== "skip_save_images" || realtime))
    .map((spec) => engine.engine === "musetalk" && realtime && spec.key === "batch_size"
      ? { ...spec, default: 20, codeDefault: 20 } : spec);
  const form = useParameterForm({ scope: `${engine.id}:${realtime}`, specs, overrides: values,
    onChange: (spec, value) => onChange({ ...values, [spec.key]: value }) });
  useEffect(() => { onValidityChange?.(!form.problems.length); }, [form.problems.length, onValidityChange]);
  return <section aria-label={`Thông số ${engine.label}`} className="lipsync-engine-settings">
    <div className="lipsync-settings-heading"><b>{engine.label} · Inference</b>
      <button onClick={() => { onChange({}); form.clearDrafts(); }} type="button">Khôi phục mặc định</button></div>
    <p>Thông số bản nháp cho engine đã chọn. Render sẽ khả dụng sau khi runtime, model và adapter được kiểm chứng.</p>
    {form.basic}{form.advanced}
    {form.problems.length ? <p role="alert">Có {form.problems.length} thông số không hợp lệ.</p> : null}
  </section>;
}
