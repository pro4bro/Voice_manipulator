import type { ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface SpeakerIsolationProps {
  asset: ProjectMediaAsset | null;
  onRun: () => void;
  onAssign: (assignments: Record<string, string | null>) => void;
  speakers: SpeakerProfile[];
  words: StudioWord[];
}

function diarizationLabel(value: string) {
  const number = /(?:speaker|spk)[-_ ]?(\d+)$/iu.exec(value)?.[1];
  return number ? `Speaker ${number}` : value.replace(/[-_]+/gu, " ");
}

function orderedDiarizationLabels(words: StudioWord[]) {
  return [...new Set(words.map((word) => word.diarizationSpeakerId?.trim()).filter((id): id is string => Boolean(id)))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
}

export function SpeakerIsolation({ asset, onRun, onAssign, speakers, words }: SpeakerIsolationProps) {
  const status = asset?.diarizationStatus ?? "idle";
  const isBusy = status === "queued" || status === "processing";
  const diarizedWords = asset?.words ?? words;
  const labels = orderedDiarizationLabels(diarizedWords);
  const assignments = asset?.diarizationSpeakerAssignments ?? {};
  const expectedCount = labels.length || speakers.length;
  const processorLabel = status === "complete" ? "DIARIZATION COMPLETE" : isBusy ? `PROCESSING ${Math.round(asset?.diarizationProgress ?? 0)}%` : status === "requires-setup" ? "SETUP REQUIRED" : status === "error" ? "PROCESSOR ERROR" : "READY AFTER STT";

  return (
    <ModuleFrame className="speaker-isolation-module" eyebrow="WHO SPOKE WHEN" title="Speaker Diarization">
      <div className="speaker-isolation-status">
        <span className={`processor-state ${status === "complete" ? "is-ready" : status === "error" || status === "requires-setup" ? "is-error" : ""}`}><i />{processorLabel}</span>
        <p>Đã nhận diện <b>{expectedCount || "Auto"}</b> speaker. Chọn người tương ứng cho từng nhãn máy ở đây; Script vẫn cho phép sửa lại theo row hoặc từng word.</p>
        {asset?.diarizationError ? <small>{asset.diarizationError}</small> : null}
      </div>
      <div className="speaker-isolation-list">
        {labels.map((label) => <div className="speaker-isolation-assignment" key={label}>
          <i style={{ background: speakers.find((speaker) => speaker.id === assignments[label])?.color ?? "var(--text-muted)" }} />
          <div><b>{diarizationLabel(label)}</b><span>{diarizedWords.filter((word) => word.diarizationSpeakerId === label).length} từ · nhãn máy</span></div>
          <select aria-label={`Gán ${diarizationLabel(label)} vào Speaker Profile`} onChange={(event) => onAssign({ ...assignments, [label]: event.currentTarget.value || null })} value={assignments[label] ?? ""}>
            <option value="">Chưa gán Profile</option>
            {speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}
          </select>
        </div>)}
        {!labels.length ? <p>{speakers.length ? "Chạy Nhận diện Speaker để tạo các nhãn Speaker 1, Speaker 2… rồi map từng nhãn vào Profile." : "Chưa có Speaker Profile hoặc nhãn diarization. Tạo Profile trong Sound Library rồi chạy Nhận diện Speaker."}</p> : null}
      </div>
      {diarizedWords.length ? <p className="speaker-isolation-empty">Mapping ở đây là mặc định ban đầu cho cả nhãn máy. Bật BẢNG SCRIPT để đổi một row hoặc kéo từng word sang row khác; timestamp subtitle không đổi.</p> : null}
      <button className="button button--quiet button--full" disabled={!asset || isBusy} onClick={onRun} type="button">{isBusy ? "Đang nhận diện speaker..." : "Nhận diện Speaker"}</button>
    </ModuleFrame>
  );
}
