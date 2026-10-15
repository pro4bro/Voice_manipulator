import { useEffect, useRef, type PointerEvent } from "react";
import { mapStretchTime, stretchFromDrag, type StretchOperation, type VoiceEditController } from "../../domain/voice-edits";
import type { WordSelection } from "../../domain/word-selection";
import type { SelectionRange } from "../../domain/production-selection";

interface Props {
  controller: VoiceEditController;
  ranges: SelectionRange[];
  selection: WordSelection;
  onSelectionChange?: (selection: WordSelection) => void;
  duration: number;
  canvasWidth: number;
  onSuspend: () => void;
  onPrepare?: (operation: StretchOperation) => void;
  onRevert?: () => void;
  onComplete?: (samePreview: boolean) => void;
}

export function StretchHandles({ controller, ranges, selection, onSelectionChange, duration, canvasWidth, onSuspend, onPrepare, onRevert, onComplete }: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  const current = useRef(controller); current.current = controller;
  useEffect(() => () => { cleanup.current?.(); current.current.cancel(); }, []);
  if (!controller.packet) return null;
  function begin(event: PointerEvent<HTMLButtonElement>, range: SelectionRange, edge: "left" | "right") {
    if (!event.ctrlKey || event.button !== 0 || current.current.busy) return;
    event.preventDefault(); event.stopPropagation(); onSuspend();
    const originX = event.clientX, baseline = selection, rate = controller.packet!.document.sampleRate;
    let operation: StretchOperation | null = null, timer = 0, inFlight = false, stopped = false;
    let lastPreview: StretchOperation | null = null;
    const publishSelection = (op: StretchOperation) => onSelectionChange?.({ ...baseline,
      ranges: ranges.map((r) => ({ ...r, start: mapStretchTime(r.start, op, rate), end: mapStretchTime(r.end, op, rate) })) });
    async function preview() {
      if (stopped || inFlight || !operation) return;
      const request = operation; inFlight = true;
      onPrepare?.(request);
      const accepted = await current.current.preview(request);
      inFlight = false;
      if (!stopped && request === operation && accepted) { lastPreview = request; publishSelection(request); }
      if (!stopped && !accepted) onRevert?.();
      if (!stopped && request !== operation) timer = window.setTimeout(() => void preview(), 180);
    }
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      operation = stretchFromDrag(range.start, range.end, (e.clientX - originX) * duration / Math.max(1, canvasWidth), edge, rate);
      window.clearTimeout(timer); timer = window.setTimeout(() => void preview(), 180);
    };
    const remove = () => {
      stopped = true; window.clearTimeout(timer);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", escape);
      cleanup.current = null;
    };
    const cancel = () => { remove(); onRevert?.(); current.current.cancel(); onSelectionChange?.(baseline); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    const finish = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const final = operation; remove();
      if (final) { if (final !== lastPreview) onPrepare?.(final); void current.current.commit(final).then((accepted) => { if (accepted) { publishSelection(final); onComplete?.(final === lastPreview); } else { onRevert?.(); onSelectionChange?.(baseline); } }); }
      else { onRevert?.(); current.current.cancel(); }
    };
    cleanup.current = cancel;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", escape);
  }
  return <>
    {ranges.map((range) => <div className="stretch-handles" key={range.id} style={{ left: `${range.start / duration * 100}%`, width: `${(range.end - range.start) / duration * 100}%` }}>
      {(["left", "right"] as const).map((edge) => <button key={edge} type="button" className={`stretch-handle is-${edge}`} aria-label={`Giãn vùng ${range.id} từ ${edge === "left" ? "đầu" : "cuối"}`} title="Ctrl + kéo để đổi thời lượng; đầu khối giữ vị trí, phần sau tự dịch" onPointerDown={(e) => begin(e, range, edge)}>↔</button>)}
    </div>)}
  </>;
}
