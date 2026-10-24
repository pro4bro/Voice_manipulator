import { useEffect, useState } from "react";
import { Timeline, type TimelineProps } from "../timeline/Timeline";
import { VoiceLayerTimeline, type VoiceComposition, type VoiceLayerClip, type VoiceLayerTimelineProps } from "./VoiceLayerTimeline";

const RATE = 24000;
type Props = Omit<TimelineProps, "layerContent" | "clipTools"> & Pick<VoiceLayerTimelineProps, "outputs" | "projectId" | "busy" | "onCommand"> & { composition: VoiceComposition };
function contiguous(left: VoiceLayerClip, right: VoiceLayerClip) {
  return left.outputId === right.outputId && left.enabled === right.enabled &&
    left.startFrame + left.frameCount === right.startFrame && left.sourceStartFrame + left.frameCount === right.sourceStartFrame;
}

/** Own clip selection at the seam between the shared toolbar and footage lanes. */
function LayeredTimeline({ composition, outputs, projectId, busy, onCommand, ...timeline }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setSelectedId(null), [timeline.viewIdentity]);
  const layerIndex = composition.layers.findIndex((layer) => layer.clips.some((clip) => clip.id === selectedId));
  const layer = composition.layers[layerIndex];
  const selected = layer?.clips.find((clip) => clip.id === selectedId);
  const selectedIndex = layer?.clips.findIndex((clip) => clip.id === selectedId) ?? -1;
  const left = layer?.clips[selectedIndex - 1], right = layer?.clips[selectedIndex + 1];
  const canUncut = Boolean(selected && (left && contiguous(left, selected) || right && contiguous(selected, right)));
  function points(time: number, range: { start: number; end: number } | null) {
    if (!selected) return [];
    return [...new Set((range ? [range.start, range.end] : [time]).map((value) => Math.round(value * RATE)))].sort((a, b) => a - b)
      .filter((frame) => frame > selected.startFrame && frame < selected.startFrame + selected.frameCount);
  }
  function move(delta: number) {
    const target = composition.layers[layerIndex + delta];
    if (selected && target && !busy) onCommand({ action: "move-clip", clipId: selected.id, targetLayerId: target.id, startFrame: selected.startFrame });
  }
  return <Timeline {...timeline} clipTools={{ busy, selected: Boolean(selected), canUncut,
    canMoveUp: layerIndex > 0, canMoveDown: layerIndex >= 0 && layerIndex < composition.layers.length - 1,
    canCut: (time, range) => points(time, range).length > 0,
    onCut: (time, range) => { if (selected && !busy) onCommand({ action: "cut-clip", clipId: selected.id, atFrames: points(time, range) }); },
    onUncut: () => { if (selected && !busy) onCommand({ action: "uncut-clip", clipId: selected.id }); },
    onDelete: () => { if (selected && !busy) { onCommand({ action: "delete-clip", clipId: selected.id }); setSelectedId(null); } },
    onReset: () => { if (!busy) { onCommand({ action: "reset-composition" }); setSelectedId(null); } },
    onMoveUp: () => move(-1), onMoveDown: () => move(1),
  }} layerContent={(time, viewport) => <VoiceLayerTimeline composition={composition} outputs={outputs} projectId={projectId}
    viewport={viewport} busy={busy} onCommand={onCommand} playheadSeconds={time} selectedClipId={selectedId} onSelectClip={setSelectedId} />} />;
}

export function VoiceCompositionTimeline({ composition, ...props }: Omit<Props, "composition"> & { composition: VoiceComposition | null }) {
  if (composition) return <LayeredTimeline {...props} composition={composition} />;
  const { outputs: _outputs, projectId: _projectId, busy: _busy, onCommand: _command, ...timeline } = props;
  return <Timeline {...timeline} />;
}
