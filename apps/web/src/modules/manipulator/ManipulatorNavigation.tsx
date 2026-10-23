import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
const ENGINE_LABELS: Record<string, string> = {
  omnivoice: "OmniVoice", vibevoice: "VibeVoice", cosyvoice3: "CosyVoice3",
  "f5-tts": "F5-TTS", vivoice: "ViVoice", indextts25: "IndexTTS 2.5", "fish-s2-pro": "Fish S2 Pro",
};

type EngineChoice = { engine: string; label: string; available: boolean; status?: string };

function GenerationEngineChoice({ choices, value, onChange }: { choices: EngineChoice[]; value: string | null; onChange: (engine: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const all = [{ engine: "auto", label: "Tự động · theo voice trong Script", available: true }, ...choices];
  const selected = all.find((choice) => choice.engine === (value ?? "auto")) ?? all[0];
  const label = (choice: EngineChoice) => `${choice.label}${choice.engine === "auto" ? "" : choice.available ? " · Sẵn sàng" : ` · ${choice.status ?? "Chưa sẵn sàng"}`}`;
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const height = Math.min(280, Math.max(80, (below >= 180 || below >= above ? below : above) - 8));
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), top: below >= 180 || below >= above ? rect.bottom + 2 : Math.max(8, rect.top - height - 2), width: rect.width, maxHeight: height });
    };
    const close = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) setOpen(false); };
    place();
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  function choose(engine: string) { onChange(engine === "auto" ? null : engine); setOpen(false); trigger.current?.focus(); }
  return <div className="manipulator-engine-picker">
    <button ref={trigger} type="button" role="combobox" aria-label="Engine tạo giọng" aria-controls="generation-engine-options" aria-expanded={open} aria-haspopup="listbox" className="manipulator-engine-picker__trigger" onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-engine="${selected.engine}"]`)?.focus()); }
    }}>{label(selected)}<span aria-hidden="true">⌄</span></button>
    {open ? createPortal(<div ref={list} id="generation-engine-options" className="manipulator-engine-picker__list" role="listbox" aria-label="Engine tạo giọng" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }} onKeyDown={(event) => {
      const options = Array.from(list.current?.querySelectorAll<HTMLElement>("[role='option']") ?? []);
      const index = options.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); options[(index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length]?.focus(); }
      else if (event.key === "Home" || event.key === "End") { event.preventDefault(); options[event.key === "Home" ? 0 : options.length - 1]?.focus(); }
    }}>
      {all.map((choice) => <button key={choice.engine} type="button" role="option" data-engine={choice.engine} aria-selected={selected.engine === choice.engine} className="manipulator-engine-picker__option" onClick={() => choose(choice.engine)}>{label(choice)}</button>)}
    </div>, document.body) : null}
  </div>;
}

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
      <GenerationEngineChoice choices={engineChoices} value={generationEngine} onChange={onGenerationEngineChange} />
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
