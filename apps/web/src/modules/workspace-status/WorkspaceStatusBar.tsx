import { useState } from "react";

import { api } from "../../api/client";
import { describeTask, isLiveTask, primaryTask, sortTasks } from "../../domain/activity";
import type { ActivityTask, SystemLog, SystemMetrics } from "../../domain/types";
import { Icon } from "../../ui/Icon";

interface WorkspaceStatusBarProps {
  /** Everything the app is doing: training, STT, TTS, voice changer, model loading. */
  tasks: ActivityTask[];
  metrics: SystemMetrics | null;
}

/**
 * The one line that answers "is the app doing anything?".
 *
 * It reads the API's activity stream rather than any one page's state, so a job
 * started anywhere - a training run, a transcription, reading a Script, a model
 * being loaded for a single sentence - shows here while it runs and says how
 * long it took when it ends.
 */
export function WorkspaceStatusBar({ tasks, metrics }: WorkspaceStatusBarProps) {
  const [log, setLog] = useState<SystemLog | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const live = sortTasks(tasks.filter(isLiveTask));
  const current = primaryTask(tasks);
  const line = current ? describeTask(current) : null;
  const others = live.filter((task) => task.id !== current?.id);

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
              {line.percent !== null ? <progress max="100" value={line.percent} /> : null}
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
        </div>
      </footer>
      {log || loadingLog ? <div className="runtime-log-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLog(null); }}><section aria-label="Runtime log" aria-modal="true" className="runtime-log-dialog" role="dialog"><header><div><span>RUNTIME LOG</span><b>Local API & OmniVoice Studio</b></div><button aria-label="Đóng runtime log" onClick={() => setLog(null)} type="button">×</button></header>{loadingLog && !log ? <p>Đang đọc log runtime…</p> : <><small>{log?.files.join(" · ") || "Không có file log"}</small><pre>{log?.text}</pre></>}</section></div> : null}
    </>
  );
}
