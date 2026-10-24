import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  onCommand: (command: VoiceLayerTimelineCommand | Record<string, unknown>) => void;
}

function seconds(frames: number) { return (frames / FRAME_RATE).toFixed(3); }
function framesFromSeconds(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * FRAME_RATE) : null;
}
function clipEnd(clip: VoiceLayerClip) { return clip.startFrame + clip.frameCount; }

export function VoiceLayerTimeline({ composition, outputs, playheadSeconds, busy, onCommand, projectId, viewport }: VoiceLayerTimelineProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [draft, setDraft] = useState({ start: "0.000", sourceIn: "0.000", sourceOut: "0.000", targetLayerId: "" });
  const selected = useMemo(() => {
    if (!composition || !selectedClipId) return null;
    for (const layer of composition.layers) {
      const clip = layer.clips.find((item) => item.id === selectedClipId);
      if (clip) return { layer, clip };
    }
    return null;
  }, [composition, selectedClipId]);
  const playheadFrame = composition ? Math.max(0, Math.min(composition.durationFrames, Math.round(playheadSeconds * FRAME_RATE))) : 0;

  useEffect(() => {
    if (!selected) {
      setDraft({ start: "0.000", sourceIn: "0.000", sourceOut: "0.000", targetLayerId: "" });
      return;
    }
    setDraft({ start: seconds(selected.clip.startFrame), sourceIn: seconds(selected.clip.sourceStartFrame),
      sourceOut: seconds(selected.clip.sourceStartFrame + selected.clip.frameCount), targetLayerId: selected.layer.id });
  }, [selected?.clip.id, selected?.clip.startFrame, selected?.clip.sourceStartFrame, selected?.clip.frameCount, selected?.layer.id]);

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

  function applyMove() {
    if (!composition || !selected || busy) return;
    if (!draft.targetLayerId) return;
    onCommand({ action: "move-clip", clipId: selected.clip.id, targetLayerId: draft.targetLayerId,
      startFrame: selected.clip.startFrame });
  }

  function applyTrim(side: "left" | "right") {
    if (!composition || !selected || busy) return;
    const sourceFrame = framesFromSeconds(side === "left" ? draft.sourceIn : draft.sourceOut);
    if (sourceFrame === null) return;
    const endFrame = selected.clip.sourceStartFrame + selected.clip.frameCount;
    const atFrame = side === "left"
      ? selected.clip.startFrame + sourceFrame - selected.clip.sourceStartFrame
      : selected.clip.startFrame + sourceFrame - selected.clip.sourceStartFrame;
    if (side === "left" && sourceFrame > selected.clip.sourceStartFrame && sourceFrame < endFrame) onCommand({ action: "trim-left", clipId: selected.clip.id, atFrame });
    if (side === "right" && sourceFrame < endFrame && sourceFrame > selected.clip.sourceStartFrame) onCommand({ action: "trim-right", clipId: selected.clip.id, atFrame });
  }

  if (!composition) return <section className="voice-layer-timeline" aria-label="Voice Output timeline"><p className="voice-layer-timeline__empty">Tạo hoặc chọn Session Version để chỉnh các layer audio.</p></section>;
  const duration = Math.max(1, composition.durationFrames);
  const playheadPercent = playheadFrame / duration * 100;
  const canvasWidth = Math.max(viewport?.canvasWidth ?? 0, viewport?.viewportWidth ?? 0);
  const visibleStart = canvasWidth ? (viewport?.scrollLeft ?? 0) / canvasWidth * duration / FRAME_RATE : 0;
  const visibleEnd = canvasWidth ? visibleStart + (viewport?.viewportWidth ?? canvasWidth) / canvasWidth * duration / FRAME_RATE : duration / FRAME_RATE;
  const hasSolo = composition.layers.some((layer) => layer.solo);
  const canvasStyle: CSSProperties = canvasWidth ? { width: canvasWidth, transform: `translateX(-${viewport?.scrollLeft ?? 0}px)` } : { width: "100%" };
  return <section className="voice-layer-timeline" aria-label="Voice Output timeline" aria-busy={busy || undefined}>
    <header className="voice-layer-timeline__header"><strong>Audio layers · Timecode khóa</strong><small>Layer phía sau có ưu tiên phát cao hơn</small></header>
    <div className="voice-layer-timeline__viewport">
      <div className="voice-layer-timeline__tracks" style={{ "--layer-count": composition.layers.length } as CSSProperties}>
        {composition.layers.map((layer, layerIndex) => <div className="voice-layer-timeline__row" key={layer.id} aria-label={`${layer.name}, layer ${layerIndex + 1}`}>
          <div className="voice-layer-timeline__layer-label"><b title={layer.name}>{layerIndex + 1}. {layer.name}</b><div><button aria-pressed={layer.enabled === false} aria-label={`${layer.enabled === false ? "Enable" : "Mute"} ${layer.name}`} disabled={busy} type="button" onClick={() => onCommand({ action: "toggle-layer", layerId: layer.id, enabled: layer.enabled === false })}>M</button><button aria-label={`Solo ${layer.name}`} aria-pressed={Boolean(layer.solo)} disabled={busy} type="button" onClick={() => onCommand({ action: "solo-layer", layerId: layer.id, solo: !layer.solo })}>S</button></div></div>
          <div className="voice-layer-timeline__track" role="group" aria-label={`${layer.name} clips`}>
            <div className="voice-layer-timeline__canvas" style={canvasStyle}>
            <i className="voice-layer-timeline__playhead" aria-hidden="true" style={{ left: `${playheadPercent}%` }} />
            {layer.clips.map((clip) => {
              const output = outputs.find((item) => item.id === clip.outputId);
              const style = { left: `${clip.startFrame / duration * 100}%`, width: `${clip.frameCount / duration * 100}%` } as CSSProperties;
              return <button key={clip.id} className={`voice-layer-timeline__clip ${clip.enabled && layer.enabled !== false && (!hasSolo || layer.solo) ? "" : "is-muted"} ${selectedClipId === clip.id ? "is-selected" : ""}`}
                type="button" disabled={busy} aria-pressed={selectedClipId === clip.id} aria-label={`${output?.name ?? clip.outputId} · ${layer.name} · ${seconds(clip.startFrame)}–${seconds(clipEnd(clip))} seconds`}
                style={style} onClick={() => setSelectedClipId(clip.id)}
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
    {selected ? <fieldset className="voice-layer-timeline__edit" disabled={busy}>
      <legend>Selected clip · {outputs.find((item) => item.id === selected.clip.outputId)?.name ?? selected.clip.outputId}</legend>
      <label>Timecode khóa (s)<input aria-label="Start seconds" readOnly value={draft.start} /></label>
      <label>Source IN (s)<input aria-label="Source IN seconds" inputMode="decimal" type="number" min={seconds(selected.clip.sourceStartFrame)} max={seconds(selected.clip.sourceStartFrame + selected.clip.frameCount)} step="0.001" value={draft.sourceIn} onChange={(event) => setDraft((value) => ({ ...value, sourceIn: event.target.value }))} /></label>
      <label>Source OUT (s)<input aria-label="Source OUT seconds" inputMode="decimal" type="number" min={seconds(selected.clip.sourceStartFrame)} max={seconds(selected.clip.sourceStartFrame + selected.clip.frameCount)} step="0.001" value={draft.sourceOut} onChange={(event) => setDraft((value) => ({ ...value, sourceOut: event.target.value }))} /></label>
      <label>Move to layer<select aria-label="Move clip to layer" value={draft.targetLayerId} onChange={(event) => setDraft((value) => ({ ...value, targetLayerId: event.target.value }))}>{composition.layers.map((layer) => <option value={layer.id} key={layer.id}>{layer.name}</option>)}</select></label>
      <div className="voice-layer-timeline__edit-actions">
        <button type="button" onClick={applyMove}>Move clip</button>
        <button type="button" onClick={() => applyTrim("left")}>Apply Source IN</button>
        <button type="button" onClick={() => applyTrim("right")}>Apply Source OUT</button>
        <button type="button" disabled={playheadFrame <= selected.clip.startFrame || playheadFrame >= clipEnd(selected.clip)} onClick={() => onCommand({ action: "split-clip", clipId: selected.clip.id, atFrame: playheadFrame, newClipId: crypto.randomUUID() })}>Split at playhead</button>
        <button type="button" onClick={() => onCommand({ action: "toggle-clip", clipId: selected.clip.id, enabled: !selected.clip.enabled })}>{selected.clip.enabled ? "Mute clip" : "Enable clip"}</button>
        <button className="is-destructive" type="button" onClick={() => { onCommand({ action: "delete-clip", clipId: selected.clip.id }); setSelectedClipId(null); }}>Delete clip</button>
      </div>
      <small className="voice-layer-timeline__hint">Chuyển layer giữ nguyên timecode và Source IN/OUT. Trim/Split chỉ chỉnh vùng âm thanh được chọn.</small>
    </fieldset> : null}
    {menu ? <OutputSlotMenu x={menu.x} y={menu.y} label={outputs.find((item) => item.id === menu.clipId)?.name ?? "Audio clip"} onClose={() => setMenu(null)} actions={menuActions} /> : null}
  </section>;
}
