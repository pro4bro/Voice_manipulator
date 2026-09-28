import { api } from "../../api/client";
import type { ObsLiveLinkStatus, ObsLiveLinkWaveform } from "../../domain/types";

export interface WaveformWindow {
  startSeconds: number;
  endSeconds: number;
  maxPoints?: number;
}

/** The status SSE carries a durable sequence watermark; the waveform GET carries only extrema. */
export function subscribeObsLiveLinkWaveforms(
  projectId: string,
  windowFor: (recordingId: string, channelId: string) => WaveformWindow,
  onSnapshot: (snapshot: ObsLiveLinkWaveform) => void,
  onError?: (reason: unknown) => void,
  onStatus?: (status: ObsLiveLinkStatus) => void,
): () => void {
  let active = true;
  let fallback = typeof EventSource === "undefined";
  const cursors = new Map<string, number>();
  const inFlight = new Set<string>();
  let latest: ObsLiveLinkStatus | null = null;
  let activeRecordingId: string | null = null;

  const fetchChanged = (status: ObsLiveLinkStatus) => {
    const recording = status.appRecording;
    if (!recording || recording.projectId !== projectId) return;
    for (const channel of status.channels) {
      const capture = channel.capture;
      if (capture?.recordingId !== recording.recordingId ||
          capture.lastDurableSequence === null) continue;
      const key = `${recording.recordingId}:${channel.channelId}`;
      const cursor = cursors.get(key);
      if (inFlight.has(key) || (cursor !== undefined && capture.lastDurableSequence <= cursor)) continue;
      const window = windowFor(recording.recordingId, channel.channelId);
      inFlight.add(key);
      let succeeded = false;
      void api.getObsLiveLinkWaveform(projectId, recording.recordingId, channel.channelId,
        window.startSeconds, window.endSeconds, window.maxPoints ?? 600, cursor)
        .then((snapshot) => {
          if (!active || activeRecordingId !== recording.recordingId) return;
          cursors.set(key, snapshot.lastIncludedSequence >= 0
            ? snapshot.lastIncludedSequence : snapshot.lastDurableSequence);
          succeeded = true;
          onSnapshot(snapshot);
        })
        .catch((reason) => { if (active) onError?.(reason); })
        .finally(() => {
          inFlight.delete(key);
          if (active && succeeded && latest) fetchChanged(latest);
        });
    }
  };

  const accept = (status: ObsLiveLinkStatus) => {
    if (!active) return;
    const recordingId = status.appRecording?.projectId === projectId
      ? status.appRecording.recordingId : null;
    if (recordingId !== activeRecordingId) {
      activeRecordingId = recordingId;
      cursors.clear();
    }
    latest = status;
    onStatus?.(status);
    fetchChanged(status);
  };
  const refresh = () => void api.getObsLiveLinkStatus().then(accept)
    .catch((reason) => { if (active) onError?.(reason); });
  refresh();
  const events = fallback ? null : new EventSource("/api/obs-livelink/v3/events");
  if (events) {
    events.onmessage = (event) => {
      try { accept(JSON.parse(event.data) as ObsLiveLinkStatus); }
      catch { /* The next status snapshot is authoritative. */ }
    };
    events.onerror = () => { events.close(); fallback = true; refresh(); };
  }
  const timer = window.setInterval(() => { if (fallback) refresh(); }, 2_000);
  return () => { active = false; window.clearInterval(timer); events?.close(); };
}
