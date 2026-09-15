import { useState } from "react";

import { api } from "../../api/client";
import { trainingActivity } from "../../domain/trainingBatch";
import type { ProjectMediaAsset, SpeakerProfile, SystemLog, SystemMetrics, TrainingProgressLine, TrainingRun } from "../../domain/types";
import { Icon } from "../../ui/Icon";

interface WorkspaceStatusBarProps {
  assets: ProjectMediaAsset[];
  metrics: SystemMetrics | null;
  /** The newest training batch; a run goes on for hours and is a background task too. */
  training?: { batch: TrainingRun[]; progressByRun: Record<string, TrainingProgressLine[]>; speakers: SpeakerProfile[] };
}

function transcriptionBackground(asset: ProjectMediaAsset) {
  return ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus);
}

function diarizationBackground(asset: ProjectMediaAsset) {
  return ["queued", "processing"].includes(asset.diarizationStatus ?? "idle");
}

export function WorkspaceStatusBar({ assets, metrics, training }: WorkspaceStatusBarProps) {
  const [log, setLog] = useState<SystemLog | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const tracked = assets.filter((asset) => asset.transcriptionSelected && !["not-applicable", "skipped"].includes(asset.transcriptionStatus));
  const transcription = tracked.find(transcriptionBackground) ?? null;
  const diarization = assets.find(diarizationBackground) ?? null;
  const current = transcription ?? diarization;
  const completed = tracked.filter((asset) => asset.transcriptionStatus === "complete").length;
  const transcriptionProgressOf = (asset: ProjectMediaAsset) => asset.transcriptionProgress ?? (asset.transcriptionStatus === "complete" ? 100 : 0);
  const progressOf = (asset: ProjectMediaAsset) => transcription ? transcriptionProgressOf(asset) : asset.diarizationProgress ?? 0;
  const totalDuration = tracked.reduce((total, asset) => total + Math.max(0, asset.duration), 0);
  const overallProgress = transcription && totalDuration > 0
    ? tracked.reduce((total, asset) => total + Math.max(0, asset.duration) * transcriptionProgressOf(asset), 0) / totalDuration
    : transcription && tracked.length ? tracked.reduce((total, asset) => total + transcriptionProgressOf(asset), 0) / tracked.length
      : diarization?.diarizationProgress ?? 0;
  const train = training ? trainingActivity(training.batch, training.progressByRun, training.speakers) : null;
  const currentStage = transcription?.transcriptionStatus === "reviewing" ? "AI CHECK" : transcription?.transcriptionStatus === "queued" ? "WAITING STT" : transcription ? "STT KỸ" : diarization?.diarizationStatus === "queued" ? "WAITING DIARIZATION" : "SPEAKER DIARIZATION";

  async function openLog() {
    setLoadingLog(true);
    try { setLog(await api.getSystemLogs()); }
    finally { setLoadingLog(false); }
  }

  return (
    <>
      <footer className="workspace-status-bar" aria-live="polite">
        <div className="workspace-status-bar__activity">
          <i className={current || train ? "is-busy" : ""} />
          {current ? <><b>{currentStage}</b><span>{current.name}</span><strong>{transcription ? `${completed}/${tracked.length} FOOTAGE · ` : ""}{progressOf(current).toFixed(1)}% CURRENT · {overallProgress.toFixed(1)}% TOTAL</strong><progress max="100" value={overallProgress} />{train ? <b>· {train.stage} {train.percent.toFixed(0)}%</b> : null}</>
            : train ? <><b>{train.stage}</b><span>{train.name}</span><strong>{train.detail ? `${train.detail} · ` : ""}{train.percent.toFixed(1)}% TOTAL</strong><progress max="100" value={train.percent} /></>
              : <><b>READY</b><span>Không có background task đang chạy</span></>}
        </div>
        <div className="workspace-status-bar__metrics">
          <span>CPU <b>{metrics ? `${metrics.cpuPercent.toFixed(0)}%` : "—"}</b></span>
          <span>GPU <b>{metrics?.gpuPercent == null ? "N/A" : `${metrics.gpuPercent.toFixed(0)}%`}</b></span>
          <span>MEM <b>{metrics ? `${metrics.memoryPercent.toFixed(0)}% · ${metrics.memoryUsedMb}/${metrics.memoryTotalMb} MB` : "—"}</b></span>
          <span>NET <b>{metrics ? `${metrics.networkMbps.toFixed(2)} Mbps` : "—"}</b></span>
          <button aria-label="Mở runtime log" onClick={() => void openLog()} type="button"><Icon name="file" /> LOG</button>
        </div>
      </footer>
      {log || loadingLog ? <div className="runtime-log-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLog(null); }}><section aria-label="Runtime log" aria-modal="true" className="runtime-log-dialog" role="dialog"><header><div><span>RUNTIME LOG</span><b>Local API & OmniVoice Studio</b></div><button aria-label="Đóng runtime log" onClick={() => setLog(null)} type="button">×</button></header>{loadingLog && !log ? <p>Đang đọc log runtime…</p> : <><small>{log?.files.join(" · ") || "Không có file log"}</small><pre>{log?.text}</pre></>}</section></div> : null}
    </>
  );
}