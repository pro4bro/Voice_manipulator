import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { api } from "../../api/client";
import { selectListItem } from "../../domain/listSelection";
import type { ObsCaptureSession, ObsLiveCaptionQuality, ObsLiveSession, ObsRecordingInspection, ObsSessionSubtitleStatus, ObsTrackSource } from "../../domain/types";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { ObsLiveLinkMixer } from "./ObsLiveLinkMixer";
import type { PendingMediaImportRow } from "../media-pool/MediaPool";

interface ObsCaptureProps {
  projectId: string;
  onOpenAsset: (assetId: string) => void;
  onImportReady: (assetId: string) => void | Promise<void>;
  onImportSlotChange?: (slot: PendingMediaImportRow) => void;
  onImportSlotRemoved?: (slotId: string) => void;
}

function messageFrom(reason: unknown, fallback: string): string {
  if (reason instanceof SyntaxError) return "API OBS chưa được nạp. Khởi động lại app rồi thử lại.";
  return reason instanceof Error ? reason.message : fallback;
}

export function ObsCapture({ projectId, onOpenAsset, onImportReady, onImportSlotChange, onImportSlotRemoved }: ObsCaptureProps) {
  const [sessions, setSessions] = useState<ObsCaptureSession[]>([]);
  const [liveSessions, setLiveSessions] = useState<ObsLiveSession[]>([]);
  const [captionQuality, setCaptionQuality] = useState<Record<string, ObsLiveCaptionQuality>>({});
  const [subtitleStatuses, setSubtitleStatuses] = useState<Record<string, ObsSessionSubtitleStatus>>({});
  const [sttBusy, setSttBusy] = useState<string | null>(null);
  const [renderBusy, setRenderBusy] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Record<string, string[]>>({});
  const [trackSelectionAnchors, setTrackSelectionAnchors] = useState<Record<string, string>>({});
  const [pairing, setPairing] = useState<{ protocolVersion: string; token: string; overlayPath: string } | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [inspection, setInspection] = useState<ObsRecordingInspection | null>(null);
  const [sources, setSources] = useState<ObsTrackSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inspectingSlot = useRef<PendingMediaImportRow | null>(null);
  const awaitingImports = useRef(new Map<string, { slot: PendingMediaImportRow; announcing: boolean }>());
  const onImportReadyRef = useRef(onImportReady);
  onImportReadyRef.current = onImportReady;
  const slotCallbacks = useRef({ onImportSlotChange, onImportSlotRemoved });
  slotCallbacks.current = { onImportSlotChange, onImportSlotRemoved };

  function updateSlot(slot: PendingMediaImportRow) {
    inspectingSlot.current = slot;
    slotCallbacks.current.onImportSlotChange?.(slot);
  }

  useEffect(() => {
    let cancelled = false;
    let unavailable = false;
    let inFlight = false;
    const refresh = async () => {
      if (unavailable || inFlight) return;
      inFlight = true;
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
        for (const awaited of next) {
          const pending = awaitingImports.current.get(awaited.id);
          if (!pending || pending.announcing) continue;
          if (awaited.status === "ready" && awaited.recordingAssetId) {
            pending.announcing = true;
            try {
              await onImportReadyRef.current(awaited.recordingAssetId);
              if (cancelled) return;
              slotCallbacks.current.onImportSlotRemoved?.(pending.slot.id);
              awaitingImports.current.delete(awaited.id);
            } catch (reason) {
              pending.announcing = false;
              if (!cancelled) setError(messageFrom(reason, "Chưa cập nhật được footage OBS."));
            }
          } else if (awaited.status === "error") {
            slotCallbacks.current.onImportSlotChange?.({ ...pending.slot, status: "error", detail: awaited.error || "Không nhập được bản ghi OBS." });
            awaitingImports.current.delete(awaited.id);
          }
        }
      } catch (reason) {
        if (reason instanceof SyntaxError) unavailable = true;
        if (!cancelled) setError(messageFrom(reason, "Không tải được phiên OBS."));
      } finally { inFlight = false; }
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
      if (inspectingSlot.current) slotCallbacks.current.onImportSlotRemoved?.(inspectingSlot.current.id);
      updateSlot({ id: `obs-import-${crypto.randomUUID()}`, name: picked.path.split(/[\\/]/).pop() || picked.path, status: "importing", detail: "Đang đọc các track của file OBS…" });
      setBusy(true);
      setSourcePath(picked.path);
      setInspection(null);
      const result = await api.inspectObsRecording(projectId, picked.path);
      if (inspectingSlot.current) updateSlot({ ...inspectingSlot.current, status: "choosing", detail: "Chọn nguồn cho từng track, rồi bấm Nhập." });
      setInspection(result);
      setSources(result.tracks.map((track) => ({
        streamIndex: track.streamIndex,
        sourceLabel: `Track ${track.obsTrack} (chưa xác định nguồn)`,
      })));
    } catch (reason) {
      const detail = messageFrom(reason, "Không đọc được file OBS.");
      if (inspectingSlot.current) updateSlot({ ...inspectingSlot.current, status: "error", detail });
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  async function importRecording() {
    if (!inspection || !sourcePath || sources.some((source) => !source.sourceLabel.trim())) return;
    const slot = inspectingSlot.current ?? { id: `obs-import-${crypto.randomUUID()}`, name: sourcePath.split(/[\\/]/).pop() || sourcePath, status: "importing" as const };
    updateSlot({ ...slot, status: "importing", detail: "Đang tạo footage và các track OBS…" });
    setBusy(true);
    setError(null);
    try {
      const queued = await api.createObsSession(projectId, sourcePath, sources.map((source) => ({
        ...source, sourceLabel: source.sourceLabel.trim(),
      })));
      slotCallbacks.current.onImportSlotChange?.({ ...slot, status: "importing", obsSessionId: queued.id });
      awaitingImports.current.set(queued.id, { slot, announcing: false });
      inspectingSlot.current = null;
      setSessions((current) => [queued, ...current.filter((session) => session.id !== queued.id)]);
      setInspection(null);
      setSourcePath("");
    } catch (reason) {
      const detail = messageFrom(reason, "Không nhập được bản ghi OBS.");
      updateSlot({ ...slot, status: "error", detail });
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  async function runFinalStt(assetIds: string[]) {
    if (!assetIds.length || sttBusy) return;
    setSttBusy(assetIds.join(","));
    setError(null);
    try {
      await api.enqueueMediaTranscriptions(projectId, assetIds);
    } catch (reason) {
      setError(messageFrom(reason, "Không thể đưa nguồn OBS vào hàng đợi Final STT."));
    } finally {
      setSttBusy(null);
    }
  }

  function selectAllSessionTracks(event: KeyboardEvent<HTMLDivElement>, session: ObsCaptureSession) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedTracks((current) => ({ ...current, [session.id]: session.tracks.map((track) => track.assetId) }));
      if (session.tracks[0]) setTrackSelectionAnchors((current) => ({ ...current, [session.id]: session.tracks[0].assetId }));
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
          {session.assetId ? <button disabled={Boolean(sttBusy)} onClick={() => void runFinalStt([session.assetId as string])} type="button">Final STT stem</button> : null}
        </footer>
      </section>) : <p className="obs-capture-empty">Plugin chưa gửi nguồn live nào vào project.</p>}
    </div>
    <div className="obs-capture-sessions">
      {sessions.length ? sessions.map((session) => <section aria-label={`Phiên OBS ${session.id}`} className="obs-capture-session" key={session.id}>
        <div><strong>{new Date(session.createdAt).toLocaleString("vi-VN")}</strong><span>{session.status === "ready" ? `${session.tracks.length} track · ${Math.round(session.duration)}s` : session.status === "error" ? "Lỗi" : "Đang nhập…"}</span></div>
        {session.error ? <p role="alert">{session.error}</p> : null}
        {session.status === "ready" ? <div aria-label={`Danh sách track OBS phiên ${session.id}`} className="obs-capture-tracks" onKeyDown={(event) => selectAllSessionTracks(event, session)} role="region" tabIndex={0}>
          {session.recordingAssetId ? <button onClick={() => onOpenAsset(session.recordingAssetId as string)} type="button">Âm thanh video OBS</button> : null}
          {(selectedTracks[session.id] ?? []).length > 1 ? <button disabled={Boolean(sttBusy)} onClick={() => void runFinalStt(session.tracks.map((track) => track.assetId).filter((id) => (selectedTracks[session.id] ?? []).includes(id)))} type="button">Final STT đã chọn ({selectedTracks[session.id].length})</button> : null}
          {session.tracks.map((track) => <div className="obs-capture-track-final" key={track.assetId}>
            <label><input type="checkbox" checked={(selectedTracks[session.id] ?? []).includes(track.assetId)} onChange={(event) => {
              const pointer = event.nativeEvent as MouseEvent;
              const shift = Boolean(pointer.shiftKey);
              const checked = event.target.checked;
              const trackIds = session.tracks.map((item) => item.assetId);
              setSelectedTracks((current) => {
                const ids = current[session.id] ?? [];
                return { ...current, [session.id]: shift
                  ? selectListItem({ ids, anchorId: trackSelectionAnchors[session.id] ?? track.assetId }, trackIds, track.assetId, { shift: true, toggle: Boolean(pointer.ctrlKey || pointer.metaKey) }).ids
                  : checked ? [...new Set([...ids, track.assetId])] : ids.filter((id) => id !== track.assetId) };
              });
              if (!shift) setTrackSelectionAnchors((current) => ({ ...current, [session.id]: track.assetId }));
            }} />Ghép vào SRT: {track.sourceLabel}</label>
            <button onClick={() => onOpenAsset(track.assetId)} type="button">{track.sourceLabel}</button>
            <button disabled={Boolean(sttBusy)} onClick={() => void runFinalStt([track.assetId])} type="button">Final STT</button>
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
