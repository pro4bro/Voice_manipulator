import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { VoiceOutput } from "../../domain/types";
import { OutputSlotMenu, type OutputSlotMenuAction } from "../../ui/OutputSlotMenu";
import type { TimelineLayerViewport } from "../timeline/Timeline";
import { VoiceClipWaveform } from "./VoiceClipWaveform";
import "./voice-layer-timeline.css";

const FRAME_RATE = 24_000;

export interface VoiceLayerClip {
  id: string;
  outputId: string;
  startFrame: number;
  sourceStartFrame: number;
  frameCount: number;
  enabled: boolean;
}

export interface VoiceLayer {
  id: string;
  name: string;
  enabled?: boolean;
  solo?: boolean;
  clips: VoiceLayerClip[];
}

export interface VoiceComposition {
  revision: number;
  durationFrames: number;
  layers: VoiceLayer[];
}

export type VoiceLayerTimelineCommand =
  | { action: "cut-clip"; clipId: string; atFrames: number[] }
  | { action: "uncut-clip"; clipId: string }
  | { action: "reset-composition" }
  | { action: "delete-clip"; clipId: string }
  | { action: "split-clip"; clipId: string; atFrame: number; newClipId: string }
  | { action: "trim-left" | "trim-right"; clipId: string; atFrame: number }
  | { action: "move-clip"; clipId: string; targetLayerId: string; startFrame: number }
  | { action: "toggle-clip"; clipId: string; enabled: boolean }
  | { action: "toggle-layer"; layerId: string; enabled: boolean }
  | { action: "solo-layer"; layerId: string; solo: boolean };

export interface VoiceLayerTimelineProps {
  composition: VoiceComposition | null;
  projectId?: string;
  viewport?: TimelineLayerViewport;
  outputs: VoiceOutput[];
  playheadSeconds: number;
  busy: boolean;
  selectedClipId?: string | null;
  onSelectClip?: (id: string | null) => void;
  onCommand: (command: VoiceLayerTimelineCommand | Record<string, unknown>) => void;
}

function seconds(frames: number) { return (frames / FRAME_RATE).toFixed(3); }
function clipEnd(clip: VoiceLayerClip) { return clip.startFrame + clip.frameCount; }

export function VoiceLayerTimeline({ composition, outputs, playheadSeconds, busy, onCommand, projectId, viewport, selectedClipId: controlledSelection, onSelectClip }: VoiceLayerTimelineProps) {
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const selectedClipId = controlledSelection === undefined ? localSelection : controlledSelection;
  function setSelectedClipId(id: string | null) { setLocalSelection(id); onSelectClip?.(id); }
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; clip: VoiceLayerClip; layerId: string; x: number; y: number; originY: number; moved: boolean } | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const [dropLayerId, setDropLayerId] = useState<string | null>(null);
  const playheadFrame = composition ? Math.max(0, Math.min(composition.durationFrames, Math.round(playheadSeconds * FRAME_RATE))) : 0;

  useEffect(() => {
    const cancel = () => stopDrag();
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); };
  }, []);

  function layerAt(y: number) {
    const stack = root.current?.closest<HTMLElement>(".timeline-stack-scroll");
    const pane = stack ?? root.current?.closest<HTMLElement>(".timeline-audio-layers");
    if (pane) {
      const rect = pane.getBoundingClientRect();
      const subtitles = stack?.querySelector(".timeline-sticky-subtitles")?.getBoundingClientRect();
      if (y < Math.max(rect.top, subtitles?.bottom ?? rect.top) || y > rect.bottom) return null;
    }
    return Array.from(root.current?.querySelectorAll<HTMLElement>("[data-layer-id]") ?? []).find((row) => {
      const rect = row.getBoundingClientRect(); return y >= rect.top && y <= rect.bottom;
    })?.dataset.layerId ?? null;
  }
  function stopDrag() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null; drag.current = null; setDropLayerId(null);
  }
  function beginDrag(event: PointerEvent<HTMLButtonElement>, clip: VoiceLayerClip, layerId: string) {
    if (busy || event.button !== 0) return;
    event.preventDefault(); setSelectedClipId(clip.id);
    drag.current = { pointerId: event.pointerId, clip, layerId, x: event.clientX, y: event.clientY, originY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    let previous = performance.now();
    const tick = (now: number) => {
      const current = drag.current;
      if (!current) return;
      const pane = root.current?.closest<HTMLElement>(".timeline-stack-scroll") ?? root.current?.closest<HTMLElement>(".timeline-audio-layers");
      if (pane && current.moved) {
        const bounds = pane.getBoundingClientRect();
        const top = bounds.top + (pane.matches(".timeline-stack-scroll") ? 48 : 0);
        const direction = current.y < top + 24 ? -1 : current.y > bounds.bottom - 24 ? 1 : 0;
        if (direction) pane.scrollTop += direction * Math.min(50, now - previous) / 1000 * 180;
        setDropLayerId(layerAt(current.y));
      }
      previous = now; scrollFrame.current = requestAnimationFrame(tick);
    };
    scrollFrame.current = requestAnimationFrame(tick);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.y = event.clientY;
    if (Math.abs(event.clientY - current.originY) >= 4) current.moved = true;
    if (current.moved) setDropLayerId(layerAt(event.clientY));
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current, target = layerAt(event.clientY);
    stopDrag();
    if (!busy && current?.pointerId === event.pointerId && current.moved && target && target !== current.layerId) {
      onCommand({ action: "move-clip", clipId: current.clip.id, targetLayerId: target, startFrame: current.clip.startFrame });
    }
  }

  function commandForClip(clipId: string, action: (clip: VoiceLayerClip, layer: VoiceLayer) => OutputSlotMenuAction[]) {
    const layer = composition?.layers.find((item) => item.clips.some((clip) => clip.id === clipId));
    const clip = layer?.clips.find((item) => item.id === clipId);
    return clip && layer ? action(clip, layer) : [];
  }
  const menuActions: OutputSlotMenuAction[] = menu ? commandForClip(menu.clipId, (clip) => {
    const canSplit = playheadFrame > clip.startFrame && playheadFrame < clipEnd(clip);
    return [
      ...(canSplit ? [{ id: "split", label: "Split at playhead", onSelect: () => onCommand({ action: "split-clip", clipId: clip.id, atFrame: playheadFrame, newClipId: crypto.randomUUID() }) }] : []),
      { id: "toggle", label: clip.enabled ? "Mute clip" : "Enable clip", onSelect: () => onCommand({ action: "toggle-clip", clipId: clip.id, enabled: !clip.enabled }) },
      { id: "delete", label: "Delete clip", destructive: true, onSelect: () => { onCommand({ action: "delete-clip", clipId: clip.id }); if (selectedClipId === clip.id) setSelectedClipId(null); } },
    ];
  }) : [];

  if (!composition) return <section className="voice-layer-timeline" aria-label="Voice Output timeline"><p className="voice-layer-timeline__empty">Tạo hoặc chọn Session Version để chỉnh các layer audio.</p></section>;
  const duration = Math.max(1, composition.durationFrames);
  const playheadPercent = playheadFrame / duration * 100;
  const canvasWidth = Math.max(viewport?.canvasWidth ?? 0, viewport?.viewportWidth ?? 0);
  const visibleStart = canvasWidth ? (viewport?.scrollLeft ?? 0) / canvasWidth * duration / FRAME_RATE : 0;
  const visibleEnd = canvasWidth ? visibleStart + (viewport?.viewportWidth ?? canvasWidth) / canvasWidth * duration / FRAME_RATE : duration / FRAME_RATE;
  const hasSolo = composition.layers.some((layer) => layer.solo);
  const canvasStyle: CSSProperties = canvasWidth ? { width: canvasWidth, transform: `translateX(-${viewport?.scrollLeft ?? 0}px)` } : { width: "100%" };
  return <section ref={root} className="voice-layer-timeline" aria-label="Voice Output timeline" aria-busy={busy || undefined} onKeyDown={(event) => { if (event.key === "Escape") { stopDrag(); setSelectedClipId(null); } }}>
    <header className="voice-layer-timeline__header"><strong>Audio layers · Timecode khóa</strong><small>Layer phía sau có ưu tiên phát cao hơn</small></header>
    <div className="voice-layer-timeline__viewport">
      <div className="voice-layer-timeline__tracks" style={{ "--layer-count": composition.layers.length } as CSSProperties}>
        {composition.layers.map((layer, layerIndex) => <div className={`voice-layer-timeline__row ${dropLayerId === layer.id ? "is-drop-target" : ""}`} data-layer-id={layer.id} key={layer.id} aria-label={`${layer.name}, layer ${layerIndex + 1}`}>
          <div className="voice-layer-timeline__layer-label"><b title={layer.name}>{layerIndex + 1}. {layer.name}</b><div><button aria-pressed={layer.enabled === false} aria-label={`${layer.enabled === false ? "Enable" : "Mute"} ${layer.name}`} disabled={busy} type="button" onClick={() => onCommand({ action: "toggle-layer", layerId: layer.id, enabled: layer.enabled === false })}>M</button><button aria-label={`Solo ${layer.name}`} aria-pressed={Boolean(layer.solo)} disabled={busy} type="button" onClick={() => onCommand({ action: "solo-layer", layerId: layer.id, solo: !layer.solo })}>S</button></div></div>
          <div className="voice-layer-timeline__track" role="group" aria-label={`${layer.name} clips`} onClick={(event) => { if (!(event.target as Element).closest("button")) setSelectedClipId(null); }}>
            <div className="voice-layer-timeline__canvas" style={canvasStyle}>
            <i className="voice-layer-timeline__playhead" aria-hidden="true" style={{ left: `${playheadPercent}%` }} />
            {layer.clips.map((clip) => {
              const output = outputs.find((item) => item.id === clip.outputId);
              const style = { left: `${clip.startFrame / duration * 100}%`, width: `${clip.frameCount / duration * 100}%` } as CSSProperties;
              return <button key={clip.id} className={`voice-layer-timeline__clip ${clip.enabled && layer.enabled !== false && (!hasSolo || layer.solo) ? "" : "is-muted"} ${selectedClipId === clip.id ? "is-selected" : ""}`}
                type="button" disabled={busy} aria-pressed={selectedClipId === clip.id} aria-label={`${output?.name ?? clip.outputId} · ${layer.name} · ${seconds(clip.startFrame)}–${seconds(clipEnd(clip))} seconds`}
                style={style} onClick={() => setSelectedClipId(clip.id)}
                onPointerDown={(event) => beginDrag(event, clip, layer.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
                onKeyDown={(event) => { if (busy || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return; const target = composition.layers[layerIndex + (event.key === "ArrowUp" ? -1 : 1)]; if (target) { event.preventDefault(); onCommand({ action: "move-clip", clipId: clip.id, targetLayerId: target.id, startFrame: clip.startFrame }); } }}
                onContextMenu={(event) => { event.preventDefault(); setSelectedClipId(clip.id); setMenu({ x: event.clientX, y: event.clientY, clipId: clip.id }); }}>
                <b>{output?.name ?? clip.outputId}</b>
                <VoiceClipWaveform projectId={projectId} clip={clip} visibleStart={visibleStart} visibleEnd={visibleEnd} pixelsPerSecond={canvasWidth ? canvasWidth / (duration / FRAME_RATE) : 100} />
              </button>;
            })}
            </div>
          </div>
        </div>)}
      </div>
    </div>
    {menu ? <OutputSlotMenu x={menu.x} y={menu.y} label={outputs.find((item) => item.id === menu.clipId)?.name ?? "Audio clip"} onClose={() => setMenu(null)} actions={menuActions} /> : null}
  </section>;
}
