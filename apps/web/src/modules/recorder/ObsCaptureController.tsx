import { useEffect, useState } from "react";

import { api } from "../../api/client";
import type { ObsLiveLinkChannelCapture, ObsLiveLinkRecordingJournal, ObsLiveLinkStatus, ObsLiveLinkTriggerPolicy } from "../../domain/types";

interface Props {
  projectId: string;
  onOpenAsset?: (assetId: string) => void;
  onOpenRecording?: (recordingId: string) => void;
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

export function ObsCaptureController({ projectId, onOpenAsset, onOpenRecording }: Props) {
  const [status, setStatus] = useState<ObsLiveLinkStatus | null>(null);
  const [journals, setJournals] = useState<ObsLiveLinkRecordingJournal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [next, records] = await Promise.all([
          api.getObsLiveLinkStatus(), api.listObsLiveLinkRecordings(projectId),
        ]);
        if (active) { setStatus(next); setJournals(records); setError(null); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không đọc được trạng thái OBS LiveLink.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId]);

  async function act(action: "start" | "pause" | "resume" | "stop") {
    setBusy(true);
    try { setStatus(await api.actOnObsLiveLinkRecording(action)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "OBS không áp dụng lệnh thu."); }
    finally { setBusy(false); }
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
  return <section aria-label="OBS LiveLink recorder" className="obs-recorder">
    <div className="obs-recorder__status">
      <strong>OBS LiveLink</strong>
      <span>{connected ? "Linked" : "Disconnected"} · {armed ? "Project armed" : "No active project"} · OBS {status?.obsRecording ?? "unknown"} · App {state}</span>
    </div>
    <div className="obs-recorder__channels" aria-label="Kênh OBS LiveLink">
      {status?.channels.map((channel) => {
        const observedState = !recording ? "idle" : channel.capture?.recordingId === recording.recordingId &&
          channel.capture?.projectId === projectId ? channel.capture.state : "pending";
        const captureState = state === "paused" && observedState === "receiving" ? "paused" : observedState;
        const receiving = captureState === "receiving" && state === "recording";
        const label = captureLabels[captureState];
        return <div className={`obs-recorder__channel${receiving ? " is-receiving" : ""}`} key={channel.channelId}>
          <div className="obs-recorder__channel-head">
            <b title={channel.alias}>{channel.alias}</b>
            <small title={channel.nativeName}>{channel.nativeName} · {label}</small>
            <span aria-label={`Trạng thái ${channel.alias}: ${label}`} className="obs-recorder__indicator" data-state={captureState} role="status"><i aria-hidden="true" />{receiving ? <em>REC</em> : null}</span>
          </div>
          <meter aria-label={`Mức ${channel.alias}`} min={0} max={100} value={channel.missing ? 0 : channel.meterPeak} />
        </div>;
      })}
    </div>
    <div className="obs-recorder__actions recorder-actions">
      <button className={`record-button${recording ? " is-live" : ""}`}
        disabled={!connected || (!recording && !armed) || actionPending}
        onClick={() => void act(recording ? "stop" : "start")} type="button">
        <span aria-hidden="true" />{status?.pendingAction === "start" ? "Đang bắt đầu…" : recording ? "Stop" : "Record"}
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
    <div className="obs-recorder__history">
      {journals.filter((journal) => journal.recording.projectId === projectId).slice(0, 5).map((journal) => <div key={journal.recording.recordingId}>
        <strong>{journal.recording.recordingId.slice(0, 8)}</strong>
        <span>{journal.recording.status} · {journal.recording.videoSpanIds.length} video span · {journal.sourceStems?.length ?? 0} track · MKA {journal.recording.archiveStatus}</span>
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
          {stem.assetId && onOpenAsset ? <button onClick={() => onOpenAsset(stem.assetId as string)} type="button">{stem.alias}</button> : <span>{stem.alias}: {stem.assetId ? "sẵn sàng" : "chưa có analysis WAV"}</span>}
          <small>{stem.gaps.length} khoảng gián đoạn</small>
        </div>)}
      </div>)}
    </div>
  </section>;
}
