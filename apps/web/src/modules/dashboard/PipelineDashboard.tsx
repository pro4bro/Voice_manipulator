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

type NodeState = "is-complete" | "is-partial" | "";

function stateOf(done: number, total: number): NodeState {
  if (total && done === total) return "is-complete";
  return done ? "is-partial" : "";
}

/**
 * Where the project's footage stands, left to right.
 *
 * Nodes are small on purpose: a name, an icon and a badge. What each step means
 * lives in the legend under the flow rather than inside every node, so the whole
 * pipeline fits one row and reads at a glance.
 */
export function PipelineDashboard({ assets, readiness, speakers, runs, onSelectAsset, onOpenTraining }: PipelineDashboardProps) {
  const stages = pipelineStages(assets, readiness);
  const byId = Object.fromEntries(stages.map((stage) => [stage.id, stage])) as Record<PipelineStageId, PipelineStage>;
  const total = byId.footage.done.length;
  const parked = assets.filter((asset) => !asset.deletedAt && (asset.disabled || asset.status === "no-audio")).length;
  const reached = stages.filter((stage) => stage.done.length > 0).length;
  const finished = stages.filter((stage) => total > 0 && (ACTIONABLE.has(stage.id) || stage.id === "footage") && stage.waiting.length === 0).length;
  const linear = stages.filter((stage) => ACTIONABLE.has(stage.id) || stage.id === "footage").length;
  const trainedSpeakers = speakers.filter((speaker) => runs.some((run) => run.speakerProfileId === speaker.id && run.status === "complete"));

  function node(stage: PipelineStage, branch = false) {
    const waiting = ACTIONABLE.has(stage.id) ? stage.waiting : [];
    const badge = stageBadge(stage.done.length, total);
    return (
      <article className={`pipeline-node ${branch ? "is-branch" : ""} ${stateOf(stage.done.length, total)}`} data-stage={stage.id} title={stage.detail}>
        <span aria-label={`${stage.label}: ${badge}`} className="pipeline-badge" role="status">{badge}</span>
        <i className="pipeline-node__icon"><Icon name={ICONS[stage.id]} /></i>
        <b>{stage.label}</b>
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

  const arrow = <i aria-hidden="true" className="pipeline-arrow">→</i>;
  const voicesBadge = stageBadge(trainedSpeakers.length, speakers.length);

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
          {arrow}
          {node(byId.transcript)}
          {arrow}
          {node(byId.diarization)}
          {arrow}
          <div className="pipeline-branch" aria-label="Một hoặc nhiều người nói">
            {node(byId["single-speaker"], true)}
            {node(byId["multi-speaker"], true)}
          </div>
          {arrow}
          {node(byId.assigned)}
          {arrow}
          {node(byId["training-selected"])}
          {arrow}
          {node(byId["in-dataset"])}
          {arrow}
          <article className={`pipeline-node pipeline-node--voices ${stateOf(trainedSpeakers.length, speakers.length)}`} data-stage="voices" title="Speaker Profile có ít nhất một run hoàn tất">
            <span aria-label={`Voice đã train: ${voicesBadge}`} className="pipeline-badge" role="status">{voicesBadge}</span>
            <i className="pipeline-node__icon"><Icon name="spark" /></i>
            <b>Voice đã train</b>
            {onOpenTraining ? <button className="pipeline-node__action" onClick={onOpenTraining} type="button">Mở Training</button> : null}
          </article>
        </div>
      ) : (
        <div className="pipeline-empty"><Icon name="folder" /><b>Chưa có footage nào để thống kê</b><span>Import footage ở Media Pool, chạy Speech to Text rồi quay lại đây.</span></div>
      )}

      <section aria-label="Chú thích flow" className="pipeline-legend">
        <header>CHÚ THÍCH</header>
        <div className="pipeline-legend__badges">
          <p>
            <span className="pipeline-badge is-sample">50% · 1</span>
            Số ở góc mỗi node: <b>phần trăm footage đã qua bước đó</b> · <b>số footage</b>. Ví dụ “50% · 1” là 1 trong 2 footage đã xong bước này.
            Riêng node <b>Voice đã train</b> đếm theo Speaker Profile.
          </p>
          <ul>
            <li><i className="is-complete" />Xanh: mọi footage đã xong</li>
            <li><i className="is-partial" />Vàng: mới xong một phần</li>
            <li><i />Xám: chưa footage nào qua</li>
          </ul>
        </div>
        <dl>
          {stages.map((stage) => (
            <div key={stage.id}><dt>{stage.label}</dt><dd>{stage.detail}</dd></div>
          ))}
          <div><dt>Voice đã train</dt><dd>Speaker Profile có ít nhất một run hoàn tất{trainedSpeakers.length ? `: ${trainedSpeakers.map((speaker) => speaker.name).join(", ")}` : ""}</dd></div>
        </dl>
        <p className="pipeline-note">
          Hai node giữa là một ngã rẽ: <b>1 speaker</b> và <b>Nhiều speaker</b> chỉ tính footage đã biết người nói, nên cộng lại có thể nhỏ hơn tổng.
          Footage chỉ có một người thì gán thẳng ở ô NGƯỜI NÓI trong Script, không cần chạy nhận diện speaker. Bấm “Còn N footage” dưới node để mở footage còn thiếu.
        </p>
      </section>
    </ModuleFrame>
  );
}
