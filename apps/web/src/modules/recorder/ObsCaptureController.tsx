import { useEffect, useRef, useState } from "react";

import { api } from "../../api/client";
import type { ObsLiveLinkChannelCapture, ObsLiveLinkRecordingJournal, ObsLiveLinkStatus, ObsLiveLinkTriggerPolicy } from "../../domain/types";
import { obsTrackLabel } from "../../domain/obs-track-label";

interface Props {
  projectId: string;
  onOpenAsset?: (assetId: string) => void;
  onOpenRecording?: (recordingId: string) => void;
  onArchiveReady?: (recordingId: string) => Promise<void>;
}

const triggerChoices: Array<{ key: keyof ObsLiveLinkTriggerPolicy; label: string }> = [
  { key: "ignoreStart", label: "Start Recording" },
  { key: "ignorePause", label: "Pause / Resume Recording" },
  { key: "ignoreStop", label: "Stop Recording" },
];

const captureLabels: Record<ObsLiveLinkChannelCapture["state"], string> = {
  idle: "Idle", disconnected: "Disconnected", missing: "Missing",
  "forward-pending": "Forward pending", disabled: "Disabled", paused: "Paused",
  pending: "Waiting for PCM", receiving: "Recording", stalled: "PCM stalled",
};

export function ObsCaptureController({ projectId, onOpenAsset, onOpenRecording, onArchiveReady }: Props) {
  const [status, setStatus] = useState<ObsLiveLinkStatus | null>(null);
  const [journals, setJournals] = useState<ObsLiveLinkRecordingJournal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const actionRevision = useRef(0);
  const actionInFlight = useRef(false);
  const refreshedArchives = useRef(new Set<string>());
  const autoRetriedArchives = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const revision = actionRevision.current;
      try {
        const [next, records] = await Promise.all([
          api.getObsLiveLinkStatus(), api.listObsLiveLinkRecordings(projectId),
        ]);
        if (active && !actionInFlight.current && revision === actionRevision.current) {
          setStatus(next); setJournals(records); setError(null);
          for (const journal of records) {
            const recording = journal.recording;
            if (recording.projectId !== projectId || recording.archiveStatus !== "ready" ||
                refreshedArchives.current.has(recording.recordingId) || !onArchiveReady) continue;
            refreshedArchives.current.add(recording.recordingId);
            void onArchiveReady(recording.recordingId).catch(() => {
              refreshedArchives.current.delete(recording.recordingId);
            });
          }
          const latest = records[0]?.recording;
          if (latest?.projectId === projectId && latest.status === "stopped" &&
              latest.archiveStatus === "error" && !autoRetriedArchives.current.has(latest.recordingId)) {
            autoRetriedArchives.current.add(latest.recordingId);
            void retryArchive(latest.recordingId);
          }
        }
      } catch (reason) {
        if (active && !actionInFlight.current && revision === actionRevision.current)
          setError(reason instanceof Error ? reason.message : "Không đọc được trạng thái OBS LiveLink.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId]);

  async function act(action: "start" | "pause" | "resume" | "stop") {
    actionInFlight.current = true;
    actionRevision.current += 1;
    setBusy(true);
    try { setStatus(await api.actOnObsLiveLinkRecording(action)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "OBS không áp dụng lệnh thu."); }
    finally { actionRevision.current += 1; actionInFlight.current = false; setBusy(false); }
  }

  async function setPolicy(key: keyof ObsLiveLinkTriggerPolicy, enabled: boolean) {
    if (!status) return;
    setBusy(true);
    try {
      setStatus(await api.setObsLiveLinkTriggerPolicy(projectId, {
        ignoreStart: false, ignorePause: false, ignoreStop: false,
        ...status.triggerPolicy, [key]: enabled,
      }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được Ignore trigger.");
    } finally { setBusy(false); }
  }

  async function retryArchive(recordingId: string) {
    setBusy(true);
    try {
      await api.retryObsLiveLinkArchive(projectId, recordingId);
      setJournals(await api.listObsLiveLinkRecordings(projectId));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo lại archive từ PCM đã lưu.");
    } finally { setBusy(false); }
  }

  async function recoverOutbox(recordingId: string, exportFile = false) {
    setBusy(true); setRecoveryMessage(null); setRecoveryError(null);
    try {
      if (exportFile) {
        await api.exportObsLiveLinkOutbox(projectId, recordingId);
        setRecoveryMessage("Đã xuất bản sao PCM và metadata; dữ liệu gốc vẫn trong outbox.");
      } else {
        const result = await api.retryObsLiveLinkOutbox(projectId, recordingId);
        setRecoveryMessage(`${result.retriedChunks} đoạn được mở lại để gửi. Chưa xác nhận đã lưu vào project; cần OBS kết nối.`);
      }
      setError(null);
    } catch (reason) {
      setRecoveryError(reason instanceof Error ? reason.message : "Không phục hồi được outbox; dữ liệu gốc vẫn được giữ.");
    } finally { setBusy(false); }
  }

  async function setRecordingFolder(enabled: boolean) {
    setBusy(true);
    try { setStatus(await api.setObsLiveLinkRecordingFolder(enabled)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không lưu được tùy chọn thư mục OBS."); }
    finally { setBusy(false); }
  }

  async function importVideo(spanId: string, initialFolder?: string | null, choose = false) {
    setBusy(true);
    try {
      let sourcePath: string | undefined;
      if (choose) {
        sourcePath = (await api.pickMediaFile(initialFolder || status?.recordingFolder || "")).path ?? undefined;
        if (!sourcePath) return;
      }
      await api.importObsLiveLinkVideoSpan(projectId, spanId, sourcePath);
      setJournals(await api.listObsLiveLinkRecordings(projectId));
      setStatus(await api.getObsLiveLinkStatus());
      setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không nhập được MKV OBS."); }
    finally { setBusy(false); }
  }

  const connected = status?.connectionState === "connected";
  const armed = status?.activeProject?.id === projectId;
  const recording = status?.appRecording?.projectId === projectId ? status.appRecording : null;
  const state = recording?.status ?? "idle";
  const actionPending = busy || Boolean(status?.pendingAction);
  const outbox = status?.outbox;
  const outboxStale = !connected || outbox?.stale || Boolean(error);
  return <section aria-label="OBS LiveLink recorder" className="obs-recorder">
    <div className="obs-recorder__status">
      <strong>OBS LiveLink</strong>
      <span>{connected ? "Linked" : "Disconnected"} · {armed ? "Project armed" : "No active project"} · OBS {status?.obsRecording ?? "unknown"} · App {state}</span>
    </div>
    <div className="obs-recorder__outbox" aria-label="Dữ liệu OBS còn chờ gửi">
      <strong>Outbox · tất cả bản ghi OBS</strong>
      {!outbox ? <span>Plugin chưa báo trạng thái dữ liệu chờ gửi.</span> : <>
        {outboxStale ? <span>Trạng thái cũ · chưa xác nhận dữ liệu chờ gửi hiện tại.</span> : null}
        <span>{outbox.readable ? `Còn giữ ${outbox.retainedChunks} đoạn · bị từ chối ${outbox.rejectedChunks} đoạn`
          : "Không đọc được outbox · chưa biết số đoạn còn giữ"}</span>
        <span>Đoạn chờ lâu nhất: {outbox.readable && outbox.retainedChunks === 0 ? "không có đoạn chờ" : outbox.oldestRetainedAgeMs === null ? "chưa rõ"
          : `${Math.floor(outbox.oldestRetainedAgeMs / 1000)} giây tại lần báo gần nhất`}</span>
        <span>Chưa lưu đĩa: {outbox.unspooledChunks} đoạn · hàng đợi bộ nhớ: {outbox.memoryFrames} frame</span>
        <span>Overflow: {outbox.overflowFrames} frame trong các Track của phiên plugin · có thể gồm trước khi Record</span>
        {outbox.lastSpoolError ? <span>Lỗi lưu đĩa gần nhất: {outbox.lastSpoolError}</span> : null}
        <small>Còn giữ bao gồm đoạn bị từ chối. Outbox trống không xác nhận mọi âm thanh đã được thu.</small>
      </>}
    </div>
    <div className="obs-recorder__channels" aria-label="Track OBS LiveLink">
      {status?.channels.filter((channel) => !channel.missing).map((channel) => {
        const observedState = !recording ? "idle" : channel.capture?.recordingId === recording.recordingId &&
          channel.capture?.projectId === projectId ? channel.capture.state : "pending";
        const captureState = state === "paused" && observedState === "receiving" ? "paused" : observedState;
        const receiving = captureState === "receiving" && state === "recording";
        const label = captureLabels[captureState];
        return <div className={`obs-recorder__channel${receiving ? " is-receiving" : ""}`} key={channel.channelId}>
          <div className="obs-recorder__channel-head">
            <span aria-label={`Trạng thái ${obsTrackLabel(channel.alias)}: ${label}`} className="obs-recorder__indicator" data-state={captureState} data-recording={receiving} role="status"><i aria-hidden="true" /><em>{captureState === "paused" ? "PAUSE" : "REC"}</em></span>
            <b title={obsTrackLabel(channel.alias)}>{obsTrackLabel(channel.alias)}</b>
            <small title={channel.nativeName}>{channel.nativeName} · {label} · PCM {channel.capture?.durableChunkCount ?? 0}</small>
          </div>
          <meter aria-label={`Tín hiệu OBS ${obsTrackLabel(channel.alias)}, không xác nhận PCM đã lưu`} min={0} max={100} value={channel.missing ? 0 : channel.meterPeak} />
        </div>;
      })}
    </div>
    <small>Meter: tín hiệu từ OBS · PCM: số đoạn đã lưu vào project</small>
    <div className="obs-recorder__actions recorder-actions">
      <button className={`record-button${recording ? " is-live" : ""}`}
        disabled={!connected || (!recording && !armed) || actionPending}
        onClick={() => void act(recording ? "stop" : "start")} type="button">
        <span aria-hidden="true" />{status?.pendingAction === "start" ? "Đang bắt đầu…" : status?.pendingAction === "stop" ? "Đang dừng…" : recording ? "Stop" : "Record"}
      </button>
      {recording ? <button className="button button--quiet" disabled={!connected || actionPending}
        onClick={() => void act(state === "paused" ? "resume" : "pause")} type="button">{state === "paused" ? "Resume" : "Pause"}</button> : null}
    </div>
    <label className="obs-recorder__folder-link">
      <input checked={Boolean(status?.connectRecordingFolder)} disabled={busy} onChange={(event) => void setRecordingFolder(event.target.checked)} type="checkbox" />
      Connect to OBS recording folder
    </label>
    {status?.connectRecordingFolder && status.recordingFolder ? <small>OBS folder: {status.recordingFolder}</small> : null}
    <fieldset className="obs-recorder__policy" disabled={!armed || busy}>
      <legend>Ignore trigger from OBS</legend>
      {triggerChoices.map(({ key, label }) => <label key={key}>
        <input checked={Boolean(status?.triggerPolicy?.[key])} onChange={(event) => void setPolicy(key, event.target.checked)} type="checkbox" />{label}
      </label>)}
    </fieldset>
    {recording ? <p>{recording.videoSpanIds.length} OBS video span · {recording.pauseCauses.join(", ") || "không tạm dừng"}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
    {recoveryError ? <p role="alert">{recoveryError}</p> : null}
    <div className="obs-recorder__history">
      {journals.filter((journal) => journal.recording.projectId === projectId).slice(0, 5).map((journal) => <div key={journal.recording.recordingId}>
        <strong>{journal.recording.recordingId.slice(0, 8)}</strong>
        <span>{journal.recording.status} · {journal.recording.videoSpanIds.length} video span · {journal.sourceStems?.length ?? 0} track · MKA {journal.recording.archiveStatus}</span>
        {journal.recording.status === "stopped" ? <div>
          <button disabled={busy} onClick={() => void recoverOutbox(journal.recording.recordingId)} type="button">Thử gửi lại PCM</button>
          <button disabled={busy} onClick={() => void recoverOutbox(journal.recording.recordingId, true)} type="button">Export outbox</button>
        </div> : null}
        {onOpenRecording ? <button onClick={() => onOpenRecording(journal.recording.recordingId)} type="button">Mở toàn bộ trong Timeline</button> : null}
        {journal.recording.status === "stopped" && journal.recording.archiveStatus !== "ready" ?
          <button disabled={busy} onClick={() => void retryArchive(journal.recording.recordingId)} type="button">Thử tạo lại MKA</button> : null}
        {journal.videoSpans?.map((span) => <div key={span.spanId} className="obs-recorder__video-span">
          <span>OBS video {span.spanId.slice(0, 8)} · {span.recordingFileName || "MKV chưa liên kết"} · {span.importedVideoAssetId ? "đã nhập" : span.endedMonotonicNs === null ? "đang ghi" : "chưa nhập"}</span>
          {!span.importedVideoAssetId && span.endedMonotonicNs !== null ? <>
            <button disabled={busy || !span.recordingFileAvailable} onClick={() => void importVideo(span.spanId)} type="button">Import MKV from OBS</button>
            <button disabled={busy} onClick={() => void importVideo(span.spanId, span.recordingFolder, true)} type="button">Browse MKV</button>
          </> : null}
          {span.importedVideoAssetId && onOpenAsset ? <button onClick={() => onOpenAsset(span.importedVideoAssetId as string)} type="button">Mở video</button> : null}
        </div>)}
        {journal.sourceStems?.map((stem) => <div key={stem.channelId}>
          {stem.assetId && onOpenAsset ? <button onClick={() => onOpenAsset(stem.assetId as string)} type="button">{obsTrackLabel(stem.alias)}</button> : <span>{obsTrackLabel(stem.alias)}: {stem.assetId ? "sẵn sàng" : "chưa có analysis WAV"}</span>}
          <small>{stem.gaps.length} khoảng gián đoạn</small>
        </div>)}
      </div>)}
    </div>
  </section>;
}
