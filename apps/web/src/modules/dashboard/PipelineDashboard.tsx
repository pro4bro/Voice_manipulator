import type { DatasetReadiness, ProjectMediaAsset, SpeakerProfile, TrainingRun } from "../../domain/types";
import { pipelineStages, stageBadge, type PipelineStage, type PipelineStageId } from "../../domain/footagePipeline";
import { Icon, type IconName } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";

interface PipelineDashboardProps {
  assets: ProjectMediaAsset[];
  readiness: DatasetReadiness | null;
  speakers: SpeakerProfile[];
  runs: TrainingRun[];
  onSelectAsset?: (assetId: string) => void;
  onOpenTraining?: () => void;
}

const ICONS: Record<PipelineStageId, IconName> = {
  footage: "project",
  transcript: "file",
  diarization: "waveform",
  "single-speaker": "person",
  "multi-speaker": "grid",
  assigned: "list",
  "training-selected": "training",
  "in-dataset": "folder",
};

/** Stages where "still waiting" means something to do. A branch is a fork, not a task. */
const ACTIONABLE = new Set<PipelineStageId>(["transcript", "diarization", "assigned", "training-selected", "in-dataset"]);

export function PipelineDashboard({ assets, readiness, speakers, runs, onSelectAsset, onOpenTraining }: PipelineDashboardProps) {
  const stages = pipelineStages(assets, readiness);
  const byId = Object.fromEntries(stages.map((stage) => [stage.id, stage])) as Record<PipelineStageId, PipelineStage>;
  const total = byId.footage.done.length;
  const parked = assets.filter((asset) => !asset.deletedAt && (asset.disabled || asset.status === "no-audio")).length;
  const reached = stages.filter((stage) => stage.done.length > 0).length;
  const finished = stages.filter((stage) => total > 0 && (ACTIONABLE.has(stage.id) || stage.id === "footage") && stage.waiting.length === 0).length;
  const linear = stages.filter((stage) => ACTIONABLE.has(stage.id) || stage.id === "footage").length;
  const trainedSpeakers = speakers.filter((speaker) => runs.some((run) => run.speakerProfileId === speaker.id && run.status === "complete"));

  function node(stage: PipelineStage) {
    const waiting = ACTIONABLE.has(stage.id) ? stage.waiting : [];
    return (
      <article className={`pipeline-node ${total && stage.done.length === total ? "is-complete" : stage.done.length ? "is-partial" : ""}`} data-stage={stage.id}>
        <span aria-label={`${stage.label}: ${stageBadge(stage.done.length, total)}`} className="pipeline-badge" role="status">{stageBadge(stage.done.length, total)}</span>
        <i className="pipeline-node__icon"><Icon name={ICONS[stage.id]} /></i>
        <div className="pipeline-node__copy">
          <b>{stage.label}</b>
          <small>{stage.detail}</small>
        </div>
        {waiting.length ? (
          <details className="pipeline-node__waiting">
            <summary>Còn {waiting.length} footage</summary>
            <ul>
              {waiting.slice(0, 12).map((item) => (
                <li key={item.asset.id}><button onClick={() => onSelectAsset?.(item.asset.id)} type="button">{item.asset.name}</button></li>
              ))}
              {waiting.length > 12 ? <li><small>và {waiting.length - 12} footage khác</small></li> : null}
            </ul>
          </details>
        ) : null}
      </article>
    );
  }

  return (
    <ModuleFrame className="pipeline-dashboard-module" eyebrow="DATA PIPELINE" title="Dashboard">
      <div className="pipeline-summary">
        <span><b>{total}</b> footage được tính</span>
        <span><b>{reached}/{stages.length}</b> bước đã có footage đi qua</span>
        <span><b>{finished}/{linear}</b> bước xong cho mọi footage</span>
        {parked ? <span className="is-muted"><b>{parked}</b> đang tắt / không có audio, không tính</span> : null}
      </div>

      {total ? (
        <div className="pipeline-flow" aria-label="Flow chuẩn bị dữ liệu">
          {node(byId.footage)}
          <i aria-hidden="true" className="pipeline-link" />
          {node(byId.transcript)}
          <i aria-hidden="true" className="pipeline-link" />
          {node(byId.diarization)}
          <svg aria-hidden="true" className="pipeline-fork" preserveAspectRatio="none" viewBox="0 0 100 24"><path d="M50 0 V8 M25 8 H75 M25 8 V24 M75 8 V24" /></svg>
          <div className="pipeline-branch">
            {node(byId["single-speaker"])}
            {node(byId["multi-speaker"])}
          </div>
          <svg aria-hidden="true" className="pipeline-fork" preserveAspectRatio="none" viewBox="0 0 100 24"><path d="M25 0 V16 M75 0 V16 M25 16 H75 M50 16 V24" /></svg>
          {node(byId.assigned)}
          <i aria-hidden="true" className="pipeline-link" />
          {node(byId["training-selected"])}
          <i aria-hidden="true" className="pipeline-link" />
          {node(byId["in-dataset"])}
          <i aria-hidden="true" className="pipeline-link" />
          <article className={`pipeline-node pipeline-node--voices ${trainedSpeakers.length && trainedSpeakers.length === speakers.length ? "is-complete" : trainedSpeakers.length ? "is-partial" : ""}`}>
            <span aria-label={`Voice đã train: ${stageBadge(trainedSpeakers.length, speakers.length)}`} className="pipeline-badge" role="status">{stageBadge(trainedSpeakers.length, speakers.length)}</span>
            <i className="pipeline-node__icon"><Icon name="spark" /></i>
            <div className="pipeline-node__copy">
              <b>Voice đã train</b>
              <small>Tính theo Speaker Profile có run hoàn tất{trainedSpeakers.length ? ` · ${trainedSpeakers.map((speaker) => speaker.name).join(", ")}` : ""}</small>
            </div>
            {onOpenTraining ? <button className="button button--quiet" onClick={onOpenTraining} type="button">Mở Voice Training</button> : null}
          </article>
        </div>
      ) : (
        <div className="pipeline-empty"><Icon name="folder" /><b>Chưa có footage nào để thống kê</b><span>Import footage ở Media Pool, chạy Speech to Text rồi quay lại đây.</span></div>
      )}
      <p className="pipeline-note">Phần trăm tính trên toàn bộ footage được tính. Nhánh 1 speaker / nhiều speaker chỉ gồm footage đã nhận diện speaker.</p>
    </ModuleFrame>
  );
}
