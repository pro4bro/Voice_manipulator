import { useCallback, useEffect, useState } from "react";

import { api } from "../../api/client";
import { describeTask, isLiveTask, primaryTask, sortTasks } from "../../domain/activity";
import type { ActivityTask, SystemLog, SystemMetrics } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ProjectQueueDialog } from "./ProjectQueueDialog";
import type { ProjectMediaAsset } from "../../domain/types";

interface WorkspaceStatusBarProps {
  /** Everything the app is doing: training, STT, TTS, voice changer, model loading. */
  tasks: ActivityTask[];
  metrics: SystemMetrics | null;
  projectId?: string;
  projectName?: string;
  assets?: ProjectMediaAsset[];
  queueTasks?: ActivityTask[];
}

/**
 * The one line that answers "is the app doing anything?".
 *
 * It reads the API's activity stream rather than any one page's state, so a job
 * started anywhere - a training run, a transcription, reading a Script, a model
 * being loaded for a single sentence - shows here while it runs and says how
 * long it took when it ends.
 */
export function WorkspaceStatusBar({ tasks, metrics, projectId, projectName, assets, queueTasks = [] }: WorkspaceStatusBarProps) {
  const [log, setLog] = useState<SystemLog | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const scopedQueueTasks = projectId ? queueTasks.filter((task) => task.projectId === projectId) : [];
  const mergedTasks = new Map<string, ActivityTask>();
  for (const task of [...tasks.filter((item) => !projectId || !item.projectId || item.projectId === projectId), ...scopedQueueTasks]) {
    const held = mergedTasks.get(task.id);
    if (!held || task.updatedAt.localeCompare(held.updatedAt) > 0) mergedTasks.set(task.id, task);
  }
  const visibleTasks = [...mergedTasks.values()];
  const now = Date.now();
  const statusTasks = visibleTasks.filter((task) => isLiveTask(task) || (task.finishedAt != null && now - Date.parse(task.finishedAt) <= 25_000));
  const live = sortTasks(visibleTasks.filter(isLiveTask));
  const current = primaryTask(statusTasks);
  const line = current ? describeTask(current) : null;
  const others = live.filter((task) => task.id !== current?.id);
  const pendingQueueCount = scopedQueueTasks.filter((task) => task.status === "queued" || task.status === "running").length;
  const attentionQueueCount = scopedQueueTasks.filter((task) => task.status === "failed" || task.status === "interrupted").length;
  const closeQueue = useCallback(() => setQueueOpen(false), []);

  useEffect(() => { setQueueOpen(false); }, [projectId]);

  async function openLog() {
    setLoadingLog(true);
    try { setLog(await api.getSystemLogs()); }
    finally { setLoadingLog(false); }
  }

  return (
    <>
      <footer className="workspace-status-bar" aria-live="polite">
        <div className="workspace-status-bar__activity">
          <i className={live.length ? "is-busy" : ""} />
          {line ? (
            <>
              <b>{line.stage}</b>
              <span>{line.label}</span>
              <strong>{line.detail}{line.percent !== null ? ` · ${line.percent}%` : ""}</strong>
              <progress aria-label={line.percent === null ? "Tiến trình chưa xác định" : `Tiến trình ${line.percent}%`} max="100" value={line.percent ?? undefined} />
              {others.length ? <em className="workspace-status-bar__more">+{others.length} việc khác: {others.map((task) => task.label).join(" · ")}</em> : null}
            </>
          ) : (
            <><b>READY</b><span>Không có background task đang chạy</span></>
          )}
        </div>
        <div className="workspace-status-bar__metrics">
          <span>CPU <b>{metrics ? `${metrics.cpuPercent.toFixed(0)}%` : "—"}</b></span>
          <span>GPU <b>{metrics?.gpuPercent == null ? "N/A" : `${metrics.gpuPercent.toFixed(0)}%`}</b></span>
          <span>MEM <b>{metrics ? `${metrics.memoryPercent.toFixed(0)}% · ${metrics.memoryUsedMb}/${metrics.memoryTotalMb} MB` : "—"}</b></span>
          <span>NET <b>{metrics ? `${metrics.networkMbps.toFixed(2)} Mbps` : "—"}</b></span>
          <button aria-label="Mở runtime log" onClick={() => void openLog()} type="button"><Icon name="file" /> LOG</button>
          {projectId ? <button aria-label={`Mở Queue${attentionQueueCount ? `, ${attentionQueueCount} cần xem lại` : ""}`} onClick={() => setQueueOpen(true)} type="button">QUEUE <span>{pendingQueueCount}</span>{attentionQueueCount ? <em aria-label={`${attentionQueueCount} cần xem lại`}> · !{attentionQueueCount}</em> : null}</button> : null}
        </div>
      </footer>
      {log || loadingLog ? <div className="runtime-log-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLog(null); }}><section aria-label="Runtime log" aria-modal="true" className="runtime-log-dialog" role="dialog"><header><div><span>RUNTIME LOG</span><b>Local API & OmniVoice Studio</b></div><button aria-label="Đóng runtime log" onClick={() => setLog(null)} type="button">×</button></header>{loadingLog && !log ? <p>Đang đọc log runtime…</p> : <><small>{log?.files.join(" · ") || "Không có file log"}</small><pre>{log?.text}</pre></>}</section></div> : null}
      {queueOpen && projectId ? <ProjectQueueDialog key={projectId} assets={assets} onClose={closeQueue} projectId={projectId} projectName={projectName} tasks={scopedQueueTasks} /> : null}
    </>
  );
}
