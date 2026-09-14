import type { ProjectVoice, SpeakerProfile, TrainingModelOption, TrainingParameterSpec, TrainingParameterValue, VoiceScriptJob, VoiceScriptRow } from "../../domain/types";
import { VOICE_KIND_LABELS, resolveRowVoice, scriptReadiness, type VoiceCategory } from "../../domain/voiceScript";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { useParameterForm } from "../../ui/ParameterForm";
import { parameterProblem, parameterValue } from "../train/trainingModels";

interface VoiceGeneratorProps {
  projectId: string;
  generators: TrainingModelOption[];
  /** The kind chosen in Voice Training; Script rows may only use voices of it. */
  category: VoiceCategory;
  voices: ProjectVoice[];
  rows: VoiceScriptRow[];
  speakers: SpeakerProfile[];
  /** Generation values keyed by generator id. */
  parameters: Record<string, Record<string, TrainingParameterValue>>;
  onParametersChange: (generatorId: string, parameters: Record<string, TrainingParameterValue>) => void;
  job?: VoiceScriptJob | null;
  busy?: boolean;
  onGenerate: () => void;
  onOpenTraining?: () => void;
}

/** Control Rack owns reading speed; showing it twice would give two answers. */
export const OWNED_ELSEWHERE = new Set(["speed"]);

const CATEGORY_LABELS: Record<VoiceCategory, string> = { clone: "Nhái giọng", train: "Train giọng" };
const ENGINE_LABELS: Record<string, string> = { omnivoice: "OmniVoice", vibevoice: "VibeVoice" };

/** The generator that speaks voices of an engine: the first that can run, else the first. */
export function generatorForEngine(generators: TrainingModelOption[], engine: string): TrainingModelOption | null {
  const matching = generators.filter((item) => item.engine === engine);
  return matching.find((item) => item.available) ?? matching[0] ?? null;
}

function editableSpecs(generator: TrainingModelOption) {
  return generator.parameters.filter((spec) => !OWNED_ELSEWHERE.has(spec.key));
}

export function generatorProblems(generator: TrainingModelOption, overrides: Record<string, TrainingParameterValue>) {
  return editableSpecs(generator).flatMap((spec) => {
    const problem = parameterProblem(spec, parameterValue(spec, overrides));
    return problem ? [[spec.key, problem] as const] : [];
  });
}

function GeneratorSection({ generator, overrides, onChange }: { generator: TrainingModelOption; overrides: Record<string, TrainingParameterValue>; onChange: (next: Record<string, TrainingParameterValue>) => void }) {
  function setParameter(spec: TrainingParameterSpec, value: TrainingParameterValue) {
    const next = { ...overrides };
    if (value === spec.default) delete next[spec.key];
    else next[spec.key] = value;
    onChange(next);
  }
  const form = useParameterForm({ scope: generator.id, specs: editableSpecs(generator), overrides, onChange: setParameter });
  return (
    <section aria-label={`Tham số ${generator.label}`} className="train-engine-parameters voice-generator-parameters">
      <div className="train-section-label"><b>{generator.label}</b></div>
      {!generator.available ? <small className="voice-generator-warning">{generator.status}</small> : null}
      {form.basic}
      {form.advanced}
    </section>
  );
}

/**
 * Settings and the read button for the Script. Who reads each row is picked in
 * the Script itself; this panel shows which voices that adds up to, the
 * settings of each engine involved, and how far a read has got.
 */
export function VoiceGenerator({ projectId, generators, category, voices, rows, speakers, parameters, onParametersChange, job = null, busy = false, onGenerate, onOpenTraining }: VoiceGeneratorProps) {
  const speakerOf = (id: string) => speakers.find((speaker) => speaker.id === id);
  const readiness = scriptReadiness(rows, voices);
  const used = new Map<string, { voice: ProjectVoice; rows: number }>();
  for (const row of rows) {
    const voice = row.text.trim() ? resolveRowVoice(row, voices) : null;
    if (!voice) continue;
    const entry = used.get(voice.id) ?? { voice, rows: 0 };
    entry.rows += 1;
    used.set(voice.id, entry);
  }
  const engines = [...new Set((used.size ? [...used.values()].map((entry) => entry.voice) : voices).map((voice) => voice.engine))];
  const sections = engines.map((engine) => generatorForEngine(generators, engine)).filter((item): item is TrainingModelOption => Boolean(item));
  const unavailable = sections.find((generator) => [...used.values()].some((entry) => entry.voice.engine === generator.engine) && !generator.available);
  const invalid = sections.some((generator) => generatorProblems(generator, parameters[generator.id] ?? {}).length);
  const missingEngine = [...used.values()].find((entry) => !generatorForEngine(generators, entry.voice.engine));

  const ready = !busy && !readiness.problem && !unavailable && !invalid && !missingEngine;
  const label = busy
    ? job ? `Đang đọc ${Math.min(job.done + 1, job.total)}/${job.total}...` : "Đang gửi..."
    : readiness.problem
      ?? (missingEngine ? `Chưa có công cụ đọc voice ${ENGINE_LABELS[missingEngine.voice.engine] ?? missingEngine.voice.engine}` : null)
      ?? (unavailable ? `${unavailable.label} chưa sẵn sàng` : null)
      ?? (invalid ? "Tham số chưa hợp lệ" : `Đọc Script · ${readiness.rows.length} đoạn`);

  return (
    <ModuleFrame className="voice-generator-module" eyebrow="VOICE GENERATOR" index="01" title="Tạo giọng">
      <div className={`voice-generator-category is-${category}`}>
        <span>DẠNG VOICE</span>
        <b>{CATEGORY_LABELS[category]}</b>
        <small>Theo lựa chọn ở Voice Training</small>
        {onOpenTraining ? <button className="button button--quiet" onClick={onOpenTraining} type="button">Đổi</button> : null}
      </div>

      {used.size ? (
        <ul aria-label="Voice trong Script" className="voice-generator-cast">
          {[...used.values()].map(({ voice, rows: count }) => {
            const speaker = speakerOf(voice.speakerProfileId);
            return (
              <li key={voice.id}>
                <i style={{ background: speaker?.color }} />
                <span>
                  <b>{speaker?.name ?? voice.name}</b>
                  <small>{VOICE_KIND_LABELS[voice.kind]} · {ENGINE_LABELS[voice.engine] ?? voice.engine} · {count} đoạn</small>
                </span>
                <audio aria-label={`Nghe giọng mẫu ${speaker?.name ?? voice.name}`} controls preload="none" src={`/api/projects/${projectId}/voices/${voice.id}/reference`} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="voice-generator-empty">
          <Icon name="person" />
          <b>{voices.length ? "Chưa chọn voice trong Script" : `Chưa có voice dạng ${CATEGORY_LABELS[category].toLowerCase()}`}</b>
          <span>{voices.length ? "Bấm vào ô Speaker của từng dòng Script để chọn voice đọc dòng đó." : "Ở Voice Training, chọn dạng voice, tick Speaker Profile rồi bấm Bắt đầu."}</span>
          {!voices.length && onOpenTraining ? <button className="button button--quiet" onClick={onOpenTraining} type="button">Mở Voice Training</button> : null}
        </div>
      )}

      {sections.map((generator) => (
        <GeneratorSection generator={generator} key={generator.id} onChange={(next) => onParametersChange(generator.id, next)} overrides={parameters[generator.id] ?? {}} />
      ))}
      {sections.length ? <small className="train-parameter-note">Text lấy từ Script ở giữa · tốc độ lấy từ Control Rack.</small> : null}

      {job && (busy || job.status === "failed") ? (
        <div className={`voice-generator-progress ${job.status === "failed" ? "is-failed" : ""}`} role="status">
          <div aria-label="Tiến trình đọc Script" aria-valuemax={job.total} aria-valuemin={0} aria-valuenow={job.done} className="training-target__bar" role="progressbar"><i style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} /></div>
          <small>{job.status === "failed" ? job.error : job.message ?? "Đang chuẩn bị..."}{job.reused ? ` · ${job.reused} đoạn dùng lại` : ""}</small>
        </div>
      ) : null}

      <button className="button button--accent button--full" disabled={!ready} onClick={onGenerate} type="button">
        <Icon name="spark" />{label}
      </button>
    </ModuleFrame>
  );
}
