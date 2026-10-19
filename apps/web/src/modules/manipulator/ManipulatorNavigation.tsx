import { useEffect, useState } from "react";
import { api, type SokujiRuntimeStatus, type SokujiTranslateModel } from "../../api/client";
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
const ENGINE_LABELS: Record<string, string> = { omnivoice: "OmniVoice", vibevoice: "VibeVoice", cosyvoice3: "CosyVoice3" };

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

export function ManipulatorService({ mode, voiceGenerators = [], generationEngine = null, onGenerationEngineChange }: {
  mode: ManipulatorMode;
  voiceGenerators?: TrainingModelOption[];
  generationEngine?: string | null;
  onGenerationEngineChange?: (engine: string | null) => void;
}) {
  const item = MANIPULATOR_FUNCTIONS.find((entry) => entry.id === mode) ?? MANIPULATOR_FUNCTIONS[0];
  const ready = mode === "voice-over" || mode === "voice-patch";
  const task = mode === "voice-dubber" ? "voice-dub" : mode === "voice-isolator" ? "voice-isolate" : mode;
  const [catalog, setCatalog] = useState<{ task: string; providers: TrainingModelOption[] }>({ task: "", providers: [] });
  const [providerChoices, setProviderChoices] = useState<Partial<Record<ManipulatorMode, string>>>({});
  const [sokujiStatus, setSokujiStatus] = useState<SokujiRuntimeStatus | null>(null);
  const [sokujiModels, setSokujiModels] = useState<SokujiTranslateModel[]>([]);
  const [sokujiModelId, setSokujiModelId] = useState("");
  const [sokujiBusy, setSokujiBusy] = useState(false);
  const [sokujiError, setSokujiError] = useState<string | null>(null);
  const taskProviders = catalog.task === task ? catalog.providers : [];
  const providers = mode === "voice-over" && voiceGenerators.length ? voiceGenerators : taskProviders;
  const engineChoices = [...new Map(voiceGenerators.map((provider) => [provider.engine, voiceGenerators.filter((item) => item.engine === provider.engine)])).entries()]
    .map(([engine, options]) => ({ engine, label: (ENGINE_LABELS[engine] ?? options.find((item) => item.available)?.family) || options[0].family || engine,
      available: options.some((item) => item.available), status: options.find((item) => item.available)?.status ?? options[0].status }));
  const selectedProvider = providers.find((provider) => provider.id === providerChoices[mode]) ?? providers[0];
  const hasSokujiProvider = mode === "live-translate" && selectedProvider?.id === "sokuji-live-translate";
  useEffect(() => {
    let active = true;
    if (typeof api.getEngineCatalog !== "function") return;
    api.getEngineCatalog(task).then((options) => { if (active) setCatalog({ task, providers: options }); })
      .catch(() => { if (active) setCatalog({ task, providers: [] }); });
    return () => { active = false; };
  }, [task]);
  useEffect(() => {
    let active = true;
    if (!hasSokujiProvider) return () => { active = false; };
    setSokujiStatus(null);
    setSokujiModels([]);
    setSokujiModelId("");
    setSokujiError(null);
    void api.getSokujiHealth().then(async (status) => {
      if (!active) return;
      setSokujiStatus(status);
      if (status.installed && status.running) {
        try {
          const result = await api.getSokujiTranslateCatalog();
          if (!active) return;
          setSokujiStatus(result);
          setSokujiModels(result.models);
        } catch (error) {
          if (active) setSokujiError(error instanceof Error ? error.message : "Không đọc được catalog dịch của Sokuji.");
        }
      }
    }).catch((error) => {
      if (active) setSokujiError(error instanceof Error ? error.message : "Không kiểm tra được Runtime Sokuji.");
    });
    return () => { active = false; };
  }, [hasSokujiProvider]);

  async function connectSokuji() {
    setSokujiBusy(true);
    setSokujiError(null);
    setSokujiModels([]);
    setSokujiModelId("");
    try {
      const status = await api.startSokuji();
      setSokujiStatus(status);
      if (!status.installed || !status.running) {
        setSokujiError(status.reason ?? "Runtime Sokuji chưa sẵn sàng.");
        return;
      }
      const result = await api.getSokujiTranslateCatalog();
      setSokujiStatus(result);
      setSokujiModels(result.models);
      if (!result.installed || !result.running) setSokujiError(result.reason ?? "Runtime Sokuji đã ngắt trước khi đọc catalog.");
    } catch (error) {
      setSokujiError(error instanceof Error ? error.message : "Không kết nối được Runtime Sokuji.");
    } finally { setSokujiBusy(false); }
  }

  async function disconnectSokuji() {
    setSokujiBusy(true);
    setSokujiError(null);
    try {
      const status = await api.stopSokuji();
      setSokujiStatus(status);
      setSokujiModels([]);
      setSokujiModelId("");
    } catch (error) {
      setSokujiError(error instanceof Error ? error.message : "Không ngắt được Runtime Sokuji.");
    } finally { setSokujiBusy(false); }
  }
  return <ModuleFrame title={item.label} index={item.prefix} eyebrow="CHỨC NĂNG" className="manipulator-service">
    {mode === "voice-over" ? <p>Tạo lời đọc từ Script. Chọn model voice cho từng câu; thiết lập giọng và timing ở cột này.</p>
      : mode === "voice-patch" ? <p>Chọn vùng cần sửa rồi dùng bảng Voice Patch bên dưới. Script và Timeline giữ nguyên khi chuyển chức năng.</p>
      : <p role="status">{item.label} chưa có bộ xử lý hoàn chỉnh. Có thể chuẩn bị Script và reference; chưa thể chạy chức năng này.</p>}
    {!ready ? <p className="manipulator-service__engines">{mode === "voice-dubber" || mode === "live-translate"
      ? "Dự kiến: OmniVoice / CosyVoice cho tạo giọng; Sokuji cho luồng dịch. Cần kết nối và kiểm tra từng bộ xử lý."
      : "Bộ tách giọng sẽ được bổ sung sau khi kiểm tra chất lượng trên audio thực."}</p> : null}
    {mode === "voice-over" && engineChoices.length && onGenerationEngineChange ? <label className="manipulator-service__engine-choice">
      <span>Engine tạo giọng</span>
      <select aria-label="Engine tạo giọng" value={generationEngine ?? "auto"} onChange={(event) => onGenerationEngineChange(event.target.value === "auto" ? null : event.target.value)}>
        <option value="auto">Tự động · theo voice trong Script</option>
        {engineChoices.map((choice) => <option disabled={!choice.available} key={choice.engine} value={choice.engine}>{choice.label}{choice.available ? " · Sẵn sàng" : ` · ${choice.status}`}</option>)}
      </select>
    </label> : null}
    {!ready && providers.length ? <label className="manipulator-service__engine-choice">
      <span>Bộ xử lý {item.label}</span>
      <select aria-label={`Bộ xử lý ${item.label}`} value={selectedProvider?.id ?? ""}
        onChange={(event) => setProviderChoices((current) => ({ ...current, [mode]: event.target.value }))}>
        {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label} · {provider.available ? "Sẵn sàng" : "Chưa sẵn sàng"}</option>)}
      </select>
      <small>Chọn để xem khả năng và trạng thái; chức năng chỉ chạy khi các bộ xử lý cần thiết đã sẵn sàng.</small>
    </label> : null}
    {providers.length ? <ul className="manipulator-service__providers" aria-label={`Provider ${item.label}`}>
      {providers.map((provider) => <li key={provider.id}>
        <b>{provider.label}</b><span>{provider.available ? "Sẵn sàng" : provider.status}</span>
        {provider.capabilities ? <small>
          {provider.capabilities.languages.join(", ") || "Ngôn ngữ theo model"} · voice: {provider.capabilities.customVoiceFormat || "không"} · streaming {provider.capabilities.streamingInput ? "in" : "—"}/{provider.capabilities.streamingOutput ? "out" : "—"} · duration {provider.capabilities.nativeDuration ? "native" : "không"} · timing {provider.capabilities.wordTiming}
        </small> : null}
      </li>)}
    </ul> : null}
    {hasSokujiProvider ? <section aria-label="Runtime Sokuji" className="manipulator-service__sokuji">
      <b>Runtime Sokuji</b>
      <span role="status">{sokujiStatus?.running ? `Đang chạy${sokujiStatus.port ? ` · cổng ${sokujiStatus.port}` : ""}` : sokujiStatus?.installed ? "Đã cài · đang dừng" : sokujiStatus ? `Chưa sẵn sàng${sokujiStatus.reason ? ` · ${sokujiStatus.reason}` : ""}` : "Chưa kết nối"}</span>
      <div className="manipulator-service__sokuji-actions">
        <button className="button button--quiet" disabled={sokujiBusy} onClick={() => void connectSokuji()} type="button">{sokujiBusy ? "Đang kết nối…" : "Kết nối Sokuji"}</button>
        {sokujiStatus?.running ? <button className="button button--quiet" disabled={sokujiBusy} onClick={() => void disconnectSokuji()} type="button">Ngắt Sokuji</button> : null}
      </div>
      <label>Model dịch<select aria-label="Model dịch" disabled={!sokujiStatus?.running || !sokujiModels.length} onChange={(event) => setSokujiModelId(event.target.value)} value={sokujiModelId}>
        <option value="">{sokujiModels.length ? "Chọn model…" : "Catalog chưa có model"}</option>
        {sokujiModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}
      </select></label>
      <small>Chỉ đọc model catalog; luồng dịch chưa được nối.</small>
      {sokujiError ? <p className="manipulator-service__sokuji-error" role="alert">{sokujiError}</p> : null}
    </section> : null}
  </ModuleFrame>;
}
