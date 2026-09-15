import type { ProjectVoice, SpeakerProfile, TrainingModelOption, TrainingParameterSpec, TrainingParameterValue, VoiceChangerPreflight, VoiceChangerSettings, VoiceChangerStatus } from "../../domain/types";
import { VOICE_KIND_LABELS } from "../../domain/voiceScript";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { useParameterForm } from "../../ui/ParameterForm";
import { parameterProblem, parameterValue } from "../train/trainingModels";
import { meterFraction } from "./SoundReactor";

interface VoiceInputProps {
  engines: TrainingModelOption[];
  preflight: VoiceChangerPreflight | null;
  settings: VoiceChangerSettings;
  onSettingsChange: (settings: VoiceChangerSettings) => void;
  speakers: SpeakerProfile[];
  voices: ProjectVoice[];
  /** The Speaker Profile picked in Sound Library: whose voice to wear. */
  speakerId: string | null;
  status: VoiceChangerStatus | null;
  busy?: boolean;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
}

function ms(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value)} ms`;
}

/** What stops a start, in order; null when everything is set. */
export function startProblem(props: Pick<VoiceInputProps, "engines" | "preflight" | "settings"> & { speaker?: SpeakerProfile | null; hasVoice?: boolean }): string | null {
  const { engines, preflight, settings, speaker = null, hasVoice = false } = props;
  const engine = engines.find((item) => item.id === settings.engineId);
  if (!preflight) return "Đang kiểm tra thiết bị…";
  if (!preflight.runtimeReady) return "Chưa có runtime Voice Changer";
  if (!engine) return "Chọn engine đổi giọng";
  if (!engine.available) return `${engine.label} chưa sẵn sàng`;
  if (engine.engine !== "passthrough") {
    // Converting into someone's voice needs that person's recorded permission.
    if (!speaker || !hasVoice) return "Chọn giọng giả trong Sound Library";
    if (!speaker.voiceConsent) return `${speaker.name} chưa xác nhận đồng ý dùng giọng`;
  }
  if (settings.inputDevice === null) return "Chọn micro đầu vào";
  if (settings.virtualDevice === null && !(settings.monitor && settings.speakerDevice !== null)) return "Chọn micro ảo hoặc bật nghe qua loa";
  const overrides = settings.parameters[engine.id] ?? {};
  if (engine.parameters.some((spec) => parameterProblem(spec, parameterValue(spec, overrides)))) return "Tham số chưa hợp lệ";
  return null;
}

/**
 * The live input and where the converted voice goes. The microphone and the
 * outputs are this machine's devices, opened by the Voice Changer runtime;
 * the page only picks them.
 */
export function VoiceInput({ engines, preflight, settings, onSettingsChange, speakers, voices, speakerId, status, busy = false, onStart, onStop, onRefresh }: VoiceInputProps) {
  const running = status?.state === "running";
  const engine = engines.find((item) => item.id === settings.engineId) ?? null;
  const speaker = speakers.find((item) => item.id === speakerId) ?? null;
  // RVC wears a trained RVC model; the other engines imitate a reference clip.
  const speakerVoices = voices.filter((voice) => voice.speakerProfileId === speakerId && (engine?.engine === "rvc" ? voice.kind === "vc" : voice.kind !== "vc"));
  const voice = speakerVoices.find((item) => item.id === settings.voiceId) ?? speakerVoices[0] ?? null;
  const hostApis = [...new Set((preflight?.devices ?? []).map((device) => device.hostApi))];
  const hostApi = settings.hostApi && hostApis.includes(settings.hostApi) ? settings.hostApi : hostApis.includes("Windows WASAPI") ? "Windows WASAPI" : hostApis[0] ?? null;
  const listed = (preflight?.devices ?? []).filter((device) => !hostApi || device.hostApi === hostApi);
  const inputs = listed.filter((device) => device.maxInputChannels > 0);
  const outputs = listed.filter((device) => device.maxOutputChannels > 0);
  const virtualOutputs = [...outputs].sort((left, right) => Number(right.virtualCable) - Number(left.virtualCable));
  const overrides = engine ? settings.parameters[engine.id] ?? {} : {};
  const problem = running ? null : startProblem({ engines, preflight, settings, speaker, hasVoice: Boolean(voice) });

  function update(change: Partial<VoiceChangerSettings>) {
    onSettingsChange({ ...settings, ...change });
  }

  function setParameter(spec: TrainingParameterSpec, value: TrainingParameterValue) {
    if (!engine) return;
    const next = { ...overrides };
    if (value === spec.default) delete next[spec.key];
    else next[spec.key] = value;
    update({ parameters: { ...settings.parameters, [engine.id]: next } });
  }

  const form = useParameterForm({ scope: engine?.id ?? "none", specs: engine?.parameters ?? [], overrides, onChange: setParameter });
  const deviceLabel = (name: string, _hostApi: string) => name;

  return (
    <ModuleFrame className={`voice-input-module ${running ? "is-running" : ""}`} eyebrow="LIVE · NATIVE AUDIO" index="VI" title="Voice Input"
      action={<button aria-label="Kiểm tra lại thiết bị" className="button button--quiet voice-input__refresh" disabled={running} onClick={onRefresh} type="button"><Icon name="refresh" /></button>}>
      {preflight && !preflight.runtimeReady ? (
        <div className="voice-input__notice is-warning" role="status">
          <b>Chưa có runtime Voice Changer</b>
          <span>Cần một môi trường Python có {preflight.missing.join(", ") || "numpy, sounddevice"} để mở micro và loa trực tiếp. Việc cài cần anh duyệt vì phải tải gói.</span>
        </div>
      ) : null}
      {preflight?.deviceError ? <div className="voice-input__notice is-error" role="status">{preflight.deviceError}</div> : null}

      <section className="voice-input__section" aria-label="Giọng giả">
        <span className="voice-input__label">GIỌNG GIẢ</span>
        {speaker ? (
          <div className="voice-input__target">
            <i style={{ background: speaker.color }} />
            <b>{speaker.name} <small className={speaker.voiceConsent ? "voice-input__consent is-ok" : "voice-input__consent"}>{speaker.voiceConsent ? `✓ ${speaker.voiceConsent.grantedBy} đã đồng ý` : "chưa xác nhận đồng ý"}</small></b>
            {speakerVoices.length ? (
              <select aria-label="Mẫu giọng" disabled={running} onChange={(event) => update({ voiceId: event.target.value })} value={voice?.id ?? ""}>
                {speakerVoices.map((item) => <option key={item.id} value={item.id}>{VOICE_KIND_LABELS[item.kind]} · {item.referenceSeconds.toFixed(1)}s mẫu</option>)}
              </select>
            ) : <small>{engine?.engine === "rvc" ? "Chưa có model RVC; train “RVC · model đổi giọng” ở Voice Training." : "Chưa có mẫu giọng; tạo ở Voice Training (nhái giọng)."}</small>}
          </div>
        ) : <small className="voice-input__hint">Chọn một Speaker Profile trong Sound Library bên trái.</small>}
      </section>

      <label className="voice-input__field">
        <span className="voice-input__label">ENGINE</span>
        <select aria-label="Engine đổi giọng" disabled={running} onChange={(event) => update({ engineId: event.target.value })} value={engine?.id ?? ""}>
          <option value="" disabled>Chọn engine</option>
          {engines.map((item) => <option key={item.id} value={item.id}>{item.label}{item.available ? "" : " · chưa sẵn sàng"}</option>)}
        </select>
        {engine ? <small className={engine.available ? "voice-input__hint" : "voice-input__hint is-warning"}>{engine.available ? engine.description : engine.blockedReason ?? engine.status}</small> : null}
      </label>

      {hostApis.length > 1 ? (
        <label className="voice-input__field">
          <span className="voice-input__label">KIỂU THIẾT BỊ</span>
          <select aria-label="Kiểu thiết bị" disabled={running} onChange={(event) => update({ hostApi: event.target.value, inputDevice: null, virtualDevice: null, speakerDevice: null })} value={hostApi ?? ""}>
            {hostApis.map((name) => <option key={name} value={name}>{name}{name === "Windows WASAPI" ? " · trễ thấp nhất" : ""}</option>)}
          </select>
        </label>
      ) : null}

      <label className="voice-input__field">
        <span className="voice-input__label">VOICE INPUT · MICRO THẬT</span>
        <select aria-label="Micro đầu vào" disabled={running || !inputs.length} onChange={(event) => update({ inputDevice: event.target.value === "" ? null : Number(event.target.value) })} value={settings.inputDevice ?? ""}>
          <option value="">{inputs.length ? "Chọn micro" : "Chưa đọc được thiết bị"}</option>
          {inputs.map((device) => <option key={device.index} value={device.index}>{deviceLabel(device.name, device.hostApi)}</option>)}
        </select>
        <div aria-label="Mức micro" className="voice-input__meter" role="meter" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(Math.max(-60, status?.inputLevelDb ?? -120))}><i style={{ width: `${meterFraction(status?.inputLevelDb ?? -120) * 100}%` }} /></div>
      </label>

      <section className="voice-input__section" aria-label="Đầu ra">
        <span className="voice-input__label">ĐẦU RA</span>
        <label className="voice-input__field">
          <span>Micro ảo · cho ứng dụng khác</span>
          <select aria-label="Micro ảo" disabled={running || !outputs.length} onChange={(event) => update({ virtualDevice: event.target.value === "" ? null : Number(event.target.value) })} value={settings.virtualDevice ?? ""}>
            <option value="">Không dùng</option>
            {virtualOutputs.map((device) => <option key={device.index} value={device.index}>{device.virtualCable ? "★ " : ""}{deviceLabel(device.name, device.hostApi)}</option>)}
          </select>
          <small className="voice-input__hint">{preflight?.virtualCable
            ? "Đã có VB-Audio Virtual Cable: gửi vào loa của cáp (“Speakers (VB-Audio Virtual Cable)”), rồi trong Zoom, Discord, OBS chọn micro “CABLE Output”."
            : "Chưa thấy cáp âm thanh ảo. Cần cài VB-CABLE (driver, anh tự cài) để có micro ảo."}</small>
        </label>
        <label className="voice-input__field">
          <span>Speaker out · nghe lại</span>
          <select aria-label="Loa nghe lại" disabled={running || !outputs.length} onChange={(event) => update({ speakerDevice: event.target.value === "" ? null : Number(event.target.value) })} value={settings.speakerDevice ?? ""}>
            <option value="">Chọn loa / tai nghe</option>
            {outputs.filter((device) => !device.virtualCable).map((device) => <option key={device.index} value={device.index}>{deviceLabel(device.name, device.hostApi)}</option>)}
          </select>
        </label>
        <label className="voice-input__switch">
          <input checked={settings.monitor} disabled={running} onChange={(event) => update({ monitor: event.target.checked })} type="checkbox" />
          <span><b>Nghe giọng đã đổi qua loa</b><small>Mặc định tắt: tự nghe giọng mình bị trễ dễ làm nói vấp. Dùng tai nghe để micro không thu lại tiếng loa.</small></span>
        </label>
      </section>

      {engine ? (
        <section aria-label={`Tham số ${engine.label}`} className="train-engine-parameters voice-input__parameters">
          {form.basic}
          {form.advanced}
        </section>
      ) : null}

      <dl className="voice-input__stats" aria-label="Độ trễ và hụt âm">
        <div><dt>Xử lý</dt><dd>{ms(status?.algorithmicLatencyMs)}</dd></div>
        <div><dt>Thiết bị</dt><dd>{ms(status?.deviceLatencyMs)}</dd></div>
        <div><dt>Hụt âm</dt><dd className={(status?.underruns ?? 0) > 0 ? "is-warning" : ""}>{status?.underruns ?? 0}</dd></div>
      </dl>
      {status?.error ? <div className="voice-input__notice is-error" role="status">{status.error}</div> : null}
      {preflight?.gpuHolder && engine && engine.engine !== "passthrough" ? <small className="voice-input__hint is-warning">GPU đang được {preflight.gpuHolder} dùng.</small> : null}

      {running ? (
        <button className="button button--full voice-input__stop" disabled={busy} onClick={onStop} type="button"><Icon name="pause" />Dừng đổi giọng</button>
      ) : (
        <button className="button button--accent button--full" disabled={busy || Boolean(problem)} onClick={onStart} type="button"><Icon name="mic" />{busy ? "Đang mở thiết bị…" : problem ?? "Bắt đầu đổi giọng"}</button>
      )}
    </ModuleFrame>
  );
}
