import { emotionLabel } from "../../domain/emotions";
import { formatBytes, formatClock, projectOverview } from "../../domain/projectOverview";
import { formatDuration } from "../../domain/reading-plan";
import type { DatasetReadiness, EmotionLabel, ProjectMediaAsset, SpeakerProfile, TrainingModelOption, TrainingRun, TrainingSettings } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface ProjectOverviewProps {
  assets: ProjectMediaAsset[];
  readiness: DatasetReadiness | null;
  speakers: SpeakerProfile[];
  runs: TrainingRun[];
  model: TrainingModelOption | null;
  settings: TrainingSettings;
  onSelectAsset?: (assetId: string) => void;
}

const REJECTIONS: Record<string, string> = {
  "no-audio": "không có audio",
  "missing-audio-file": "thiếu file audio",
  "empty-text": "chưa có transcript",
  "no-word-timing": "chưa có word timing",
  "unassigned-speaker": "chưa gán người nói",
  "unknown-speaker": "người nói không tồn tại",
  "mixed-speaker-unresolved": "nhiều người, chưa gán ai",
  "no-usable-segment": "không cắt được đoạn nào",
};

const RUN_STATUS: Record<TrainingRun["status"], string> = {
  pending: "chờ lượt",
  running: "đang train",
  interrupted: "bị ngắt",
  cancelled: "đã huỷ",
  failed: "lỗi",
  complete: "xong",
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** The project in one column: its files, its voices, emotion training and how training went. */
export function ProjectOverview({ assets, readiness, speakers, runs, model, settings, onSelectAsset }: ProjectOverviewProps) {
  const overview = projectOverview(assets, readiness, speakers, runs, model, settings);
  const { files, profiles, emotion, training } = overview;
  const nameOf = (id: string) => speakers.find((speaker) => speaker.id === id)?.name ?? id;

  return (
    <ModuleFrame className="project-overview-module" eyebrow="PROJECT" title="Tổng quan" tone="warm">
      <div className="overview-totals">
        <span><b>{files.length}</b> file import</span>
        <span><b>{formatClock(overview.totalSeconds)}</b> tổng độ dài</span>
        <span><b>{formatBytes(overview.totalBytes)}</b> dung lượng</span>
        <span><b>{speakers.length}</b> voice profile</span>
      </div>

      <section aria-label="Các file đã import" className="overview-section">
        <header>FILE ĐÃ IMPORT · {files.length}</header>
        <ul className="overview-files">
          {files.map((file) => {
            const format = [file.extension.toUpperCase(), file.audioCodec, file.sampleRate ? `${Math.round(file.sampleRate / 100) / 10} kHz` : null].filter(Boolean).join(" · ");
            const assigned = file.speakerProfileIds.map(nameOf);
            const inDataset = Object.values(file.secondsBySpeaker).reduce((sum, seconds) => sum + seconds, 0);
            return (
              <li key={file.assetId}>
                <button onClick={() => onSelectAsset?.(file.assetId)} title="Mở footage ở Speech to Text" type="button">{file.name}</button>
                <small>{format || "—"} · {formatBytes(file.bytes)} · {formatClock(file.duration)}</small>
                <small>
                  {assigned.length ? `${assigned.length} profile: ${assigned.join(", ")}` : "Chưa gán voice profile"}
                  {file.trainingSelected ? (inDataset ? ` · ${formatDuration(inDataset)} vào dataset` : "") : " · chưa chọn train"}
                </small>
                {file.rejection ? <small className="is-problem">Bị loại khỏi dataset: {REJECTIONS[file.rejection] ?? file.rejection}</small> : null}
              </li>
            );
          })}
          {!files.length ? <li className="overview-empty">Chưa import file nào.</li> : null}
        </ul>
      </section>

      <section aria-label="Theo voice profile" className="overview-section">
        <header>VOICE PROFILE · {profiles.length}</header>
        <ul className="overview-rows">
          {profiles.map((profile) => (
            <li key={profile.speaker.id}>
              <span><i style={{ background: profile.speaker.color }} />{profile.speaker.name}</span>
              <b>{formatDuration(profile.seconds)}</b>
              <small>
                {profile.files} file
                {profile.latest ? ` · ${profile.runs} run · lần cuối ${RUN_STATUS[profile.latest.status]} ${percent(profile.progress)}` : " · chưa train"}
              </small>
            </li>
          ))}
          {!profiles.length ? <li className="overview-empty">Chưa có Speaker Profile.</li> : null}
        </ul>
      </section>

      <section aria-label="Train theo cảm xúc" className="overview-section">
        <header>CẢM XÚC</header>
        <p className={`overview-flag ${emotion.enabled ? "is-on" : ""}`}>
          Train theo cảm xúc: <b>{emotion.enabled ? "Bật" : "Tắt"}</b>
          {emotion.ratio !== null ? ` · instruct_ratio ${emotion.ratio}` : model ? " · model đang chọn không có tuỳ chọn này" : ""}
          {emotion.modelLabel ? <small>{emotion.modelLabel}</small> : null}
        </p>
        <p className="overview-caption">{emotion.emotions.length} cảm xúc có dữ liệu trong dataset</p>
        <ul className="overview-rows">
          {emotion.emotions.map((item) => (
            <li key={item.emotion}><span>{emotionLabel(item.emotion as EmotionLabel)}</span><b>{formatDuration(item.seconds)}</b></li>
          ))}
        </ul>
      </section>

      <section aria-label="Tình trạng training" className="overview-section">
        <header>TRAINING</header>
        <ul className="overview-rows">
          <li><span>Voice đã train</span><b>{training.trainedVoices}/{training.voicesWithData}</b><small>{training.voicesWithData ? percent(training.trainedVoices / training.voicesWithData) : "chưa có voice nào có dữ liệu"}</small></li>
          <li><span>Run</span><b>{training.runs}</b><small>{training.complete} xong · {training.running} đang chạy · {training.cancelled} huỷ/ngắt</small></li>
          <li className={training.failed ? "is-problem" : ""}><span>Run lỗi</span><b>{training.failed}</b><small>tỷ lệ lỗi {percent(training.failureRate)} trên run đã kết thúc</small></li>
          <li className={training.rejectedFiles ? "is-problem" : ""}><span>File bị loại khỏi dataset</span><b>{training.rejectedFiles}/{training.selectedFiles}</b><small>{training.selectedFiles ? percent(training.rejectedFiles / training.selectedFiles) : "chưa chọn file nào để train"}</small></li>
          <li className={training.sttErrors ? "is-problem" : ""}><span>Speech to Text lỗi</span><b>{training.sttErrors}</b><small>trên {files.length} file</small></li>
        </ul>
      </section>
    </ModuleFrame>
  );
}
