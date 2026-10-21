import type { ScrubPreviewRange } from "./audio-scrubbing";

/** The overlay and audio share source-time bounds; viewport clipping is visual only. */
export function ScrubPreviewOverlay({ range, windowStart = 0, windowSpan }: {
  range: ScrubPreviewRange | null; windowStart?: number; windowSpan: number;
}) {
  if (!range || windowSpan <= 0) return null;
  const start = Math.max(windowStart, range.start), end = Math.min(windowStart + windowSpan, range.end);
  if (end <= start) return null;
  return <span className="timeline-scrub-preview" role="img"
    aria-label={`Đoạn nghe thử ${range.start.toFixed(3)}–${range.end.toFixed(3)} giây`}
    data-start={range.start} data-end={range.end}
    style={{ left: `${(start - windowStart) / windowSpan * 100}%`, width: `${(end - start) / windowSpan * 100}%` }} />;
}
