import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { VoiceOutput } from "../../domain/types";
import { OutputSlotMenu, type OutputSlotMenuAction } from "../../ui/OutputSlotMenu";
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
  | { action: "toggle-layer"; layerId: string; enabled: boolean };

export interface VoiceLayerTimelineProps {
  composition: VoiceComposition | null;
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

export function VoiceLayerTimeline({ composition, outputs, playheadSeconds, busy, onCommand }: VoiceLayerTimelineProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [draft, setDraft] = useState({ start: "0.000", sourceIn: "0.000", sourceOut: "0.000", targetLayerId: "" });
  const drag = useRef<{ pointerId: number; x: number; startFrame: number; clipId: string; layerId: string } | null>(null);
  const selected = useMemo(() => {
    if (!composition || !selectedClipId) return null;
    for (const layer of composition.layers) {
      const clip = layer.clips.find((item) => item.id === selectedClipId);
      if (clip) return { layer, clip };
    }
    return null;
  }, [composition, selectedClipId]);
  const allClips = composition?.layers.flatMap((layer) => layer.clips) ?? [];
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
    const startFrame = framesFromSeconds(draft.start);
    if (startFrame === null || !draft.targetLayerId) return;
    onCommand({ action: "move-clip", clipId: selected.clip.id, targetLayerId: draft.targetLayerId,
      startFrame: Math.max(0, Math.min(composition.durationFrames - selected.clip.frameCount, startFrame)) });
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

  function beginDrag(event: PointerEvent<HTMLButtonElement>, clip: VoiceLayerClip, layer: VoiceLayer) {
    if (busy || event.button !== 0) return;
    const track = event.currentTarget.parentElement;
    if (!track) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, startFrame: clip.startFrame, clipId: clip.id, layerId: layer.id };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current || current.pointerId !== event.pointerId || !composition) return;
    const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
    const dx = event.clientX - current.x;
    if (width <= 0 || Math.abs(dx) < 3) return;
    const delta = Math.round(dx / width * composition.durationFrames);
    const clip = allClips.find((item) => item.id === current.clipId);
    if (!clip) return;
    onCommand({ action: "move-clip", clipId: current.clipId, targetLayerId: current.layerId,
      startFrame: Math.max(0, Math.min(composition.durationFrames - clip.frameCount, current.startFrame + delta)) });
  }

  if (!composition) return <section className="voice-layer-timeline" aria-label="Voice Output timeline"><p className="voice-layer-timeline__empty">Tạo hoặc chọn Session Version để chỉnh các layer audio.</p></section>;
  const duration = Math.max(1, composition.durationFrames);
  const playheadPercent = playheadFrame / duration * 100;
  return <section className="voice-layer-timeline" aria-label="Voice Output timeline" aria-busy={busy || undefined}>
    <header className="voice-layer-timeline__header"><strong>Audio layers</strong><small>{seconds(composition.durationFrames)} s · Layer phía sau có ưu tiên phát cao hơn</small></header>
    <div className="voice-layer-timeline__viewport">
      <div className="voice-layer-timeline__tracks" style={{ "--layer-count": composition.layers.length } as CSSProperties}>
        {composition.layers.map((layer, layerIndex) => <div className="voice-layer-timeline__row" key={layer.id} aria-label={`${layer.name}, layer ${layerIndex + 1}`}>
          <div className="voice-layer-timeline__layer-label"><b>{layer.name}</b><small>Layer {layerIndex + 1}</small><button aria-label={`${layer.enabled === false ? "Enable" : "Mute"} ${layer.name}`} disabled={busy} type="button" onClick={() => onCommand({ action: "toggle-layer", layerId: layer.id, enabled: layer.enabled === false })}>{layer.enabled === false ? "Enable" : "Mute"}</button></div>
          <div className="voice-layer-timeline__track" role="group" aria-label={`${layer.name} clips`}>
            <i className="voice-layer-timeline__playhead" aria-hidden="true" style={{ left: `${playheadPercent}%` }} />
            {layer.clips.map((clip) => {
              const output = outputs.find((item) => item.id === clip.outputId);
              const style = { left: `${clip.startFrame / duration * 100}%`, width: `${clip.frameCount / duration * 100}%` } as CSSProperties;
              return <button key={clip.id} className={`voice-layer-timeline__clip ${clip.enabled ? "" : "is-muted"} ${selectedClipId === clip.id ? "is-selected" : ""}`}
                type="button" disabled={busy} aria-pressed={selectedClipId === clip.id} aria-label={`${output?.name ?? clip.outputId} · ${layer.name} · ${seconds(clip.startFrame)}–${seconds(clipEnd(clip))} seconds`}
                style={style} onClick={() => setSelectedClipId(clip.id)} onPointerDown={(event) => beginDrag(event, clip, layer)} onPointerUp={finishDrag}
                onContextMenu={(event) => { event.preventDefault(); setSelectedClipId(clip.id); setMenu({ x: event.clientX, y: event.clientY, clipId: clip.id }); }}>
                <b>{output?.name ?? clip.outputId}</b><small>{seconds(clip.frameCount)} s</small>
              </button>;
            })}
          </div>
        </div>)}
      </div>
      <div className="voice-layer-timeline__ruler" aria-label={`Playhead ${seconds(playheadFrame)} seconds`}><span>0.000</span><span>{seconds(composition.durationFrames / 2)} s</span><span>{seconds(composition.durationFrames)} s</span></div>
    </div>
    {selected ? <fieldset className="voice-layer-timeline__edit" disabled={busy}>
      <legend>Selected clip · {outputs.find((item) => item.id === selected.clip.outputId)?.name ?? selected.clip.outputId}</legend>
      <label>Start (s)<input aria-label="Start seconds" inputMode="decimal" type="number" min="0" max={seconds(composition.durationFrames)} step="0.001" value={draft.start} onChange={(event) => setDraft((value) => ({ ...value, start: event.target.value }))} /></label>
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
      <small className="voice-layer-timeline__hint">Drag the clip to move it. Source trim can shorten the selected audio range.</small>
    </fieldset> : <p className="voice-layer-timeline__hint">Select an audio clip to edit its position, source range, layer, and playback state.</p>}
    {menu ? <OutputSlotMenu x={menu.x} y={menu.y} label={outputs.find((item) => item.id === menu.clipId)?.name ?? "Audio clip"} onClose={() => setMenu(null)} actions={menuActions} /> : null}
  </section>;
}
