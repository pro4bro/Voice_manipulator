import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { StudioWord } from "../../domain/types";
import type { SubtitleAlignmentRow } from "../../domain/subtitle-alignment";
import "./subtitle-timing-preview.css";

export interface TimingPreview {
  assetId: string;
  sourceWordsKey: string;
  rows: SubtitleAlignmentRow[];
  conflictIndexes: number[];
}
const TimingContext = createContext<{ preview: TimingPreview | null; setPreview: (value: TimingPreview | null) => void } | null>(null);
export function SubtitleTimingProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<TimingPreview | null>(null);
  const value = useMemo(() => ({ preview, setPreview }), [preview]);
  return <TimingContext.Provider value={value}>{children}</TimingContext.Provider>;
}
export function useSubtitleTimingPreview() { return useContext(TimingContext); }

export function ghostIntervals(preview: TimingPreview | null, assetId: string | undefined, words: StudioWord[], start: number, span: number) {
  if (!preview || preview.assetId !== assetId || preview.sourceWordsKey !== JSON.stringify(words) || span <= 0) return [];
  return preview.rows.filter((row) => row.status !== "locked" && (row.before.start !== row.after.start || row.before.end !== row.after.end))
    .filter((row) => row.after.start !== null && row.after.end !== null && row.after.end > start && row.after.start < start + span)
    .map((row) => ({ index: row.index, text: row.text, left: (row.after.start! - start) / span,
      width: (row.after.end! - row.after.start!) / span, conflict: preview.conflictIndexes.includes(row.index) }));
}

/** One viewport-sized canvas keeps long transcripts out of the DOM. */
export function SubtitleTimingGhosts({ assetId, words, start, span, style }: {
  assetId?: string; words: StudioWord[]; start: number; span: number; style?: CSSProperties;
}) {
  const timing = useSubtitleTimingPreview();
  const ghosts = useMemo(() => ghostIntervals(timing?.preview ?? null, assetId, words, start, span), [timing?.preview, assetId, words, start, span]);
  const retained = useMemo(() => words.flatMap((word, index) => word.subtitleTimingConflict && span > 0 &&
    Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start && word.end > start && word.start < start + span
    ? [{ index, text: word.text, left: (word.start - start) / span, width: (word.end - word.start) / span, conflict: true }] : []), [words, start, span]);
  const rows = ghosts.length ? ghosts : retained;
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node || !rows.length) return;
    function draw() {
      const width = node!.getBoundingClientRect().width || 1000;
      const scale = window.devicePixelRatio || 1;
      node!.width = Math.ceil(width * scale); node!.height = 24 * scale;
      const context = node!.getContext("2d");
      if (!context) return;
      context.scale(scale, scale);
      const colors = getComputedStyle(node!);
      const fill = colors.getPropertyValue("--lime").trim() || "#85a83e";
      const text = colors.getPropertyValue("--text").trim() || "#eee";
      const warning = colors.getPropertyValue("--red").trim() || "#d63f3f";
      context.font = "12px Arial";
      for (const row of rows) {
        const left = row.left * width, boxWidth = Math.max(1, row.width * width);
        context.globalAlpha = .3; context.fillStyle = row.conflict ? warning : fill;
        context.fillRect(left, 1, boxWidth, 21);
        context.globalAlpha = .8; context.strokeStyle = row.conflict ? warning : fill;
        context.strokeRect(left + .5, 1.5, Math.max(1, boxWidth - 1), 20);
        if (boxWidth > 18) {
          context.save(); context.beginPath(); context.rect(left, 1, boxWidth, 21); context.clip();
          context.globalAlpha = .8; context.fillStyle = row.conflict ? warning : text;
          context.fillText(row.text, left + 2, 16); context.restore();
        }
      }
    }
    draw();
    const observer = new ResizeObserver(draw); observer.observe(node);
    return () => observer.disconnect();
  }, [rows]);
  if (!rows.length) return null;
  return <canvas ref={canvas} style={{ ...style, top: ghosts.length ? -26 : 3 }} role="img" aria-label={ghosts.length ? `Ghost Preview · ${rows.length} từ · ${rows.filter((row) => row.conflict).length} từ xung đột` : `Xung đột timing · ${rows.length} từ`}
    className={`subtitle-timing-ghosts ${rows.some((row) => row.conflict) ? "has-conflict" : ""}`} />;
}
