import type { ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface SpeakerIsolationProps {
  asset: ProjectMediaAsset | null;
  speakers: SpeakerProfile[];
  words: StudioWord[];
}

export function SpeakerIsolation({ asset, speakers, words }: SpeakerIsolationProps) {
  const assignedIds = new Set([
    ...(asset?.speakerProfileIds ?? []),
    ...words.map((word) => word.speakerId).filter((id): id is string => Boolean(id)),
  ]);
  const assigned = speakers.filter((speaker) => assignedIds.has(speaker.id));

  return (
    <ModuleFrame className="speaker-isolation-module" eyebrow="WHO SPOKE WHEN" title="Speaker Isolation">
      <div className="speaker-isolation-status">
        <span className="processor-state"><i />PROCESSOR REQUIRED</span>
        <p>Voice Isolation tách audio stem; Speaker Diarization xác định người nói theo thời gian.</p>
      </div>
      <div className="speaker-isolation-list">
        {assigned.map((speaker) => {
          const count = words.filter((word) => word.speakerId === speaker.id).length;
          return <div key={speaker.id}><i style={{ background: speaker.color }} /><b>{speaker.name}</b><span>{count} từ</span></div>;
        })}
        {!assigned.length ? <p>Chọn speaker cho footage trong Media Pool hoặc gán từng từ trong Script.</p> : null}
      </div>
      <button className="button button--quiet button--full" disabled type="button">Auto isolate & diarize</button>
    </ModuleFrame>
  );
}
