import { useEffect, useState } from "react";

import { api } from "../../api/client";
import type { ObsLiveLinkStatus } from "../../domain/types";

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Không thể điều khiển OBS LiveLink.";
}

export function ObsLiveLinkMixer({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<ObsLiveLinkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let fallback = typeof EventSource === "undefined";
    const accept = (next: ObsLiveLinkStatus) => {
      if (!active) return;
      setStatus((current) => current?.serverEpoch === next.serverEpoch &&
        current.statusRevision > next.statusRevision ? current : next);
      setError(null);
    };
    const refresh = async () => {
      try { accept(await api.getObsLiveLinkStatus()); }
      catch (reason) { if (active) setError(errorText(reason)); }
    };
    void refresh();
    const events = fallback ? null : new EventSource("/api/obs-livelink/v3/events");
    if (events) {
      events.onmessage = (event) => {
        try { accept(JSON.parse(event.data) as ObsLiveLinkStatus); }
        catch { /* A later snapshot will replace an invalid event. */ }
      };
      events.onerror = () => { events.close(); fallback = true; };
    }
    const timer = window.setInterval(() => { if (fallback) void refresh(); }, 2_000);
    return () => { active = false; window.clearInterval(timer); events?.close(); };
  }, []);

  const toggle = async (channelId: string, enabled: boolean) => {
    setBusy(channelId);
    try {
      setStatus(await api.setObsLiveLinkForward(channelId, enabled));
      setError(null);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(null);
    }
  };

  const setIgnore = async (key: "ignoreStart" | "ignorePause" | "ignoreStop", enabled: boolean) => {
    if (!status) return;
    setBusy(key);
    try {
      setStatus(await api.setObsLiveLinkTriggerPolicy(projectId, {
        ignoreStart: false, ignorePause: false, ignoreStop: false,
        ...status.triggerPolicy, [key]: enabled,
      }));
      setError(null);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(null);
    }
  };

  const connected = status?.connectionState === "connected";
  return <section aria-label="OBS LiveLink mixer" className="obs-livelink-mixer">
    <header>
      <strong>OBS LiveLink</strong>
      <span aria-live="polite">{connected ? "Đã kết nối" : "Chưa kết nối"}</span>
      <small>{status?.sceneCollection || "Chưa có scene collection"} · OBS {status?.obsRecording ?? "unknown"} · App {status?.appRecording?.status ?? "idle"}</small>
    </header>
    <p>{status?.activeProject?.id === projectId ? `Project: ${status.activeProject.name}` : "No active project"}</p>
    {error ? <p className="obs-capture-error" role="alert">{error}</p> : null}
    <div className="obs-livelink-channels">
      {status?.channels.length ? status.channels.map((channel) => <div className="obs-livelink-channel" key={channel.channelId}>
        <div className="obs-livelink-channel__name">
          <strong>{channel.alias}</strong>
          <small title={channel.sourceUuid}>{channel.nativeName} · Channel {channel.slot}{channel.sampleRate ? ` · ${channel.sampleRate / 1000} kHz` : ""}{channel.audioChannels ? ` · ${channel.audioChannels} ch` : ""}{channel.muted ? " · Muted" : ""}{channel.missing ? " · Missing" : ""}</small>
        </div>
        <meter aria-label={`Mức âm ${channel.alias}`} min={0} max={100} value={channel.missing ? 0 : channel.meterPeak} />
        <label>
          <input aria-label={`Forward ${channel.alias}`} checked={channel.desiredForward}
            disabled={!connected || channel.missing || Boolean(channel.pendingCommandId) || busy === channel.channelId}
            onChange={(event) => void toggle(channel.channelId, event.target.checked)} type="checkbox" />
          Forward
        </label>
        <small className="obs-livelink-channel__state" aria-live="polite">
          {channel.pendingCommandId ? "Đang áp dụng…" : channel.lastError ? `Lỗi: ${channel.lastError}` :
            channel.appliedForward ? "Đã bật" : "Đã tắt"}
        </small>
      </div>) : <p className="obs-capture-empty">{connected ? "OBS chưa có nguồn âm thanh trong Mixer." : "Mở OBS để xem nguồn âm thanh."}</p>}
    </div>
    <fieldset className="obs-recorder__policy" disabled={!connected || status?.activeProject?.id !== projectId || busy !== null}>
      <legend>Ignore trigger from OBS</legend>
      {([[
        "ignoreStart", "Start Recording",
      ], ["ignorePause", "Pause / Resume Recording"], ["ignoreStop", "Stop Recording"]] as const).map(([key, label]) => <label key={key}>
        <input checked={Boolean(status?.triggerPolicy?.[key])} onChange={(event) => void setIgnore(key, event.target.checked)} type="checkbox" />{label}
      </label>)}
    </fieldset>
  </section>;
}
