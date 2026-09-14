import type { ProjectVoice, SpeakerProfile, TrainingModelOption, TrainingParameterSpec, TrainingParameterValue } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { useParameterForm } from "../../ui/ParameterForm";

interface VoiceGeneratorProps {
  projectId: string;
  generators: TrainingModelOption[];
  generatorId: string | null;
  onGeneratorChange: (generatorId: string) => void;
  voices: ProjectVoice[];
  speakers: SpeakerProfile[];
  voiceId: string | null;
  onVoiceChange: (voiceId: string) => void;
  parameters: Record<string, TrainingParameterValue>;
  onParametersChange: (parameters: Record<string, TrainingParameterValue>) => void;
  scriptLength: number;
  busy?: boolean;
  onGenerate: () => void;
  onOpenTraining?: () => void;
}

/** Control Rack owns reading speed; showing it twice would give two answers. */
const OWNED_ELSEWHERE = new Set(["speed"]);

const KIND_LABELS: Record<ProjectVoice["kind"], string> = {
  clone: "Nhái giọng",
  lora: "LoRA đã train",
};

export function VoiceGenerator({
  projectId,
  generators,
  generatorId,
  onGeneratorChange,
  voices,
  speakers,
  voiceId,
  onVoiceChange,
  parameters,
  onParametersChange,
  scriptLength,
  busy = false,
  onGenerate,
  onOpenTraining,
}: VoiceGeneratorProps) {
  const generator = generators.find((item) => item.id === generatorId) ?? generators.find((item) => item.available) ?? generators[0] ?? null;
  const usable = generator ? voices.filter((voice) => voice.engine === generator.engine) : [];
  const voice = usable.find((item) => item.id === voiceId) ?? usable[0] ?? null;
  const specs = (generator?.parameters ?? []).filter((spec) => !OWNED_ELSEWHERE.has(spec.key));
  const speakerOf = (id: string) => speakers.find((speaker) => speaker.id === id);

  function setParameter(spec: TrainingParameterSpec, value: TrainingParameterValue) {
    const next = { ...parameters };
    if (value === spec.default) delete next[spec.key];
    else next[spec.key] = value;
    onParametersChange(next);
  }

  const form = useParameterForm({ scope: generator?.id ?? "none", specs, overrides: parameters, onChange: setParameter });
  const bySpeaker = usable.reduce<Array<[string, ProjectVoice[]]>>((groups, item) => {
    const group = groups.find(([id]) => id === item.speakerProfileId);
    if (group) group[1].push(item);
    else groups.push([item.speakerProfileId, [item]]);
    return groups;
  }, []);

  const ready = Boolean(generator?.available && voice && scriptLength > 0 && !form.problems.length && !busy);
  const label = !generator
    ? "Chưa có công cụ tạo giọng"
    : !generator.available
      ? "Công cụ này chưa sẵn sàng"
      : !voice
        ? "Chưa có voice nào"
        : !scriptLength
          ? "Nhập text vào Script trước"
          : form.problems.length
            ? "Tham số chưa hợp lệ"
            : busy
              ? "Đang đọc..."
              : `Đọc Script bằng ${voice.name}`;

  return (
    <ModuleFrame className="voice-generator-module" eyebrow="VOICE GENERATOR" index="01" title="Tạo giọng">
      <label className="voice-generator-field">
        <span>CÔNG CỤ</span>
        <select aria-label="Công cụ tạo giọng" onChange={(event) => onGeneratorChange(event.target.value)} value={generator?.id ?? ""}>
          {generators.map((item) => <option key={item.id} value={item.id}>{item.label}{item.available ? "" : " · chưa sẵn sàng"}</option>)}
        </select>
        {generator && !generator.available ? <small className="voice-generator-warning">{generator.status}</small> : null}
      </label>

      {voice ? (
        <>
          <label className="voice-generator-field">
            <span>VOICE</span>
            <select aria-label="Voice" onChange={(event) => onVoiceChange(event.target.value)} value={voice.id}>
              {bySpeaker.map(([speakerId, items]) => (
                <optgroup key={speakerId} label={speakerOf(speakerId)?.name ?? speakerId}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>{KIND_LABELS[item.kind]} · {item.referenceSeconds.toFixed(1)}s · {new Date(item.createdAt).toLocaleDateString("vi-VN")}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <figure className="voice-generator-reference">
            <figcaption>
              <i style={{ background: speakerOf(voice.speakerProfileId)?.color }} />
              <b>{speakerOf(voice.speakerProfileId)?.name ?? voice.name}</b>
              <em>{KIND_LABELS[voice.kind]}</em>
            </figcaption>
            <blockquote>{voice.referenceText}</blockquote>
            <audio aria-label="Nghe giọng mẫu" controls preload="none" src={`/api/projects/${projectId}/voices/${voice.id}/reference`} />
          </figure>
        </>
      ) : (
        <div className="voice-generator-empty">
          <Icon name="person" />
          <b>Chưa có voice</b>
          <span>Ở Voice Training, chọn "OmniVoice · Nhái giọng (không train)" hoặc một model train, tick Speaker Profile rồi bấm Bắt đầu.</span>
          {onOpenTraining ? <button className="button button--quiet" onClick={onOpenTraining} type="button">Mở Voice Training</button> : null}
        </div>
      )}

      {generator ? (
        <section aria-label={`Tham số ${generator.label}`} className="train-engine-parameters voice-generator-parameters">
          {form.basic}
          {form.advanced}
          <small className="train-parameter-note">Text lấy từ Script ở giữa · tốc độ lấy từ Control Rack.</small>
        </section>
      ) : null}

      <button className="button button--accent button--full" disabled={!ready} onClick={onGenerate} type="button">
        <Icon name="spark" />{label}
      </button>
    </ModuleFrame>
  );
}
