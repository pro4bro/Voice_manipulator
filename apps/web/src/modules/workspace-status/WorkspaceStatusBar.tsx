import { useState } from "react";

import { api } from "../../api/client";
import type { ProjectMediaAsset, SystemLog, SystemMetrics } from "../../domain/types";
import { Icon } from "../../ui/Icon";

interface WorkspaceStatusBarProps {
  assets: ProjectMediaAsset[];
  metrics: SystemMetrics | null;
}

function background(asset: ProjectMediaAsset) {
  return ["queued", "processing", "reviewing"].includes(asset.transcriptionStatus);
}

export function WorkspaceStatusBar({ assets, metrics }: WorkspaceStatusBarProps) {
  const [log, setLog] = useState<SystemLog | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const tracked = assets.filter((asset) => asset.transcriptionSelected && !["not-applicable", "skipped"].includes(asset.transcriptionStatus));
  const current = tracked.find(background) ?? null;
  const completed = tracked.filter((asset) => asset.transcriptionStatus === "complete").length;
  const progressOf = (asset: ProjectMediaAsset) => asset.transcriptionProgress ?? (asset.transcriptionStatus === "complete" ? 100 : 0);
  const totalDuration = tracked.reduce((total, asset) => total + Math.max(0, asset.duration), 0);
  const overallProgress = totalDuration > 0
    ? tracked.reduce((total, asset) => total + Math.max(0, asset.duration) * progressOf(asset), 0) / totalDuration
    : tracked.length ? tracked.reduce((total, asset) => total + progressOf(asset), 0) / tracked.length : 0;
  const currentStage = current?.transcriptionStatus === "reviewing" ? "AI CHECK" : current?.transcriptionStatus === "queued" ? "WAITING" : "STT KỸ";

  async function openLog() {
    setLoadingLog(true);
    try { setLog(await api.getSystemLogs()); }
    finally { setLoadingLog(false); }
  }

  return (
    <>
      <footer className="workspace-status-bar" aria-live="polite">
        <div className="workspace-status-bar__activity">
          <i className={current ? "is-busy" : ""} />
          {current ? <><b>{currentStage}</b><span>{current.name}</span><strong>{completed}/{tracked.length} FOOTAGE · {progressOf(current).toFixed(1)}% CURRENT · {overallProgress.toFixed(1)}% TOTAL</strong><progress max="100" value={overallProgress} /></> : <><b>READY</b><span>Không có background task đang chạy</span></>}
        </div>
        <div className="workspace-status-bar__metrics">
          <span>CPU <b>{metrics ? `${metrics.cpuPercent.toFixed(0)}%` : "—"}</b></span>
          <span>GPU <b>{metrics?.gpuPercent == null ? "N/A" : `${metrics.gpuPercent.toFixed(0)}%`}</b></span>
          <span>MEM <b>{metrics ? `${metrics.memoryPercent.toFixed(0)}% · ${metrics.memoryUsedMb}/${metrics.memoryTotalMb} MB` : "—"}</b></span>
          <span>NET <b>{metrics ? `${metrics.networkMbps.toFixed(2)} Mbps` : "—"}</b></span>
          <button aria-label="Mở runtime log" onClick={() => void openLog()} type="button"><Icon name="file" /> LOG</button>
        </div>
      </footer>
      {log || loadingLog ? <div className="runtime-log-backdrop"><section aria-label="Runtime log" aria-modal="true" className="runtime-log-dialog" role="dialog"><header><div><span>RUNTIME LOG</span><b>Local API & OmniVoice Studio</b></div><button aria-label="Đóng runtime log" onClick={() => setLog(null)} type="button">×</button></header>{loadingLog && !log ? <p>Đang đọc log runtime…</p> : <><small>{log?.files.join(" · ") || "Không có file log"}</small><pre>{log?.text}</pre></>}</section></div> : null}
    </>
  );
}