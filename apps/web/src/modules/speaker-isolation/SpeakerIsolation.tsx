import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { reconcileListSelection, selectAllListItems, selectListItem, type ListSelection } from "../../domain/listSelection";
import type { ProjectMediaAsset, SpeakerProfile, StudioWord } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { TaskStop, type TaskStopHandler } from "../../ui/TaskStop";

interface SpeakerIsolationProps {
  asset: ProjectMediaAsset | null;
  onRun: () => void;
  onStop?: TaskStopHandler;
  batchBusy?: boolean;
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

export function SpeakerIsolation({ asset, onRun, onStop, batchBusy = false, onAssign, speakers, words }: SpeakerIsolationProps) {
  const [selection, setSelection] = useState<ListSelection>({ ids: [], anchorId: null });
  const [showRunNotice, setShowRunNotice] = useState(false);
  const status = asset?.diarizationStatus ?? "idle";
  const isBusy = status === "queued" || status === "processing";
  const diarizedWords = asset?.words ?? words;
  const labels = orderedDiarizationLabels(diarizedWords);
  const selectedLabels = reconcileListSelection(selection, labels).ids;
  const assignments = asset?.diarizationSpeakerAssignments ?? {};
  const expectedCount = labels.length || speakers.length;
  const processorLabel = status === "complete" ? "DIARIZATION COMPLETE" : isBusy ? `PROCESSING ${Math.round(asset?.diarizationProgress ?? 0)}%` : status === "requires-setup" ? "SETUP REQUIRED" : status === "error" ? "PROCESSOR ERROR" : "READY AFTER STT";

  function selectLabel(event: MouseEvent<HTMLButtonElement>, label: string) {
    setSelection((current) => selectListItem(current, labels, label, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
  }

  function selectAll(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !(event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) {
      event.preventDefault();
      setSelection((current) => selectAllListItems(current, labels));
    }
  }

  return (
    <ModuleFrame className="speaker-isolation-module" eyebrow="WHO SPOKE WHEN" title="Speaker Diarization">
      <div className="speaker-isolation-status">
        <span className={`processor-state ${status === "complete" ? "is-ready" : status === "error" || status === "requires-setup" ? "is-error" : ""}`}><i />{processorLabel}</span>
        <p>Đã nhận diện <b>{expectedCount || "Auto"}</b> speaker. Chọn người tương ứng cho từng nhãn máy ở đây; Script vẫn cho phép sửa lại theo row hoặc từng word.</p>
        {asset?.diarizationError ? <small>{asset.diarizationError}</small> : null}
      </div>
      <div aria-label="Danh sách nhãn Speaker" className="speaker-isolation-list" onKeyDown={selectAll} role="region" tabIndex={0}>
        {selectedLabels.length ? <div className="speaker-isolation-bulk-actions"><b>{selectedLabels.length} nhãn đã chọn</b><select aria-label="Gán profile cho nhãn đã chọn" onChange={(event) => {
          if (event.target.value === "__choose__") return;
          const profileId = event.target.value === "__none__" ? null : event.target.value;
          onAssign({ ...assignments, ...Object.fromEntries(selectedLabels.map((label) => [label, profileId])) });
        }} value="__choose__"><option value="__choose__">Gán cùng profile…</option><option value="__none__">Bỏ gán</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select><button onClick={() => setSelection({ ids: [], anchorId: null })} type="button">Bỏ chọn</button></div> : null}
        {labels.map((label) => <div className="speaker-isolation-assignment" key={label}>
          <button aria-label={`Chọn ${diarizationLabel(label)}`} aria-pressed={selectedLabels.includes(label)} className="speaker-isolation-select" onClick={(event) => selectLabel(event, label)} type="button">{selectedLabels.includes(label) ? "✓" : "□"}</button>
          <i style={{ background: speakers.find((speaker) => speaker.id === assignments[label])?.color ?? "var(--text-muted)" }} />
          <div><b>{diarizationLabel(label)}</b><span>{diarizedWords.filter((word) => word.diarizationSpeakerId === label).length} từ · nhãn máy</span></div>
          <select aria-label={`Gán ${diarizationLabel(label)} vào Speaker Profile`} onChange={(event) => onAssign({ ...assignments, [label]: event.currentTarget.value || null })} value={assignments[label] ?? ""}>
            <option value="">Chưa gán Profile</option>
            {speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}
          </select>
        </div>)}
        {!labels.length ? <p>{speakers.length ? "Chạy Nhận diện Speaker để tạo các nhãn Speaker 1, Speaker 2… rồi map từng nhãn vào Profile." : "Chưa có Speaker Profile hoặc nhãn diarization. Tạo Profile trong Sound Library rồi chạy Nhận diện Speaker."}</p> : null}
      </div>
      {diarizedWords.length ? <p className="speaker-isolation-empty">Mapping ở đây là mặc định ban đầu cho cả nhãn máy. Chọn Speaker ngay trên từng row hoặc chọn nhiều row để gán cùng lúc; kéo từng word sang row khác; timestamp subtitle không đổi.</p> : null}
      <button className="button button--quiet button--full" disabled={!asset || isBusy} onClick={() => setShowRunNotice(true)} type="button">{isBusy ? "Đang nhận diện speaker..." : "Nhận diện Speaker"}</button>
      {(batchBusy || isBusy) && onStop ? <TaskStop onStop={onStop} scope="Speaker Diarization" /> : null}
      {showRunNotice ? <div aria-label="Lưu ý Speaker Diarization" className="speaker-isolation-run-notice" role="alertdialog">
        <p>Speaker Diarization chỉ hữu ích khi footage hoặc track có nhiều người cùng nói. Với một người nói, bước này dùng thêm tài nguyên mà không cần thiết. Chạy cho tất cả mục đã tick DIA?</p>
        <div><button onClick={() => setShowRunNotice(false)} type="button">Hủy</button><button onClick={() => { setShowRunNotice(false); onRun(); }} type="button">Chạy Speaker Diarization</button></div>
      </div> : null}
    </ModuleFrame>
  );
}
