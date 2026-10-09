import { useEffect, useMemo, useState } from "react";
import type { WaveformPoint } from "../../domain/types";
import { waveformEnvelopePath } from "./waveform-path";

type Snapshot = { url: string; start: number; end: number; points: WaveformPoint[] };

/** Completed OBS tracks read the same PCM peaks as the ordinary Timeline. */
export function ArchivedObsWaveform({ url, windowStart, windowSpan, duration, width, gain, fallbackPath }: {
  url: string; windowStart: number; windowSpan: number; duration: number;
  width: number; gain: number; fallbackPath: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const pointCount = Math.max(1024, Math.min(16000, Math.ceil(width * Math.max(1, window.devicePixelRatio || 1) * 1.5)));
  useEffect(() => {
    if (!(duration > 0) || windowStart >= duration) return;
    const controller = new AbortController();
    let active = true;
    let retryTimer: number | undefined;
    setState("loading");
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ start: String(windowStart),
        end: String(Math.min(duration, windowStart + windowSpan)), points: String(pointCount) });
      void fetch(`${url}?${query}`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("PCM waveform unavailable");
        const data = await response.json() as { start: number; end: number; points: WaveformPoint[] };
        if (!Number.isFinite(data.start) || !Number.isFinite(data.end) || data.end <= data.start ||
            !data.points?.length || data.points.some((point) => !Number.isFinite(point.min) || !Number.isFinite(point.max))) {
          throw new Error("Invalid PCM waveform");
        }
        if (!active) return;
        setSnapshot({ url, start: data.start, end: data.end, points: data.points });
        setState("ready");
      }).catch(() => {
        if (!active) return;
        setState("error");
        retryTimer = window.setTimeout(() => setRetry((value) => value + 1), 2000);
      });
    }, 120);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); window.clearTimeout(retryTimer); };
  }, [url, windowStart, windowSpan, duration, pointCount, retry]);
  const path = useMemo(() => {
    if (!snapshot || snapshot.url !== url || snapshot.end <= windowStart || snapshot.start >= windowStart + windowSpan) return "";
    const step = (snapshot.end - snapshot.start) / Math.max(1, snapshot.points.length - 1);
    return waveformEnvelopePath(snapshot.points.flatMap((point, index) => {
      const time = snapshot.start + step * index;
      return time + step < windowStart || time - step > windowStart + windowSpan ? [] : [{
        x: (time - windowStart) / windowSpan * 1000, min: point.min, max: point.max,
      }];
    }), 60, gain);
  }, [snapshot, url, windowStart, windowSpan, gain]);
  return <>
    <svg aria-hidden="true" className="timeline-waveform__svg" data-waveform-source={path ? "pcm-detail" : "live-preview"}
      preserveAspectRatio="none" viewBox="0 0 1000 60"><path d={path || fallbackPath} /></svg>
    {state !== "ready" ? <span className={`obs-timeline__pcm-status${state === "error" ? " is-error" : ""}`}>
      {state === "error" ? "Không tải được waveform PCM · đang thử lại" : "Đang tải waveform PCM…"}
    </span> : null}
  </>;
}
