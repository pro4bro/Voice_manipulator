import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { api } from "../../api/client";
import type { ProjectAsrAdapter, SpeakerProfile, TrainingRun, TrainingRunFootprint, TrainingRunLog } from "../../domain/types";

const STATUS: Record<TrainingRun["status"], string> = {
  pending: "Chờ lượt",
  running: "Đang chạy",
  interrupted: "Bị ngắt",
  cancelled: "Đã huỷ",
  failed: "Lỗi",
  complete: "Xong",
};

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** What a confirmation says before a run is deleted: what goes, and how much. */
export function deleteRunQuestion(run: TrainingRun, footprint: TrainingRunFootprint, speakerName: string): string {
  const outputs = [
    ...footprint.voices.map((voice) => `• voice ${voice.name}`),
    ...footprint.asrAdapters.map((adapter) => `• adapter ${adapter.name}`),
  ];
  return [
    `Xoá run ${run.id} (${speakerName} · ${run.config.modelId ?? run.config.engine})?`,
    `Toàn bộ thư mục run sẽ bị xoá khỏi ổ cứng: dữ liệu, checkpoint, log · ${formatBytes(footprint.bytes)}.`,
    outputs.length ? `Run này đã tạo và sẽ bị xoá cùng:\n${outputs.join("\n")}` : "Run này chưa tạo voice hay adapter nào.",
    "Không khôi phục được.",
  ].join("\n\n");
}

interface RunLogDialogProps {
  projectId: string;
  run: TrainingRun;
  onClose: () => void;
}

/** The whole record of one run: every journal line, then the engine's raw output. */
export function RunLogDialog({ projectId, run, onClose }: RunLogDialogProps) {
  const [log, setLog] = useState<TrainingRunLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"journal" | "process">("journal");
  const live = run.status === "running" || run.status === "pending";

  useEffect(() => {
    let cancelled = false;
    const load = () => api.getTrainingRunLog(projectId, run.id)
      .then((next) => { if (!cancelled) { setLog(next); setError(null); } })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Không đọc được log"); });
    void load();
    const timer = live ? window.setInterval(load, 3000) : null;
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [projectId, run.id, live]);

  const errors = log?.journal.filter((line) => line.level === "error").length ?? 0;
  const warnings = log?.journal.filter((line) => line.level === "warning").length ?? 0;

  return createPortal(
    <div className="runtime-log-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label={`Log đầy đủ ${run.id}`} aria-modal="true" className="runtime-log-dialog run-log-dialog" role="dialog">
        <header>
          <div><span>LOG ĐẦY ĐỦ · {STATUS[run.status].toUpperCase()}</span><b>{run.id}</b></div>
          <button aria-label="Đóng log" onClick={onClose} type="button">×</button>
        </header>
        <div className="run-log-dialog__tabs" role="tablist">
          <button aria-selected={tab === "journal"} className={tab === "journal" ? "is-active" : ""} onClick={() => setTab("journal")} role="tab" type="button">Các bước · {log?.journal.length ?? 0} dòng{errors ? ` · ${errors} lỗi` : ""}{warnings ? ` · ${warnings} cảnh báo` : ""}</button>
          <button aria-selected={tab === "process"} className={tab === "process" ? "is-active" : ""} onClick={() => setTab("process")} role="tab" type="button">Output engine (process.log) · {formatBytes(log?.processLogBytes ?? 0)}</button>
        </div>
        {error ? <p className="training-note is-error">{error}</p> : null}
        {!log && !error ? <p>Đang đọc log…</p> : null}
        {log && tab === "journal" ? (
          <pre className="run-log-dialog__journal">{log.journal.map((line) => {
            const time = new Date(line.at).toLocaleString("vi-VN", { hour12: false });
            const level = line.level && line.level !== "info" ? ` ${line.level.toUpperCase()}` : "";
            return `[${time}] ${line.stepId}${level}  ${line.message || describeCounter(line)}`;
          }).join("\n") || "Chưa có dòng nào."}</pre>
        ) : null}
        {log && tab === "process" ? (
          <pre>{log.truncated ? `… (chỉ hiện ${formatBytes(new Blob([log.processLog]).size)} cuối của ${formatBytes(log.processLogBytes)})\n` : ""}{log.processLog || "Engine chưa in gì."}</pre>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}

function describeCounter(line: TrainingRunLog["journal"][number]) {
  const parts: string[] = [];
  if (line.total) parts.push(line.stepId === "tokenize" ? `${line.done ?? 0}/${line.total} shard` : `step ${line.done ?? 0}/${line.total}`);
  else if (line.globalStep !== null) parts.push(`step ${line.globalStep}`);
  if (line.loss !== null) parts.push(`loss ${line.loss.toFixed(4)}`);
  if (line.devLoss !== null) parts.push(`dev loss ${line.devLoss.toFixed(4)}`);
  return parts.join(" · ");
}

interface TrainingHistoryDialogProps {
  projectId: string;
  runs: TrainingRun[];
  speakers: SpeakerProfile[];
  /** Speech-to-text adapters the project's runs published. */
  adapters?: ProjectAsrAdapter[];
  onClose: () => void;
  onChanged: () => void;
  onOpenLog: (run: TrainingRun) => void;
}

/** Every run the project has, with what it holds on disk, and a way to remove it. */
export function TrainingHistoryDialog({ projectId, runs, speakers, adapters = [], onClose, onChanged, onOpenLog }: TrainingHistoryDialogProps) {
  const [footprints, setFootprints] = useState<Record<string, TrainingRunFootprint>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const nameOf = (id: string | null | undefined) => speakers.find((speaker) => speaker.id === id)?.name ?? (id || "Toàn bộ dataset");
  const ids = runs.map((run) => run.id).join(",");

  useEffect(() => {
    let cancelled = false;
    void Promise.all(runs.map((run) => api.getTrainingRunFootprint(projectId, run.id).then((footprint) => [run.id, footprint] as const).catch(() => null)))
      .then((entries) => { if (!cancelled) setFootprints(Object.fromEntries(entries.filter((entry): entry is readonly [string, TrainingRunFootprint] => entry !== null))); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ids]);

  const total = Object.values(footprints).reduce((sum, footprint) => sum + footprint.bytes, 0);

  async function remove(run: TrainingRun) {
    setBusy(run.id);
    setMessage(null);
    try {
      const footprint = footprints[run.id] ?? await api.getTrainingRunFootprint(projectId, run.id);
      if (!window.confirm(deleteRunQuestion(run, footprint, nameOf(run.speakerProfileId)))) return;
      const removed = await api.deleteTrainingRun(projectId, run.id, footprint.voices.length + footprint.asrAdapters.length > 0);
      setMessage(`Đã xoá run ${run.id} · giải phóng ${formatBytes(removed.bytes)}.`);
      onChanged();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Không xoá được run");
    } finally {
      setBusy(null);
    }
  }

  async function removeAdapter(adapter: ProjectAsrAdapter) {
    if (!window.confirm(`Xoá adapter "${adapter.name}" khỏi lựa chọn Speech to Text?

Weights vẫn nằm trong run đã tạo nó; xoá run để giải phóng dung lượng.`)) return;
    try {
      await api.deleteAsrAdapter(projectId, adapter.id);
      setMessage(`Đã xoá adapter ${adapter.name}.`);
      onChanged();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Không xoá được adapter");
    }
  }

  return createPortal(
    <div className="runtime-log-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label="Lịch sử training" aria-modal="true" className="runtime-log-dialog training-history-dialog" role="dialog">
        <header>
          <div><span>LỊCH SỬ TRAINING · {runs.length} RUN · {formatBytes(total)}</span><b>Run, checkpoint và những gì chúng đã tạo</b></div>
          <button aria-label="Đóng lịch sử training" onClick={onClose} type="button">×</button>
        </header>
        <small>Xoá run xoá cả thư mục run (dữ liệu, checkpoint, log) và voice/adapter nó đã tạo. Run đang chạy phải huỷ trước.</small>
        {message ? <p className="training-note">{message}</p> : null}
        <ol className="training-history">
          {runs.map((run) => {
            const footprint = footprints[run.id];
            const live = run.status === "running" || run.status === "pending";
            const outputs = footprint ? [...footprint.voices, ...footprint.asrAdapters].map((item) => item.name) : [];
            return (
              <li className={`is-${run.status}`} key={run.id}>
                <div className="training-history__copy">
                  <b>{nameOf(run.speakerProfileId)} · {run.config.modelId ?? run.config.engine}</b>
                  <span>{new Date(run.createdAt).toLocaleString("vi-VN", { hour12: false })} · {STATUS[run.status]} · step {run.globalStep}/{run.config.steps} · {footprint ? formatBytes(footprint.bytes) : "…"}</span>
                  <small>{outputs.length ? `Đã tạo: ${outputs.join(", ")}` : "Chưa tạo voice/adapter"}{run.error ? ` · ${run.error}` : ""}</small>
                </div>
                <div className="training-history__actions">
                  <button className="button button--quiet" onClick={() => onOpenLog(run)} type="button">Log</button>
                  <button className="button button--quiet is-danger" disabled={live || busy === run.id} onClick={() => void remove(run)} title={live ? "Huỷ run trước khi xoá" : "Xoá run"} type="button">{busy === run.id ? "Đang xoá…" : "Xoá"}</button>
                </div>
              </li>
            );
          })}
          {!runs.length ? <li className="training-history__empty">Project chưa có run nào.</li> : null}
          {adapters.map((adapter) => (
            <li key={adapter.id}>
              <div className="training-history__copy">
                <b>{adapter.name}</b>
                <span>Adapter Speech to Text · {new Date(adapter.createdAt).toLocaleString("vi-VN", { hour12: false })}</span>
                <small>{adapter.baseModel}</small>
              </div>
              <div className="training-history__actions">
                <button className="button button--quiet is-danger" onClick={() => void removeAdapter(adapter)} type="button">Xoá</button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>,
    document.body,
  );
}
