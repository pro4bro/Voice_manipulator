import { ModuleFrame } from "../../ui/ModuleFrame";
import type { ProjectMediaAsset, SpeakerProfile } from "../../domain/types";

interface TrainingJobProps {
  assets: ProjectMediaAsset[];
  speakers: SpeakerProfile[];
}

export function TrainingJob({ assets, speakers }: TrainingJobProps) {
  const selected = assets.filter((asset) => asset.trainingSelected && asset.status !== "no-audio");
  const duration = selected.reduce((total, asset) => total + asset.duration, 0);
  const withScript = selected.filter((asset) => asset.text.trim()).length;
  const readiness = selected.length ? Math.round((withScript / selected.length) * 100) : 0;
  const assignedSpeakerIds = new Set(selected.flatMap((asset) => asset.speakerProfileIds));
  const assignedSpeakers = speakers.filter((speaker) => assignedSpeakerIds.has(speaker.id));
  return (
    <ModuleFrame eyebrow="TRAINING JOB" title="Dataset readiness" className="training-job-module" tone="warm">
      <div className="training-score">
        <div><strong>{readiness}</strong><span>/100</span></div>
        <p><b>{selected.length ? `${withScript}/${selected.length} footage có script` : "Chưa nhận footage"}</b><span>{(duration / 60).toFixed(1)} phút · {assignedSpeakers.length} speaker</span></p>
      </div>
      <ol className="training-stages">
        <li className={selected.length ? "is-ready" : ""}><i />Training sources <span>{selected.length || "WAITING"}</span></li>
        <li className={selected.length && withScript === selected.length ? "is-ready" : selected.length ? "is-active" : ""}><i />Transcript review <span>{selected.length ? `${selected.length - withScript} OPEN` : "WAITING"}</span></li>
        <li className={assignedSpeakers.length ? "is-ready" : ""}><i />Speaker mapping <span>{assignedSpeakers.length ? assignedSpeakers.map((speaker) => speaker.name).join(", ") : "WAITING"}</span></li>
        <li><i />Tokenize dataset <span>WAITING</span></li>
        <li><i />Fine-tune checkpoint <span>WAITING</span></li>
      </ol>
      <button className="button button--accent button--full" disabled type="button">Bắt đầu training</button>
    </ModuleFrame>
  );
}
