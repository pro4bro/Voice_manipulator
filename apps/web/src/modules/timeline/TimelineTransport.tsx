import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import "./timeline-transport.css";

/** Layout only: each Timeline retains its own playback and pointer handlers. */
export function TimelineTransport({ current, duration, playButton, children, layout }: {
  current: string;
  duration: string;
  playButton: ReactNode;
  children: ReactNode;
  layout?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: 124, end: 0 });
  useLayoutEffect(() => {
    const bar = ref.current;
    const frame = bar?.closest(".timeline-module");
    const viewport = frame?.querySelector<HTMLElement>(".obs-timeline__viewport, .timeline-scroll");
    if (!bar || !viewport) return;
    function measure() {
      if (!bar || !viewport) return;
      const bounds = bar.getBoundingClientRect(), view = viewport.getBoundingClientRect();
      if (!bounds.width || !view.width) return;
      // Layer labels scroll with the tracks; clamp to the visible waveform area.
      // clientWidth also excludes a vertical scrollbar, when one is present.
      const ruler = viewport.querySelector<HTMLElement>(".is-layers > .obs-timeline__ruler");
      const left = Math.max(view.left + viewport.clientLeft, ruler?.getBoundingClientRect().left ?? view.left);
      const right = view.left + viewport.clientLeft + viewport.clientWidth;
      const next = { start: Math.max(0, left - bounds.left), end: Math.max(0, bounds.right - right) };
      setEdges((old) => old.start === next.start && old.end === next.end ? old : next);
    }
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(bar);
    const tracks = viewport.querySelector(".obs-timeline__track-scroll");
    if (tracks) observer?.observe(tracks);
    viewport.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); viewport.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [layout]);
  return <div ref={ref} className={`transport-bar timeline-transport ${edges.start < 110 ? "timeline-transport--full-width" : ""}`}
    style={{ "--transport-start": `${edges.start}px`, "--transport-end": `${edges.end}px` } as CSSProperties}>
    <div className="timeline-transport__left">
      {playButton}
      <div className="timeline-transport__clocks">
        <code aria-label="Thời điểm hiện tại">{current}</code>
        <code aria-label="Tổng thời lượng">{duration}</code>
      </div>
    </div>
    {children}
  </div>;
}

export function TimelinePlaybackSettings({ rate, onRateChange, children, rates = [.5, .75, 1, 1.25, 1.5, 2] }: {
  rate: number;
  onRateChange: (rate: number) => void;
  children?: ReactNode;
  rates?: number[];
}) {
  return <div className="timeline-playback-settings" role="group" aria-label="Thiết lập phát Timeline">
    <label className="transport-rate"><span>RATE</span>
      <select aria-label="Tốc độ phát" onChange={(event) => onRateChange(Number(event.target.value))} value={rate}>
        {rates.map((value) => <option key={value} value={value}>{value}×</option>)}
      </select>
    </label>
    {children}
  </div>;
}
