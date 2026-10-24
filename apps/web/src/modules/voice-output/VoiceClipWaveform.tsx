import { useEffect, useMemo, useState } from "react";
import type { VoiceLayerClip } from "./VoiceLayerTimeline";

const RATE = 24_000;
interface Envelope { start: number; end: number; points: Array<{ min: number; max: number }> }

/** Request only the visible source interval. The lower waveform is discarded,
 * not reflected into the upper half, and no envelope is synthesized on failure. */
export function VoiceClipWaveform({ projectId, clip, visibleStart, visibleEnd, pixelsPerSecond }: {
  projectId?: string; clip: VoiceLayerClip; visibleStart: number; visibleEnd: number; pixelsPerSecond: number;
}) {
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [failed, setFailed] = useState(false);
  const first = Math.max(clip.startFrame / RATE, visibleStart);
  const last = Math.min((clip.startFrame + clip.frameCount) / RATE, visibleEnd);
  const sourceStart = clip.sourceStartFrame / RATE + first - clip.startFrame / RATE;
  const sourceEnd = sourceStart + last - first;
  const points = Math.max(32, Math.min(4096, Math.ceil((last - first) * pixelsPerSecond)));
  useEffect(() => {
    setEnvelope(null); setFailed(false);
    if (!projectId || last <= first) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ start: sourceStart.toFixed(6), end: sourceEnd.toFixed(6), points: String(points) });
      void fetch(`/api/projects/${encodeURIComponent(projectId)}/voice-outputs/${encodeURIComponent(clip.outputId)}/waveform?${query}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Clip waveform unavailable");
          const data = await response.json() as Envelope;
          if (!Number.isFinite(data.start) || !Number.isFinite(data.end) || data.end <= data.start || !data.points?.length ||
              data.points.some((point) => !Number.isFinite(point.min) || !Number.isFinite(point.max))) throw new Error("Invalid clip envelope");
          if (!controller.signal.aborted) setEnvelope(data);
        }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }, 160);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [projectId, clip.outputId, sourceStart, sourceEnd, points, first, last]);
  const path = useMemo(() => envelope ? `M0,24 ${envelope.points.map((point, index) =>
    `L${((index + .5) / envelope.points.length * 1000).toFixed(2)},${(24 - Math.max(0, Math.min(1, point.max)) * 24).toFixed(2)}`).join(" ")} L1000,24 Z` : "", [envelope]);
  if (!projectId || last <= first) return null;
  if (!envelope) return <span className="voice-clip-waveform-status">{failed ? "Waveform chưa tải được" : "Đang tải waveform…"}</span>;
  return <svg className="voice-clip-waveform" role="img" aria-label="Upper half source PCM waveform" viewBox="0 0 1000 24" preserveAspectRatio="none"
    style={{ left: `${(envelope.start * RATE - clip.sourceStartFrame) / clip.frameCount * 100}%`, width: `${(envelope.end - envelope.start) * RATE / clip.frameCount * 100}%` }}>
    <path d={path} />
  </svg>;
}
