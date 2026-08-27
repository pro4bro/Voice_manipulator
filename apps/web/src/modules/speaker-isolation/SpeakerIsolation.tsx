import type { ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface SpeakerIsolationProps {
  asset: ProjectMediaAsset | null;
  speakers: SpeakerProfile[];
  words: StudioWord[];
}

function diarizationLabel(value: string) {
  const number = /(?:speaker|spk)[-_ ]?(\d+)$/iu.exec(value)?.[1];
  return number ? `Speaker ${number}` : value.replace(/[-_]+/gu, " ");
}

export function SpeakerIsolation({ asset, speakers, words }: SpeakerIsolationProps) {
  const groups = new Map<string, StudioWord[]>();
  for (const word of words) {
    const key = word.diarizationSpeakerId?.trim() || (word.speakerId ? `profile:${word.speakerId}` : "speaker-1");
    const group = groups.get(key) ?? [];
    group.push(word);
    groups.set(key, group);
  }

  return (
    <ModuleFrame className="speaker-isolation-module" eyebrow="WHO SPOKE WHEN" title="Speaker Diarization">
      <div className="speaker-isolation-status">
        <span className="processor-state"><i />PROCESSOR REQUIRED</span>
        <p>Luồng chuẩn: STT tạo timestamp từ → diarization gán Speaker 1/2 theo thời gian → map Speaker Profile. Isolation stem chỉ dùng khi có nói chồng hoặc nhiễu.</p>
      </div>
      <div className="speaker-isolation-list">
        {[...groups].map(([id, group]) => {
          const profile = speakers.find((speaker) => speaker.id === group.find((word) => word.speakerId)?.speakerId) ?? null;
          return <div key={id}><i style={{ background: profile?.color ?? "var(--text-muted)" }} /><b>{profile?.name ?? diarizationLabel(id)}</b><span>{group.length} từ</span></div>;
        })}
        {!groups.size ? <p>Chạy STT kỹ trước. Khi processor diarization sẵn sàng, Speaker 1/2 sẽ được map về từng word tại đây và trong bảng Script.</p> : null}
      </div>
      <button className="button button--quiet button--full" disabled type="button">STT → diarize → map Speaker</button>
    </ModuleFrame>
  );
}