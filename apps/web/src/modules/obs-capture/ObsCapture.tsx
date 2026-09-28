import { useEffect, useRef, useState } from "react";

import { api } from "../../api/client";
import type { ObsCaptureSession, ObsLiveCaptionQuality, ObsLiveSession, ObsRecordingInspection, ObsSessionSubtitleStatus, ObsTrackSource } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { ObsLiveLinkMixer } from "./ObsLiveLinkMixer";

interface ObsCaptureProps {
  projectId: string;
  onOpenAsset: (assetId: string) => void;
  onImportReady: (assetId: string) => void;
}

function messageFrom(reason: unknown, fallback: string): string {
  if (reason instanceof SyntaxError) return "API OBS chưa được nạp. Khởi động lại app rồi thử lại.";
  return reason instanceof Error ? reason.message : fallback;
}

export function ObsCapture({ projectId, onOpenAsset, onImportReady }: ObsCaptureProps) {
  const [sessions, setSessions] = useState<ObsCaptureSession[]>([]);
  const [liveSessions, setLiveSessions] = useState<ObsLiveSession[]>([]);
  const [captionQuality, setCaptionQuality] = useState<Record<string, ObsLiveCaptionQuality>>({});
  const [subtitleStatuses, setSubtitleStatuses] = useState<Record<string, ObsSessionSubtitleStatus>>({});
  const [sttBusy, setSttBusy] = useState<string | null>(null);
  const [renderBusy, setRenderBusy] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Record<string, string[]>>({});
  const [pairing, setPairing] = useState<{ protocolVersion: string; token: string; overlayPath: string } | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [inspection, setInspection] = useState<ObsRecordingInspection | null>(null);
  const [sources, setSources] = useState<ObsTrackSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const awaitingRef = useRef<string | null>(null);
  const onImportReadyRef = useRef(onImportReady);
  onImportReadyRef.current = onImportReady;

  useEffect(() => {
    let cancelled = false;
    let unavailable = false;
    const refresh = async () => {
      if (unavailable) return;
      try {
        const [next, live] = await Promise.all([
          api.listObsSessions(projectId), api.listObsLiveSessions(projectId),
        ]);
        if (cancelled) return;
        setSessions(next);
        setLiveSessions(live);
        const comparisons = await Promise.all(live.slice(0, 8).filter((item) => item.status === "stopped" && item.assetId && item.liveText.trim()).map(async (item) => {
          try { return await api.getObsLiveCaptionQuality(projectId, item.id); }
          catch { return null; }
        }));
        if (!cancelled) setCaptionQuality(Object.fromEntries(comparisons.filter((item): item is ObsLiveCaptionQuality => item !== null).map((item) => [item.sessionId, item])));
        const ready = next.filter((session) => session.status === "ready");
        const statuses = await Promise.all(ready.map(async (session) => [session.id, await api.getObsSessionSubtitleStatus(projectId, session.id)] as const));
        if (!cancelled) setSubtitleStatuses(Object.fromEntries(statuses));
        const awaited = next.find((session) => session.id === awaitingRef.current);
        if (awaited?.status === "ready") {
          awaitingRef.current = null;
          if (awaited.recordingAssetId) onImportReadyRef.current(awaited.recordingAssetId);
        } else if (awaited?.status === "error") {
          awaitingRef.current = null;
        }
      } catch (reason) {
        if (reason instanceof SyntaxError) unavailable = true;
        if (!cancelled) setError(messageFrom(reason, "Không tải được phiên OBS."));
      }
    };
    void refresh();
    void api.getObsLivePairing(projectId).then((value) => {
      if (!cancelled) setPairing(value);
    }).catch((reason) => {
      if (!cancelled) setError(messageFrom(reason, "Không tạo được mã ghép OBS."));
    });
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [projectId]);

  async function copyPairingToken() {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.token);
    } catch {
      setError("Không chép được pairing token vào clipboard.");
    }
  }

  async function copyOverlayPath() {
    if (!pairing?.overlayPath) return;
    try {
      await navigator.clipboard.writeText(pairing.overlayPath);
    } catch {
      setError("Không chép được đường dẫn caption OBS.");
    }
  }

  async function chooseRecording() {
    setError(null);
    try {
      const picked = await api.pickMediaFile();
      if (!picked.path) return;
      setBusy(true);
      setSourcePath(picked.path);
      setInspection(null);
      const result = await api.inspectObsRecording(projectId, picked.path);
      setInspection(result);
      setSources(result.tracks.map((track) => ({
        streamIndex: track.streamIndex,
        sourceLabel: `Track ${track.obsTrack} (chưa xác định nguồn)`,
      })));
    } catch (reason) {
      setError(messageFrom(reason, "Không đọc được file OBS."));
    } finally {
      setBusy(false);
    }
  }

  async function importRecording() {
    if (!inspection || !sourcePath || sources.some((source) => !source.sourceLabel.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const queued = await api.createObsSession(projectId, sourcePath, sources.map((source) => ({
        ...source, sourceLabel: source.sourceLabel.trim(),
      })));
      awaitingRef.current = queued.id;
      setSessions((current) => [queued, ...current.filter((session) => session.id !== queued.id)]);
      setInspection(null);
      setSourcePath("");
    } catch (reason) {
      setError(messageFrom(reason, "Không nhập được bản ghi OBS."));
    } finally {
      setBusy(false);
    }
  }

  async function runFinalStt(assetId: string) {
    setSttBusy(assetId);
    setError(null);
    try {
      await api.enqueueMediaTranscriptions(projectId, [assetId]);
    } catch (reason) {
      setError(messageFrom(reason, "Không thể đưa nguồn OBS vào hàng đợi Final STT."));
    } finally {
      setSttBusy(null);
    }
  }

  async function exportSessionSrt(sessionId: string) {
    setError(null);
    try {
      await api.exportObsSessionSubtitles(projectId, sessionId, selectedTracks[sessionId] ?? []);
    } catch (reason) {
      setError(messageFrom(reason, "Không xuất được SRT phiên OBS."));
    }
  }

  async function renderHardSubtitle(sessionId: string) {
    setRenderBusy(sessionId);
    setError(null);
    try {
      await api.renderObsSessionHardSubtitle(projectId, sessionId, selectedTracks[sessionId] ?? []);
    } catch (reason) {
      setError(messageFrom(reason, "Không render được video hard subtitle."));
    } finally {
      setRenderBusy(null);
    }
  }

  function selectedSubtitleCounts(sessionId: string) {
    const selected = new Set(selectedTracks[sessionId] ?? []);
    const sources = (subtitleStatuses[sessionId]?.sources ?? []).filter((source) => selected.has(source.assetId));
    return {
      ready: sources.reduce((sum, source) => sum + source.readyCues, 0),
      skipped: sources.reduce((sum, source) => sum + source.skippedCues, 0),
      unsafeWords: sources.reduce((sum, source) => sum + (source.unsafeWords ?? 0), 0),
    };
  }

  return <ModuleFrame className="obs-capture-module" eyebrow="VIDEO + AUDIO TRACKS" title="OBS LiveLink">
    <div className="obs-capture-intro">OBS ghi video; Pro4Bro quản lý riêng từng nguồn âm thanh để nghe và xử lý Speech to Text.</div>
    <ObsLiveLinkMixer projectId={projectId} />
    <div className="obs-capture-actions">
      <button className="button button--quiet" disabled={busy} onClick={() => void chooseRecording()} type="button">Chọn MKV từ OBS</button>
      <button className="button button--quiet" disabled={!pairing} onClick={() => void copyPairingToken()} type="button">Chép pairing token {pairing ? `v${pairing.protocolVersion}` : ""}</button>
      <button className="button button--quiet" disabled={!pairing?.overlayPath} onClick={() => void copyOverlayPath()} type="button">Chép file live caption cho OBS</button>
      {inspection ? <button className="button button--accent" disabled={busy || sources.some((source) => !source.sourceLabel.trim())} onClick={() => void importRecording()} type="button">Nhập {inspection.tracks.length} track</button> : null}
    </div>
    {inspection ? <div className="obs-capture-inspection">
      <small title={sourcePath}>{sourcePath.split(/[\\/]/).pop()} · {Math.round(inspection.duration)}s</small>
      {inspection.tracks.map((track, index) => <label key={track.streamIndex}>
        <span>Track {track.obsTrack} · {track.codec} · {(track.sampleRate / 1000).toFixed(1)} kHz</span>
        <input aria-label={`Tên nguồn cho track ${track.obsTrack}`} maxLength={200} onChange={(event) => setSources((current) => current.map((source, slot) => slot === index ? { ...source, sourceLabel: event.target.value } : source))} value={sources[index]?.sourceLabel ?? ""} />
      </label>)}
      <p>Tên nguồn chỉ là nhãn do anh gán; file MKV không tự chứng minh track đó đến từ thiết bị nào.</p>
    </div> : null}
    {error ? <p className="obs-capture-error" role="alert">{error}</p> : null}
    <div className="obs-live-sessions" aria-label="OBS live sessions">
      {liveSessions.length ? liveSessions.slice(0, 8).map((session) => <section className={`obs-live-source is-${session.status}`} key={session.id}>
        <div>
          <strong>{session.sourceLabel}</strong>
          <span>{session.status === "recording" ? "Đang ghi" : session.status === "paused" ? "Tạm dừng" : "Đã dừng"}</span>
        </div>
        <small title={session.sourceId}>{session.captureId} · {(session.bytesReceived / 1048576).toFixed(1)} MB · {session.gaps.length} gap</small>
        <p><b>Live draft:</b> {[session.liveText, session.livePending].filter(Boolean).join(" ") || (session.liveSttError ?? (session.status === "stopped" ? "Không phát hiện lời nói." : "Đang chờ giọng nói…"))}</p>
        <footer>
          <span>STT: {session.liveSttStatus}</span>
          {session.liveSttLagSeconds > 0 ? <span>STT từ ACK {session.liveSttLagSeconds.toFixed(1)}s</span> : null}
          {captionQuality[session.id]?.finalAvailable ? <span>Sai khác live/final ~{captionQuality[session.id].mismatchPercent?.toFixed(1)}% ({captionQuality[session.id].liveWords}/{captionQuality[session.id].finalWords} từ)</span> : null}
          {session.assetId ? <button onClick={() => onOpenAsset(session.assetId as string)} type="button">Mở stem</button> : null}
          {session.assetId ? <button disabled={sttBusy === session.assetId} onClick={() => void runFinalStt(session.assetId as string)} type="button">Final STT stem</button> : null}
        </footer>
      </section>) : <p className="obs-capture-empty">Plugin chưa gửi nguồn live nào vào project.</p>}
    </div>
    <div className="obs-capture-sessions">
      {sessions.length ? sessions.map((session) => <section aria-label={`Phiên OBS ${session.id}`} className="obs-capture-session" key={session.id}>
        <div><strong>{new Date(session.createdAt).toLocaleString("vi-VN")}</strong><span>{session.status === "ready" ? `${session.tracks.length} track · ${Math.round(session.duration)}s` : session.status === "error" ? "Lỗi" : "Đang nhập…"}</span></div>
        {session.error ? <p role="alert">{session.error}</p> : null}
        {session.status === "ready" ? <div className="obs-capture-tracks">
          {session.recordingAssetId ? <button onClick={() => onOpenAsset(session.recordingAssetId as string)} type="button">Âm thanh video OBS</button> : null}
          {session.tracks.map((track) => <div className="obs-capture-track-final" key={track.assetId}>
            <label><input type="checkbox" checked={(selectedTracks[session.id] ?? []).includes(track.assetId)} onChange={(event) => setSelectedTracks((current) => ({
              ...current,
              [session.id]: event.target.checked
                ? [...(current[session.id] ?? []), track.assetId]
                : (current[session.id] ?? []).filter((id) => id !== track.assetId),
            }))} />Ghép vào SRT: {track.sourceLabel}</label>
            <button onClick={() => onOpenAsset(track.assetId)} type="button">{track.sourceLabel}</button>
            <button disabled={sttBusy === track.assetId} onClick={() => void runFinalStt(track.assetId)} type="button">Final STT</button>
            <small>{subtitleStatuses[session.id]?.sources.find((source) => source.assetId === track.assetId)?.transcriptionStatus ?? "skipped"}</small>
          </div>)}
          <a href={`/api/projects/${projectId}/obs-sessions/${session.id}/recording`}>Tải MKV gốc</a>
          <span>{selectedSubtitleCounts(session.id).ready} cue sẵn sàng · {selectedSubtitleCounts(session.id).skipped} cue và {selectedSubtitleCounts(session.id).unsafeWords} từ bỏ do timecode chưa tin cậy</span>
          <button disabled={!selectedSubtitleCounts(session.id).ready} onClick={() => void exportSessionSrt(session.id)} type="button">Xuất SRT phiên OBS</button>
          <button disabled={!selectedSubtitleCounts(session.id).ready || renderBusy === session.id} onClick={() => void renderHardSubtitle(session.id)} type="button">{renderBusy === session.id ? "Đang render…" : "Render video có subtitle"}</button>
        </div> : null}
      </section>) : <p className="obs-capture-empty">Chưa nhập file MKV nào từ OBS.</p>}
    </div>
    <p className="obs-capture-live-note">Plugin tạo Text (GDI+) trong OBS khi overlayEnabled=true; chữ [LIVE DRAFT] được ghi cùng video nếu nguồn hiện trong scene. Mỗi audio stem và Final STT vẫn độc lập. Nhập MKV sau record để đối chiếu timecode.</p>
  </ModuleFrame>;
}
