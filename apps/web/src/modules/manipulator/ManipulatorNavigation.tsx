import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { ManipulatorMode, TrainingModelOption } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import "./manipulator.css";

export const MANIPULATOR_FUNCTIONS = [
  { id: "voice-over", prefix: "VO", label: "Voice Over" },
  { id: "voice-patch", prefix: "VP", label: "Voice Patch" },
  { id: "voice-dubber", prefix: "VD", label: "Voice Dub" },
  { id: "voice-isolator", prefix: "VI", label: "Voice Isolator" },
  { id: "live-translate", prefix: "LT", label: "Live Translate" },
] as const;

export function ManipulatorNavigation({ mode, onChange }: { mode: ManipulatorMode; onChange: (mode: ManipulatorMode) => void }) {
  return <div className="manipulator-navigation" role="tablist" aria-label="Chức năng Voice Manipulator" aria-orientation="vertical">
    {MANIPULATOR_FUNCTIONS.map((item, index) => <button key={item.id} type="button" role="tab"
      id={`manipulator-tab-${item.id}`} aria-controls="manipulator-workspace" aria-selected={mode === item.id}
      aria-label={`${item.prefix} · ${item.label}`} title={item.label} tabIndex={mode === item.id ? 0 : -1}
      onClick={() => onChange(item.id)} onKeyDown={(event) => {
        const next = event.key === "ArrowDown" ? (index + 1) % MANIPULATOR_FUNCTIONS.length
          : event.key === "ArrowUp" ? (index + MANIPULATOR_FUNCTIONS.length - 1) % MANIPULATOR_FUNCTIONS.length
          : event.key === "Home" ? 0 : event.key === "End" ? MANIPULATOR_FUNCTIONS.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        onChange(MANIPULATOR_FUNCTIONS[next].id);
        (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next])?.focus();
      }}><b>{item.prefix}</b><span>{item.label}</span></button>)}
  </div>;
}

export function ManipulatorService({ mode }: { mode: ManipulatorMode }) {
  const item = MANIPULATOR_FUNCTIONS.find((entry) => entry.id === mode) ?? MANIPULATOR_FUNCTIONS[0];
  const ready = mode === "voice-over" || mode === "voice-patch";
  const task = mode === "voice-dubber" ? "voice-dub" : mode === "voice-isolator" ? "voice-isolate" : mode;
  const [catalog, setCatalog] = useState<{ task: string; providers: TrainingModelOption[] }>({ task: "", providers: [] });
  const providers = catalog.task === task ? catalog.providers : [];
  useEffect(() => {
    let active = true;
    if (typeof api.getEngineCatalog !== "function") return;
    api.getEngineCatalog(task).then((options) => { if (active) setCatalog({ task, providers: options }); })
      .catch(() => { if (active) setCatalog({ task, providers: [] }); });
    return () => { active = false; };
  }, [task]);
  return <ModuleFrame title={item.label} index={item.prefix} eyebrow="CHỨC NĂNG" className="manipulator-service">
    {mode === "voice-over" ? <p>Tạo lời đọc từ Script. Chọn model voice cho từng câu; thiết lập giọng và timing ở cột này.</p>
      : mode === "voice-patch" ? <p>Chọn vùng cần sửa rồi dùng bảng Voice Patch bên dưới. Script và Timeline giữ nguyên khi chuyển chức năng.</p>
      : <p role="status">{item.label} chưa có bộ xử lý hoàn chỉnh. Có thể chuẩn bị Script và reference; chưa thể chạy chức năng này.</p>}
    {!ready ? <p className="manipulator-service__engines">{mode === "voice-dubber" || mode === "live-translate"
      ? "Dự kiến: OmniVoice / CosyVoice cho tạo giọng; Sokuji cho luồng dịch. Cần kết nối và kiểm tra từng bộ xử lý."
      : "Bộ tách giọng sẽ được bổ sung sau khi kiểm tra chất lượng trên audio thực."}</p> : null}
    {providers.length ? <ul className="manipulator-service__providers" aria-label={`Provider ${item.label}`}>
      {providers.map((provider) => <li key={provider.id}>
        <b>{provider.label}</b><span>{provider.available ? "Sẵn sàng" : provider.status}</span>
        {provider.capabilities ? <small>
          {provider.capabilities.languages.join(", ") || "Ngôn ngữ theo model"} · voice: {provider.capabilities.customVoiceFormat || "không"} · streaming {provider.capabilities.streamingInput ? "in" : "—"}/{provider.capabilities.streamingOutput ? "out" : "—"} · duration {provider.capabilities.nativeDuration ? "native" : "không"} · timing {provider.capabilities.wordTiming}
        </small> : null}
      </li>)}
    </ul> : null}
  </ModuleFrame>;
}
