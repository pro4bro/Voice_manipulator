import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { clampPlacement, clipLength, type ClipPlacement } from "../lip-sync/alignment";
import { Icon } from "../../ui/Icon";
import { ModuleFrame } from "../../ui/ModuleFrame";
import { rulerMarks } from "./ruler";

type ClipKind = "video" | "audio";
type DragMode = "move" | "trim-start" | "trim-end";

export interface AlignmentClip {
  name: string;
  duration: number;
  placement: ClipPlacement;
}

export interface TimelineAlignmentProps {
  duration: number;
  video: AlignmentClip | null;
  audio: AlignmentClip | null;
  audioUrl?: string;
  playhead: number;
  playing: boolean;
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
  onPlacementChange: (kind: ClipKind, placement: ClipPlacement) => void;
}

interface EnvelopePoint { min: number; max: number }

function timecode(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centiseconds / 6000);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function waveformPath(points: EnvelopePoint[]): string {
  if (!points.length) return "";
  return points.map((point, index) => {
    const x = index / Math.max(1, points.length - 1) * 1000;
    return `M${x.toFixed(2)} ${(50 - point.max * 44).toFixed(2)}V${(50 - point.min * 44).toFixed(2)}`;
  }).join(" ");
}

/** LipSync uses the same Timeline frame, ruler, zoom, scroll and transport as Input.
 * Its two source clips sit on the shared clock without editing source media. */
export function TimelineAlignment({ duration, video, audio, audioUrl, playhead, playing, onSeek, onTogglePlay, onPlacementChange }: TimelineAlignmentProps) {
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ left: 0, width: 0 });
  const [envelope, setEnvelope] = useState<EnvelopePoint[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: ClipKind; mode: DragMode; x: number; width: number; duration: number; placement: ClipPlacement } | null>(null);
  const safeDuration = Math.max(1, duration);
  const canvasWidth = viewport.width * zoom;
  const marks = useMemo(() => rulerMarks(safeDuration, canvasWidth, viewport), [safeDuration, canvasWidth, viewport]);
  const audioWaveformPath = useMemo(() => waveformPath(envelope), [envelope]);
  const playheadPercent = Math.min(100, playhead / safeDuration * 100);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const update = () => setViewport({ left: scroller.scrollLeft, width: scroller.clientWidth });
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!audioUrl || !audio) { setEnvelope([]); return; }
    const controller = new AbortController();
    const end = Math.min(audio.duration, audio.placement.outPoint ?? audio.duration);
    if (end - audio.placement.inPoint < 0.1) { setEnvelope([]); return; }
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ start: audio.placement.inPoint.toFixed(3), end: end.toFixed(3), points: "1200" });
      void fetch(`${audioUrl.replace(/\/audio(?:\?.*)?$/u, "/waveform")}?${query}`, { signal: controller.signal })
        .then((response) => { if (!response.ok) throw new Error("waveform"); return response.json(); })
        .then((data: { points?: EnvelopePoint[] }) => setEnvelope(data.points ?? []))
        .catch(() => { if (!controller.signal.aborted) setEnvelope([]); });
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [audioUrl, audio?.duration, audio?.placement.inPoint, audio?.placement.outPoint]);

  function seekOnCanvas(event: PointerEvent<HTMLDivElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect?.width) onSeek(clampPlacement((event.clientX - rect.left) / rect.width * safeDuration, safeDuration));
  }

  function beginClipDrag(kind: ClipKind, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const clip = kind === "video" ? video : audio;
    const width = canvasRef.current?.getBoundingClientRect().width ?? 0;
    if (!clip || width <= 0) return;
    const mode = (event.target as HTMLElement).closest<HTMLElement>("[data-drag-mode]")?.dataset.dragMode as DragMode | undefined;
    if (!mode) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { kind, mode, x: event.clientX, width, duration: safeDuration, placement: { ...clip.placement } };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveClipDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const clip = drag.kind === "video" ? video : audio;
    if (!clip) return;
    const delta = (event.clientX - drag.x) / drag.width * drag.duration;
    const origin = drag.placement;
    const end = Math.min(clip.duration, origin.outPoint ?? clip.duration);
    let placement: ClipPlacement;
    if (drag.mode === "move") placement = { ...origin, start: clampPlacement(origin.start + delta, 36000) };
    else if (drag.mode === "trim-start") {
      const move = Math.max(-origin.inPoint, Math.min(end - origin.inPoint - 0.1, delta));
      placement = { ...origin, start: clampPlacement(origin.start + move, 36000), inPoint: clampPlacement(origin.inPoint + move, end - 0.1) };
      // The timeline cannot place a clip before zero: keep its source and
      // timeline edges together when the left handle reaches that boundary.
      if (placement.start === 0) placement.inPoint = clampPlacement(origin.inPoint - origin.start, end - 0.1);
    } else placement = { ...origin, outPoint: clampPlacement(end + delta, clip.duration) };
    if (drag.mode === "trim-end") placement.outPoint = Math.max(origin.inPoint + 0.1, placement.outPoint ?? clip.duration);
    onPlacementChange(drag.kind, placement);
  }

  function endClipDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (cancelled && dragRef.current) onPlacementChange(dragRef.current.kind, dragRef.current.placement);
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* capture may already be lost */ }
  }

  function nudge(kind: ClipKind, mode: DragMode, seconds: number) {
    const clip = kind === "video" ? video : audio;
    if (!clip) return;
    const place = clip.placement;
    const end = place.outPoint ?? clip.duration;
    if (mode === "move") onPlacementChange(kind, { ...place, start: clampPlacement(place.start + seconds, 36000) });
    else if (mode === "trim-start") {
      const move = Math.max(-Math.min(place.start, place.inPoint), Math.min(end - place.inPoint - 0.1, seconds));
      onPlacementChange(kind, { ...place, start: clampPlacement(place.start + move, 36000), inPoint: clampPlacement(place.inPoint + move, end - 0.1) });
    } else onPlacementChange(kind, { ...place, outPoint: Math.max(place.inPoint + 0.1, clampPlacement(end + seconds, clip.duration)) });
  }

  function renderClip(kind: ClipKind, clip: AlignmentClip | null) {
    if (!clip) return <span className="alignment-empty">{kind === "video" ? "Chọn video từ Media Pool" : "Chọn Voice Output"}</span>;
    const left = clip.placement.start / safeDuration * 100;
    const width = clipLength(clip.duration, clip.placement) / safeDuration * 100;
    return <div aria-label={`${kind === "video" ? "Video" : "Voice"}: ${clip.name}`} className={`alignment-clip alignment-clip--${kind}`}
      onPointerDown={(event) => beginClipDrag(kind, event)} onPointerMove={moveClipDrag} onPointerUp={endClipDrag} onPointerCancel={(event) => endClipDrag(event, true)} onLostPointerCapture={() => { dragRef.current = null; }}
      style={{ left: `${left}%`, width: `${width}%` }}>
      <button aria-label={`Co mép đầu ${kind === "video" ? "video" : "voice"}`} className="alignment-clip__handle" data-drag-mode="trim-start" onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); nudge(kind, "trim-start", event.key === "ArrowLeft" ? -0.05 : 0.05); } }} title="Kéo để chỉnh điểm IN" type="button" />
      <button aria-label={`Di chuyển ${kind === "video" ? "video" : "voice"} ${clip.name}`} className="alignment-clip__body" data-drag-mode="move" onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); nudge(kind, "move", event.key === "ArrowLeft" ? -0.05 : 0.05); } }} title="Kéo để dời clip · phím mũi tên ±0.05 giây" type="button">
        {kind === "audio" && envelope.length ? <svg aria-label="Voice waveform" preserveAspectRatio="none" viewBox="0 0 1000 100"><path d={audioWaveformPath} /></svg> : null}
        <span>{clip.name}</span>
      </button>
      <button aria-label={`Co mép cuối ${kind === "video" ? "video" : "voice"}`} className="alignment-clip__handle" data-drag-mode="trim-end" onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); nudge(kind, "trim-end", event.key === "ArrowLeft" ? -0.05 : 0.05); } }} title="Kéo để chỉnh điểm OUT" type="button" />
    </div>;
  }

  const navigatorWidth = 100 / zoom;
  const navigatorLeft = viewport.width && canvasWidth > viewport.width ? viewport.left / (canvasWidth - viewport.width) * (100 - navigatorWidth) : 0;
  return <ModuleFrame title="Timeline" index="A1" eyebrow="VIDEO / GENERATED VOICE" tone="dark" className="timeline-module timeline-module--alignment"
    action={<div className="timeline-header-actions"><span className="alignment-toolbar-hint">KÉO CLIP ĐỂ DỜI · KÉO MÉP ĐỂ CẮT</span><div className="timeline-zoom"><button aria-label="Thu nhỏ timeline" onClick={() => setZoom((value) => Math.max(1, value / 2))} type="button">−</button><input aria-label="Zoom timeline" max="16" min="1" onChange={(event) => setZoom(Number(event.target.value))} step="0.1" type="range" value={zoom} /><span>{zoom.toFixed(1)}×</span><button aria-label="Phóng to timeline" onClick={() => setZoom((value) => Math.min(16, value * 2))} type="button">+</button></div></div>}>
    <div className="timeline-section-strip alignment-section-strip"><span>{video ? `VIDEO · ${timecode(video.placement.start)}–${timecode(video.placement.start + clipLength(video.duration, video.placement))}` : "VIDEO · —"}</span><span>{audio ? `VOICE · ${timecode(audio.placement.start)}–${timecode(audio.placement.start + clipLength(audio.duration, audio.placement))}` : "VOICE · —"}</span></div>
    <div className="timeline-stage"><div className="alignment-track-labels"><span>VIDEO</span><span>VOICE</span></div><div className="timeline-scroll-shell"><div className="timeline-scroll" onScroll={(event) => setViewport({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })} ref={scrollRef}><div className="timeline-canvas alignment-canvas" ref={canvasRef} style={{ "--zoom": zoom } as CSSProperties}>
      <div className="timeline-ruler" onPointerDown={seekOnCanvas}>{marks.map((mark) => <span key={mark.time} style={{ left: `${mark.position * 100}%` }}>{mark.label}</span>)}</div>
      <div className="alignment-track alignment-track--video" onPointerDown={(event) => { if (event.target === event.currentTarget) seekOnCanvas(event); }}>{renderClip("video", video)}</div>
      <div className="alignment-track alignment-track--voice" onPointerDown={(event) => { if (event.target === event.currentTarget) seekOnCanvas(event); }}>{renderClip("audio", audio)}</div>
      <div aria-hidden="true" className="timeline-playhead" style={{ left: `${playheadPercent}%` }} />
    </div></div><div aria-label="Thanh cuộn timeline" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(navigatorLeft)} className={`timeline-navigator ${zoom === 1 ? "is-static" : ""}`} onPointerDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, ratio * canvasWidth - viewport.width / 2); }} role="scrollbar" tabIndex={0}><i style={{ left: `${navigatorLeft}%`, width: `${navigatorWidth}%` }} /></div></div></div>
    <div className="transport-bar alignment-transport"><button aria-label={playing ? "Tạm dừng" : "Phát"} className="transport-button" disabled={!video && !audio} onClick={onTogglePlay} type="button"><Icon name={playing ? "pause" : "play"} /></button><code>{timecode(playhead)}</code><div aria-label="Thanh tiến trình Timeline — bấm hoặc kéo để tua" className="transport-progress" onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); onSeek(clampPlacement((event.clientX - rect.left) / rect.width * safeDuration, safeDuration)); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) { const rect = event.currentTarget.getBoundingClientRect(); onSeek(clampPlacement((event.clientX - rect.left) / rect.width * safeDuration, safeDuration)); } }} onPointerUp={(event) => event.currentTarget.releasePointerCapture?.(event.pointerId)}><i style={{ width: `${playheadPercent}%` }} /><b aria-hidden="true" style={{ left: `${playheadPercent}%` }} /></div><code>{timecode(safeDuration)}</code><span className="alignment-transport-note">Preview · nguồn gốc được giữ nguyên</span></div>
  </ModuleFrame>;
}
